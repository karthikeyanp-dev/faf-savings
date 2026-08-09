import { memo, useCallback, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllActiveTransactions, getTransactionsByMember } from '@/lib/firestore';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatINR,
  getCurrentFY,
  calculateFYTarget,
  normalizeTransactionType,
  buildMemberTotalsMap,
  emptyMemberTotals,
  getOpeningBalance,
} from '@/utils/financialYear';
import type { AppConfig, MemberDoc, TransactionDoc } from '@/types';
import { Search, Filter, X, ChevronRight, CircleDollarSign, HandCoins, Check, ArrowDownToLine, ArrowUpFromLine, LogIn } from 'lucide-react';
import { StaggerContainer, StaggerItem } from '@/components/animations/PageTransition';
import { Input } from '@/components/ui/input';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';
import { KpiTile } from '@/components/ui/kpi-tile';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';

// Mobile Member Card - tappable to navigate to member detail.
// Wrapped in React.memo so search/filter input changes do not re-render
// every member card. With 50+ members this is the biggest cost.
const MemberCard = memo(function MemberCard({
  member,
  net,
  receivable,
  borrowed,
  repaid,
  previousBal,
  fyDeposited,
  fyWithdrawn,
  fyNetBalance,
  fyTarget,
  onClick,
  onPrefetch,
}: {
  member: MemberDoc;
  net: number;
  receivable: number;
  borrowed: number;
  repaid: number;
  previousBal: number;
  fyDeposited: number;
  fyWithdrawn: number;
  fyNetBalance: number;
  fyTarget: number;
  onClick: () => void;
  onPrefetch: () => void;
}) {
  // fyNetBalance comes from the shared helper (deposits − withdrawals −
  // payouts) rather than being recomputed here, so a payout can't leave the
  // bar at 100% next to a zeroed balance.
  const progressPct = fyTarget > 0 ? Math.max(0, Math.min(100, Math.round((fyNetBalance / fyTarget) * 100))) : 0;

  return (
    <m.div
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="w-full cursor-pointer"
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
    >
      {/* Same layout as the Dashboard member card, plus the chevron
          affordance for the tap-through to the member detail page. */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                  member.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}
              >
                {member.name.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold truncate">{member.name}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <p
                className={cn(
                  'text-lg font-bold',
                  net >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {formatINR(net)}
              </p>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border">
            <KpiTile
              icon={LogIn}
              label="Previous Bal"
              value={previousBal !== 0 ? formatINR(previousBal) : '—'}
              valueClassName="text-muted-foreground/60"
            />
            <KpiTile
              icon={CircleDollarSign}
              label="Outstanding"
              value={formatINR(receivable)}
              valueClassName={receivable > 0 ? 'text-foreground' : 'text-muted-foreground/60'}
            />
            <KpiTile
              icon={HandCoins}
              label="Borrowed"
              value={formatINR(borrowed)}
              valueClassName={borrowed > 0 ? 'text-foreground' : 'text-muted-foreground/60'}
            />
            <KpiTile
              icon={Check}
              label="Repaid"
              value={formatINR(repaid)}
              valueClassName={repaid > 0 ? 'text-foreground' : 'text-muted-foreground/60'}
            />
            <KpiTile
              icon={ArrowDownToLine}
              label="FY Deposit"
              value={formatINR(fyDeposited)}
              valueClassName={fyDeposited > 0 ? 'text-foreground' : 'text-muted-foreground/60'}
            />
            <KpiTile
              icon={ArrowUpFromLine}
              label="FY Withdrawn"
              value={formatINR(fyWithdrawn)}
              valueClassName={fyWithdrawn > 0 ? 'text-foreground' : 'text-muted-foreground/60'}
            />
          </div>

          {/* Full-width FY Progress, styled like the KPI tiles */}
          <div className="mt-2 rounded-xl bg-muted/60 p-2.5">
            <div className="h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] font-medium text-muted-foreground">FY Progress</p>
              <p className="text-[10px] font-medium text-muted-foreground">{formatINR(fyNetBalance)} / {formatINR(fyTarget)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
});

export function MembersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const currentFY = getCurrentFY();
  const fyTarget = calculateFYTarget(currentFY);

  // Prefetch a member's transaction history on hover/focus. By the
  // time the user actually taps through, the query is usually already
  // cached and the detail page shows instantly.
  const prefetchMember = useCallback(
    (memberId: string) => {
      queryClient.prefetchQuery({
        queryKey: ['transactions', 'member', memberId],
        queryFn: async () => {
          const snap = await getDocs(getTransactionsByMember(memberId));
          return snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              // Must match MemberDetail's queryFn: normalize legacy
              // 'return' -> 'repayment' or the cached rows render with
              // the deposit fallback label.
              type: normalizeTransactionType(data.type as string),
            } as TransactionDoc;
          });
        },
      });
    },
    [queryClient],
  );

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'members'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberDoc));
    },
  });

  // One unbounded read of every active transaction covers both the lifetime
  // and current-FY figures (FY rows are a subset), and shares the Dashboard's
  // cache entry — so visiting both pages costs a single Firestore query.
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'all-active'],
    queryFn: async () => {
      const snap = await getDocs(getAllActiveTransactions());
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionDoc));
    },
  });

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'config', 'app'));
      return snap.data() as AppConfig;
    },
  });

  const openingBalances = config?.openingBalances;

  // Per-member lifetime + current-FY figures in a single pass, from the
  // shared helper the Dashboard, MemberDetail and the add-transaction dialog
  // also use, so the same concept always shows the same number.
  const memberTotals = useMemo(
    () =>
      buildMemberTotalsMap(
        transactions,
        members.map((m) => m.id),
        openingBalances,
        currentFY,
      ),
    [transactions, members, openingBalances, currentFY],
  );

  // Filter members
  const filteredMembers = members
    .filter((m) => {
      if (statusFilter === 'active') return m.active;
      if (statusFilter === 'inactive') return !m.active;
      return true;
    })
    .filter((m) =>
      searchQuery === '' || m.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  // Stable handler factory so memoized cards don't re-render when a
  // sibling's onClick identity changes.
  const goToMember = useCallback(
    (memberId: string) => navigate(`/members/${memberId}`),
    [navigate],
  );

  // Same gate as the Dashboard: every KPI on the cards and rows is derived
  // from the transaction list plus config, so rendering before both resolve
  // shows opening-balance-only figures that then jump.
  if (membersLoading || transactionsLoading || configLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Search and Filter Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
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
            title="Filter Members"
            trigger={
              <Button variant="outline" size="icon" className="shrink-0">
                <Filter className="h-4 w-4" />
              </Button>
            }
          >
            <div className="space-y-4">
              <p className="text-sm font-medium">Status</p>
              <div className="space-y-2">
                {(['all', 'active', 'inactive'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-xl transition-colors',
                      statusFilter === status
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    )}
                  >
                    <span className="capitalize font-medium">{status}</span>
                    {statusFilter === status && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    )}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => {
                  setStatusFilter('all');
                  setFilterOpen(false);
                }}
              >
                Reset Filters
              </Button>
            </div>
          </BottomSheet>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground px-1">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        </p>

        {/* Mobile: Card List */}
        <StaggerContainer className="lg:hidden space-y-3">
          {filteredMembers.map((member) => {
            const s =
              memberTotals.get(member.id) ??
              emptyMemberTotals(openingBalances?.[member.id] ?? 0);
            return (
              <StaggerItem key={member.id}>
                <MemberCard
                  member={member}
                  net={s.net}
                  receivable={s.outstanding}
                  borrowed={s.borrowed}
                  repaid={s.repaid}
                  previousBal={openingBalances?.[member.id] ?? 0}
                  fyDeposited={s.fyDeposited}
                  fyWithdrawn={s.fyWithdrawn}
                  fyNetBalance={s.fyNetBalance}
                  fyTarget={fyTarget}
                  onClick={() => goToMember(member.id)}
                  onPrefetch={() => prefetchMember(member.id)}
                />
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        {/* Desktop: Table */}
        <Card className="hidden lg:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right text-muted-foreground/60">
                    Previous Bal
                  </TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Borrowed</TableHead>
                  <TableHead className="text-right">Repaid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">FY Deposited</TableHead>
                  <TableHead className="text-right">FY Target</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const s =
                    memberTotals.get(member.id) ??
                    emptyMemberTotals(openingBalances?.[member.id] ?? 0);
                  const net = s.net;
                  const receivable = s.outstanding;
                  const borrowedTotal = s.borrowed;
                  const memberFyNetBalance = s.fyNetBalance;
                  const progressPct = fyTarget > 0 ? Math.max(0, Math.min(100, Math.round((memberFyNetBalance / fyTarget) * 100))) : 0;

                  return (
                    <TableRow
                      key={member.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => goToMember(member.id)}
                      onMouseEnter={() => prefetchMember(member.id)}
                    >
                      <TableCell className="font-medium">
                        <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                          {member.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground/60">
                        {getOpeningBalance(openingBalances, member.id) !== 0
                          ? formatINR(getOpeningBalance(openingBalances, member.id))
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-semibold',
                          net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {formatINR(net)}
                      </TableCell>
                      <TableCell className="text-right">{formatINR(borrowedTotal)}</TableCell>
                      <TableCell className="text-right">{formatINR(s.repaid)}</TableCell>
                      <TableCell className="text-right">{formatINR(receivable)}</TableCell>
                      <TableCell className="text-right">{formatINR(s.fyDeposited)}</TableCell>
                      <TableCell className="text-right">{formatINR(fyTarget)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                              )}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">{progressPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.active ? 'default' : 'secondary'}>
                          {member.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Empty State */}
        {filteredMembers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No members found</p>
            <Button
              variant="link"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
