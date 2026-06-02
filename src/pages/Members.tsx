import { memo, useCallback, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllActiveTransactions, getTransactionsByFY, getTransactionsByMember } from '@/lib/firestore';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatINR,
  getCurrentFY,
  calculateFYTarget,
} from '@/utils/financialYear';
import type { AppConfig, MemberDoc, TransactionDoc } from '@/types';
import { Search, Filter, X, ChevronRight } from 'lucide-react';
import { StaggerContainer, StaggerItem } from '@/components/animations/PageTransition';
import { Input } from '@/components/ui/input';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';

// Mobile Member Card - tappable to navigate to member detail.
// Wrapped in React.memo so search/filter input changes do not re-render
// every member card. With 50+ members this is the biggest cost.
const MemberCard = memo(function MemberCard({
  member,
  net,
  receivable,
  fyDeposited,
  fyWithdrawn,
  fyTarget,
  onClick,
  onPrefetch,
}: {
  member: MemberDoc;
  net: number;
  receivable: number;
  fyDeposited: number;
  fyWithdrawn: number;
  fyTarget: number;
  onClick: () => void;
  onPrefetch: () => void;
}) {
  const fyNetBalance = fyDeposited - fyWithdrawn;
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
      <Card className="bg-muted/30 hover:bg-muted/50 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
                member.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {member.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                  {member.name}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-border">
            <div>
              <p className={cn(
                'text-lg font-bold',
                net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              )}>
                {formatINR(net)}
              </p>
              <p className="text-xs text-muted-foreground">Balance</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{formatINR(receivable)}</p>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
            <div>
              <p className="text-lg font-bold">{formatINR(fyDeposited)}</p>
              <p className="text-xs text-muted-foreground">FY Deposited</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{formatINR(fyWithdrawn)}</p>
              <p className="text-xs text-muted-foreground">FY Withdrawn</p>
            </div>
          </div>

          {/* Full-width FY Progress */}
          <div className="mt-3">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">FY Progress</p>
              <p className="text-xs text-muted-foreground">{formatINR(fyNetBalance)} / {formatINR(fyTarget)}</p>
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
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TransactionDoc);
        },
      });
    },
    [queryClient],
  );

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'members'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberDoc));
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', 'all-active'],
    queryFn: async () => {
      const snap = await getDocs(getAllActiveTransactions());
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionDoc));
    },
  });

  const { data: fyTransactions = [] } = useQuery({
    queryKey: ['transactions', 'fy', currentFY],
    queryFn: async () => {
      const snap = await getDocs(getTransactionsByFY(currentFY));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionDoc));
    },
  });

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'config', 'app'));
      return snap.data() as AppConfig;
    },
  });

  const activeTransactions = transactions;
  const openingBalances = config?.openingBalances;

  // Per-member FY aggregates. One pass over fyTransactions keyed by
  // memberId, so each card/row can do an O(1) lookup instead of repeating
  // a 4-pass filter().reduce() inside the JSX.
  const memberStats = useMemo(() => {
    const map = new Map<
      string,
      { dep: number; wd: number; ret: number; int: number }
    >();
    for (const t of fyTransactions) {
      if (!t.memberId) continue;
      const s = map.get(t.memberId) ?? { dep: 0, wd: 0, ret: 0, int: 0 };
      const type = (t as any).type === 'return' ? 'repayment' : t.type;
      if (type === 'deposit') s.dep += t.amount;
      else if (type === 'withdrawal') s.wd += t.amount;
      else if (type === 'repayment') s.ret += t.amount;
      else if (type === 'interest') s.int += t.amount;
      map.set(t.memberId, s);
    }
    return map;
  }, [fyTransactions]);

  // Lifetime net per member, including opening balances. The previous
  // implementation called calculateMemberNet() per row which iterated the
  // full transaction list 50 times.
  const memberNetByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of activeTransactions) {
      if (!t.memberId) continue;
      const prev = map.get(t.memberId) ?? 0;
      const type = (t as any).type === 'return' ? 'repayment' : t.type;
      if (type === 'deposit' || type === 'repayment') {
        map.set(t.memberId, prev + t.amount);
      } else if (type === 'withdrawal' || type === 'borrow' || type === 'payout') {
        map.set(t.memberId, prev - t.amount);
      }
    }
    if (openingBalances) {
      for (const [memberId, amount] of Object.entries(openingBalances)) {
        map.set(memberId, (map.get(memberId) ?? 0) + amount);
      }
    }
    for (const m of members) {
      if (!map.has(m.id)) map.set(m.id, 0);
    }
    return map;
  }, [activeTransactions, members, openingBalances]);

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
            const net = memberNetByMember.get(member.id) ?? 0;
            const receivable = Math.max(0, -net);
            const stats = memberStats.get(member.id) ?? {
              dep: 0,
              wd: 0,
              ret: 0,
              int: 0,
            };
            return (
              <StaggerItem key={member.id}>
                <MemberCard
                  member={member}
                  net={net}
                  receivable={receivable}
                  fyDeposited={stats.dep}
                  fyWithdrawn={stats.wd}
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
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">FY Deposited</TableHead>
                  <TableHead className="text-right">FY Target</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const net = memberNetByMember.get(member.id) ?? 0;
                  const receivable = Math.max(0, -net);
                  const stats = memberStats.get(member.id) ?? {
                    dep: 0,
                    wd: 0,
                    ret: 0,
                    int: 0,
                  };
                  const memberFyNetWithdrawn = Math.max(0, stats.wd - stats.ret);
                  const memberFyNetBalance = stats.dep - memberFyNetWithdrawn;
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
                      <TableCell
                        className={cn(
                          'text-right font-semibold',
                          net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {formatINR(net)}
                      </TableCell>
                      <TableCell className="text-right">{formatINR(receivable)}</TableCell>
                      <TableCell className="text-right">{formatINR(stats.dep)}</TableCell>
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
