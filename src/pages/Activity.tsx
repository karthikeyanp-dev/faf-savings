import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  Suspense,
  lazy,
  memo,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getDocs, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { getAllTransactions, membersRef } from '@/lib/firestore';
import { useAuth } from '@/providers/AuthProvider';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR, getCurrentFY } from '@/utils/financialYear';
import type { TransactionDoc, MemberDoc } from '@/types';
import { Search, Filter, X, ArrowUpRight, ArrowDownRight, RotateCcw, Wallet, Calendar, TrendingUp } from 'lucide-react';
import { m } from 'framer-motion';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// Maintainer-only dialogs: defer their form code (zod, react-hook-form)
// until the user actually opens one.
const EditTransactionDialog = lazy(() =>
  import('@/components/transactions/EditTransactionDialog').then((m) => ({
    default: m.EditTransactionDialog,
  })),
);
const VoidTransactionDialog = lazy(() =>
  import('@/components/transactions/VoidTransactionDialog').then((m) => ({
    default: m.VoidTransactionDialog,
  })),
);

// Transaction type config
const txTypeConfig = {
  deposit: { 
    label: 'Deposit', 
    color: 'bg-green-500', 
    icon: ArrowUpRight,
    badge: 'default' as const
  },
  withdrawal: { 
    label: 'Withdrawal', 
    color: 'bg-orange-500', 
    icon: ArrowDownRight,
    badge: 'destructive' as const
  },
  return: { 
    label: 'Return', 
    color: 'bg-blue-500', 
    icon: RotateCcw,
    badge: 'secondary' as const
  },
  opening_balance: {
    label: 'Previous',
    color: 'bg-purple-500', 
    icon: Wallet,
    badge: 'outline' as const
  },
  interest: { 
    label: 'Interest', 
    color: 'bg-amber-500', 
    icon: TrendingUp,
    badge: 'secondary' as const
  },
};

// Mobile Transaction Card. Memoized so a search keystroke or a
// Load-more click does not re-render every previously visible row.
const TransactionCard = memo(function TransactionCard({
  tx,
  memberName,
  onEdit,
  onVoid,
  isMaintainer,
}: {
  tx: TransactionDoc;
  memberName: string;
  onEdit: () => void;
  onVoid: () => void;
  isMaintainer: boolean;
}) {
  const config = txTypeConfig[tx.type] || txTypeConfig.deposit;
  const Icon = config.icon;
  const isActive = tx.status === 'active';

  return (
    <Card className={cn(!isActive && 'opacity-60')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-xl', config.color)}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold">{config.label}</p>
              <p className="text-sm text-muted-foreground">{memberName}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn(
              'font-bold text-lg',
              tx.type === 'withdrawal' ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'
            )}>
              {tx.type === 'withdrawal' ? '-' : '+'}{formatINR(tx.amount)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{format(tx.date.toDate(), 'MMM d, yyyy')}</span>
          </div>
          {tx.savingsMonth && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {tx.savingsMonth}
            </span>
          )}
        </div>

        {tx.notes && (
          <p className="text-sm text-muted-foreground mt-2">{tx.notes}</p>
        )}

        {isMaintainer && isActive && (
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" className="flex-1" onClick={onVoid}>
              Revert
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Filter Chip. Memoized so toggling one filter does not re-render the
// other 4-6 chips in the same row.
const FilterChip = memo(function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <m.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {label}
    </m.button>
  );
});

export function ActivityPage() {
  const { isMaintainer } = useAuth();
  const currentFY = getCurrentFY();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionDoc | null>(null);
  const [voidingTx, setVoidingTx] = useState<TransactionDoc | null>(null);

  // Filters
  const [fyFilter, setFyFilter] = useState<string>(currentFY);
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Stable setters that wrap setEditingTx / setVoidingTx so memoized
  // transaction cards receive stable onEdit / onVoid props.
  const openEditDialog = useCallback((tx: TransactionDoc) => setEditingTx(tx), []);
  const openVoidDialog = useCallback((tx: TransactionDoc) => setVoidingTx(tx), []);

  // Cursor-based pagination: each page is 50 transactions. The page index
  // becomes the cache key so a refetch on the same page is deduped, and
  // loading more creates a fresh page query.
  const [pageIndex, setPageIndex] = useState(0);
  const cursorsRef = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
  const [accumulated, setAccumulated] = useState<TransactionDoc[]>([]);

  const cursor = cursorsRef.current[pageIndex] ?? null;

  const { data: page = [], isLoading: pageLoading } = useQuery({
    queryKey: ['transactions', 'activity', pageIndex],
    queryFn: async () => {
      const snap = await getDocs(getAllTransactions(cursor ?? undefined));
      const docs = snap.docs;
      // Stash the last doc as the cursor for the next page.
      if (docs.length > 0) {
        if (cursorsRef.current.length <= pageIndex + 1) {
          cursorsRef.current = [...cursorsRef.current, docs[docs.length - 1]];
        }
      }
      return docs.map((d) => ({ id: d.id, ...d.data() } as TransactionDoc));
    },
  });

  // Accumulate pages as they arrive. React Query handles the per-page
  // dedup; this useEffect only appends new items.
  useEffect(() => {
    if (pageIndex === 0) {
      setAccumulated(page);
      return;
    }
    setAccumulated((prev) => {
      const existing = new Set(prev.map((t) => t.id));
      const fresh = page.filter((t) => !existing.has(t.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, [page, pageIndex]);

  const transactions = accumulated;
  const hasMore = page.length >= 50;
  const loadMore = () => {
    if (!hasMore) return;
    setPageIndex((i) => i + 1);
  };

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const snap = await getDocs(membersRef);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberDoc));
    },
  });

  // Lookup map for member name lookups. The filtered predicate and the
  // getMemberName helper both ran `members.find()` per row previously;
  // with 100+ rows this is 100+ array scans.
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  // Pre-attach the member name onto each transaction. This folds the
  // per-row `members.find()` lookup into a single pass and lets the
  // search filter below use the precomputed `memberName` field.
  // The result type extends TransactionDoc with the optional name.
  type TxWithMember = TransactionDoc & { memberName: string };

  const visibleTransactions = useMemo<TxWithMember[]>(
    () =>
      transactions
        .filter((t) => t.type !== 'opening_balance')
        .map((t) => ({
          ...t,
          memberName: t.memberId
            ? memberById.get(t.memberId)?.name ?? 'Unknown'
            : 'Unknown',
        })),
    [transactions, memberById],
  );

  const fys = useMemo(
    () => Array.from(new Set(visibleTransactions.map((t) => t.fy))).sort().reverse(),
    [visibleTransactions],
  );

  // Single fused pass: lowercased search once, all four filters in one
  // walk, sort by date desc at the end. The 4-pass version plus a
  // member-name lookup per row was the dominant cost on this page.
  const filtered = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return visibleTransactions
      .filter((t) => {
        if (fyFilter !== 'all' && t.fy !== fyFilter) return false;
        if (memberFilter !== 'all' && t.memberId !== memberFilter) return false;
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;
        if (searchLower) {
          if (
            t.memberName.toLowerCase().indexOf(searchLower) === -1 &&
            (!t.notes || t.notes.toLowerCase().indexOf(searchLower) === -1) &&
            t.type.toLowerCase().indexOf(searchLower) === -1
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => b.date.toMillis() - a.date.toMillis());
  }, [visibleTransactions, fyFilter, memberFilter, typeFilter, searchQuery]);

  const activeFiltersCount = [
    fyFilter !== 'all',
    memberFilter !== 'all',
    typeFilter !== 'all',
  ].filter(Boolean).length;

  // Virtualize both renderings of the filtered list. The mobile card list
  // has variable row height (notes, savings month, edit/void buttons), so
  // we measure dynamically. The desktop table rows are a fixed height
  // determined by the cell padding, so a static estimate is fine.
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const mobileVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => mobileScrollRef.current,
    estimateSize: () => 160,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <BottomSheet
            open={filterOpen}
            onOpenChange={setFilterOpen}
            title="Filter Transactions"
            trigger={
              <Button variant="outline" size="icon" className="relative shrink-0">
                <Filter className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            }
          >
            <div className="space-y-6">
              {/* FY Filter */}
              <div>
                <p className="text-sm font-medium mb-3">Financial Year</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="All"
                    active={fyFilter === 'all'}
                    onClick={() => setFyFilter('all')}
                  />
                  {fys.map((fy) => (
                    <FilterChip
                      key={fy}
                      label={`FY ${fy}`}
                      active={fyFilter === fy}
                      onClick={() => setFyFilter(fy)}
                    />
                  ))}
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <p className="text-sm font-medium mb-3">Transaction Type</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="All"
                    active={typeFilter === 'all'}
                    onClick={() => setTypeFilter('all')}
                  />
                  {Object.entries(txTypeConfig).map(([type, config]) => (
                    <FilterChip
                      key={type}
                      label={config.label}
                      active={typeFilter === type}
                      onClick={() => setTypeFilter(type)}
                    />
                  ))}
                </div>
              </div>

              {/* Member Filter */}
              <div>
                <p className="text-sm font-medium mb-3">Member</p>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  <FilterChip
                    label="All Members"
                    active={memberFilter === 'all'}
                    onClick={() => setMemberFilter('all')}
                  />
                  {members.map((m) => (
                    <FilterChip
                      key={m.id}
                      label={m.name}
                      active={memberFilter === m.id}
                      onClick={() => setMemberFilter(m.id)}
                    />
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setFyFilter('all');
                  setTypeFilter('all');
                  setMemberFilter('all');
                }}
              >
                Reset All Filters
              </Button>
            </div>
          </BottomSheet>
        </div>

        {/* Quick Filter Chips - Mobile */}
        <div className="lg:hidden -mx-4 px-4 py-2">
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 px-1">
            <FilterChip
              label="All FYs"
              active={fyFilter === 'all'}
              onClick={() => setFyFilter('all')}
            />
            <FilterChip
              label={`FY ${currentFY}`}
              active={fyFilter === currentFY}
              onClick={() => setFyFilter(currentFY)}
            />
            <FilterChip
              label="Deposits"
              active={typeFilter === 'deposit'}
              onClick={() => setTypeFilter(typeFilter === 'deposit' ? 'all' : 'deposit')}
            />
            <FilterChip
              label="Withdrawals"
              active={typeFilter === 'withdrawal'}
              onClick={() => setTypeFilter(typeFilter === 'withdrawal' ? 'all' : 'withdrawal')}
            />
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground px-1">
          {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
        </p>

        {/* Mobile: Virtualized Card List */}
        <div ref={mobileScrollRef} className="lg:hidden relative overflow-auto max-h-[75vh] -mx-4 px-4">
          <div
            style={{
              height: `${mobileVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {mobileVirtualizer.getVirtualItems().map((virtualRow) => {
              const tx = filtered[virtualRow.index];
              return (
                <div
                  key={tx.id}
                  data-index={virtualRow.index}
                  ref={mobileVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: '12px',
                  }}
                >
                  <TransactionCard
                    tx={tx}
                    memberName={tx.memberName}
                    onEdit={() => openEditDialog(tx)}
                    onVoid={() => openVoidDialog(tx)}
                    isMaintainer={isMaintainer}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Desktop: Virtualized Grid Table */}
        {/* CSS grid layout (instead of <table>) is required for the
            virtualization to play nicely: an absolutely-positioned row
            cannot read the column widths of a real <tbody>, so a
            table-based virtualizer collapses to a single column. The
            header and rows share an identical grid template. */}
        <Card className="hidden lg:block">
          <CardContent className="p-0">
            <div
              ref={tableScrollRef}
              className="relative overflow-auto max-h-[75vh]"
            >
              {/* Sticky header row */}
              <div
                className="sticky top-0 z-10 grid items-center gap-3 bg-card border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground"
                style={{
                  gridTemplateColumns:
                    '100px minmax(120px, 1fr) 120px 120px 110px minmax(120px, 1.4fr) 100px 140px',
                }}
              >
                <div>Date</div>
                <div>Member</div>
                <div>Type</div>
                <div className="text-right">Amount</div>
                <div>Month</div>
                <div>Notes</div>
                <div>Status</div>
                {isMaintainer && <div className="text-right">Actions</div>}
              </div>
              {/* Virtualized rows */}
              <div
                style={{
                  height: `${tableVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {tableVirtualizer.getVirtualItems().map((virtualRow) => {
                  const tx = filtered[virtualRow.index];
                  return (
                    <div
                      key={tx.id}
                      data-index={virtualRow.index}
                      className="grid items-center gap-3 px-4 border-b border-border/50 text-sm absolute left-0 right-0"
                      style={{
                        gridTemplateColumns:
                          '100px minmax(120px, 1fr) 120px 120px 110px minmax(120px, 1.4fr) 100px 140px',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="text-muted-foreground">
                        {tx.date.toDate().toLocaleDateString()}
                      </div>
                      <div className="font-medium truncate">{tx.memberName}</div>
                      <div>
                        <Badge
                          variant={txTypeConfig[tx.type]?.badge || 'default'}
                        >
                          {txTypeConfig[tx.type]?.label || tx.type}
                        </Badge>
                      </div>
                      <div className="text-right font-semibold">
                        {formatINR(tx.amount)}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {tx.savingsMonth || '-'}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {tx.notes || '-'}
                      </div>
                      <div>
                        <Badge variant={tx.status === 'active' ? 'default' : 'secondary'}>
                          {tx.status}
                        </Badge>
                      </div>
                      {isMaintainer && (
                        <div className="flex justify-end gap-2">
                          {tx.status === 'active' ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingTx(tx)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setVoidingTx(tx)}
                              >
                                Revert
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        {filtered.length === 0 && !pageLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No transactions found</p>
            <Button
              variant="link"
              onClick={() => {
                setSearchQuery('');
                setFyFilter('all');
                setTypeFilter('all');
                setMemberFilter('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        {/* Load More */}
        {hasMore && filtered.length > 0 && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={pageLoading}
            >
              {pageLoading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}

        {/* Dialogs */}
        {editingTx && (
          <Suspense fallback={null}>
            <EditTransactionDialog transaction={editingTx} open onClose={() => setEditingTx(null)} />
          </Suspense>
        )}
        {voidingTx && (
          <Suspense fallback={null}>
            <VoidTransactionDialog transaction={voidingTx} open onClose={() => setVoidingTx(null)} />
          </Suspense>
        )}
      </div>
    </AppLayout>
  );
}
