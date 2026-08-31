import { memo, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAllActiveTransactions, getTransactionsByMember } from "@/lib/firestore";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  formatINR,
  getCurrentFY,
  calculateFYTarget,
  getOpeningBalance,
  buildMemberTotalsMap,
  emptyMemberTotals,
  computePoolFYStats,
  computePoolTotals,
  getTotalOpeningBalance,
  normalizeTransactionType,
} from "@/utils/financialYear";
import type { AppConfig, MemberDoc, TransactionDoc } from "@/types";
import {
  Wallet,
  Landmark,
  ArrowDownRight,
  CalendarRange,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Percent,
  RotateCcw,
  LogIn,
  CircleDollarSign,
  HandCoins,
  Check,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { m } from "framer-motion";
import {
  StaggerContainer,
  StaggerItem,
} from "@/components/animations/PageTransition";
import { cn } from "@/lib/utils";
import { KpiTile } from "@/components/ui/kpi-tile";

// Summary Stat Card. Wrapped in React.memo so unrelated parent state
// (search input, dialog toggles, sibling re-renders) does not re-render
// every summary card on each keystroke.
const SummaryCard = memo(function SummaryCard({
  title,
  value,
  icon: Icon,
  subtitle,
  iconBg,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  iconBg: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-4 h-full flex flex-col justify-center">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl", iconBg)}>
            <Icon className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {title}
            </p>
            <p className="text-lg font-bold truncate">{value}</p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// FY Stats Card (highlighted) — 3 rows: Deposited, Withdrawn, Interests.
// Memoized so updates to one of the four summary cards do not re-render
// this one (and vice versa).
const FYStatsCard = memo(function FYStatsCard({
  fy,
  deposited,
  withdrawn,
  repaid,
  borrowed,
  payout,
  interests,
}: {
  fy: string;
  deposited: number;
  withdrawn: number;
  repaid: number;
  borrowed: number;
  payout: number;
  interests: number;
}) {
  const rows = [
    {
      label: "Deposited",
      value: deposited,
      icon: ArrowDownToLine,
      tint: "text-emerald-200",
    },
    {
      label: "Withdrawn",
      value: withdrawn,
      icon: ArrowUpFromLine,
      tint: "text-rose-200",
    },
    {
      label: "Repaid",
      value: repaid,
      icon: RotateCcw,
      tint: "text-blue-200",
    },
    {
      label: "Borrowed",
      value: borrowed,
      icon: ArrowUpFromLine,
      tint: "text-red-200",
    },
    {
      label: "Payout",
      value: payout,
      icon: ArrowUpFromLine,
      tint: "text-indigo-200",
    },
    {
      label: "Interests",
      value: interests,
      icon: Percent,
      tint: "text-amber-200",
    },
  ];

  return (
    <Card
      className="h-full border-0 shadow-lg shadow-black/20 text-white"
      style={{ backgroundColor: "#046565" }}
    >
      <CardContent className="p-4 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-xl bg-white/15 backdrop-blur-sm">
            <CalendarRange className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              Current FY Stats
            </p>
            <p className="text-xs font-bold text-white truncate">{fy}</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-between gap-1.5">
          {rows.map((row) => {
            const RowIcon = row.icon;
            return (
              <div
                key={row.label}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <RowIcon className={cn("h-3.5 w-3.5", row.tint)} />
                  <span className="text-xs text-white/80 truncate">
                    {row.label}
                  </span>
                </div>
                <span className="text-sm font-bold text-white truncate">
                  {formatINR(row.value)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});

// Mobile Member Card — tappable to navigate to member detail.
// Memoized so updates to one member (e.g. deposit) do not re-render
// every other member card. With 50+ members this is the most visible
// win on the dashboard.
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
  const progressPct =
    fyTarget > 0
      ? Math.max(0, Math.min(100, Math.round((fyNetBalance / fyTarget) * 100)))
      : 0;

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
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  member.active
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {member.name.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold truncate">{member.name}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <p
                className={cn(
                  "text-lg font-bold",
                  net >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
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
              value={previousBal !== 0 ? formatINR(previousBal) : "—"}
              valueClassName="text-muted-foreground/60"
            />
            <KpiTile
              icon={CircleDollarSign}
              label="Outstanding"
              value={formatINR(receivable)}
              valueClassName={
                receivable > 0 ? "text-foreground" : "text-muted-foreground/60"
              }
            />
            <KpiTile
              icon={HandCoins}
              label="Borrowed"
              value={formatINR(borrowed)}
              valueClassName={
                borrowed > 0 ? "text-foreground" : "text-muted-foreground/60"
              }
            />
            <KpiTile
              icon={Check}
              label="Repaid"
              value={formatINR(repaid)}
              valueClassName={
                repaid > 0 ? "text-foreground" : "text-muted-foreground/60"
              }
            />
            <KpiTile
              icon={ArrowDownToLine}
              label="FY Deposit"
              value={formatINR(fyDeposited)}
              valueClassName={
                fyDeposited > 0 ? "text-foreground" : "text-muted-foreground/60"
              }
            />
            <KpiTile
              icon={ArrowUpFromLine}
              label="FY Withdrawn"
              value={formatINR(fyWithdrawn)}
              valueClassName={
                fyWithdrawn > 0 ? "text-foreground" : "text-muted-foreground/60"
              }
            />
          </div>

          {/* Full-width FY Progress, styled like the KPI tiles */}
          <div className="mt-2 rounded-xl bg-muted/60 p-2.5">
            <div className="h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  progressPct >= 100
                    ? "bg-emerald-500"
                    : progressPct >= 50
                      ? "bg-blue-500"
                      : "bg-amber-500",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] font-medium text-muted-foreground">
                FY Progress
              </p>
              <p className="text-[10px] font-medium text-muted-foreground">
                {formatINR(fyNetBalance)} / {formatINR(fyTarget)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
});

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentFY = getCurrentFY();
  const fyTarget = calculateFYTarget(currentFY);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "config", "app"));
      return snap.data() as AppConfig;
    },
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "members"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberDoc);
    },
  });

  // One unbounded read of every active transaction serves both the lifetime
  // per-member KPIs and the current-FY cards (the FY rows are a subset), so
  // there is no separate by-FY query to keep in sync. Shared with the
  // Members page through the ['transactions','all-active'] cache key.
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["transactions", "all-active"],
    queryFn: async () => {
      const snap = await getDocs(getAllActiveTransactions());
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TransactionDoc,
      );
    },
  });

  // Hooks must run on every render and in the same order, so these useMemos
  // live BEFORE the loading early-return below. They produce empty results
  // when their source data is still loading, which is fine.
  //
  // Per-member lifetime and current-FY figures in a single pass, from the
  // shared helper the Members page, MemberDetail and the add-transaction
  // dialog also use.
  const memberTotals = useMemo(
    () =>
      buildMemberTotalsMap(
        transactions,
        members.map((m) => m.id),
        config?.openingBalances,
        currentFY,
      ),
    [transactions, members, config?.openingBalances, currentFY],
  );

  const poolFYStats = useMemo(
    () => computePoolFYStats(transactions, currentFY),
    [transactions, currentFY],
  );

  // Pool-level lifetime figures come from the same ledger as the member
  // cards, not from stats/current — see computePoolTotals().
  const poolTotals = useMemo(
    () =>
      computePoolTotals(
        transactions,
        getTotalOpeningBalance(config?.openingBalances),
        config?.openingInterest ?? 0,
      ),
    [transactions, config?.openingBalances, config?.openingInterest],
  );

  // Prefetch a member's transaction history on hover/focus so the detail
  // page renders instantly on tap, matching the Members page behavior.
  const prefetchMember = useCallback(
    (memberId: string) => {
      queryClient.prefetchQuery({
        queryKey: ["transactions", "member", memberId],
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

  // Stable handler factory so memoized cards don't re-render when a
  // sibling's onClick identity changes.
  const goToMember = useCallback(
    (memberId: string) => navigate(`/members/${memberId}`),
    [navigate],
  );

  // Every figure on this page (banner, FY card, member rows, receivables) is
  // now derived from the transaction list, so painting before it resolves
  // would show opening-balance-only numbers that then jump.
  if (configLoading || membersLoading || transactionsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const openingBalances = config?.openingBalances;

  const availableBalance = poolTotals.balance;

  // Column totals for the table footer, in one pass over the same map the
  // rows read, so the footer can never disagree with the column above it.
  // Every member id was seeded into the map, so `.get()` is always defined.
  const columnTotals = members.reduce(
    (acc, member) => {
      const memberOb = getOpeningBalance(openingBalances, member.id);
      const s = memberTotals.get(member.id) ?? emptyMemberTotals(memberOb);
      acc.previousBal += memberOb;
      acc.net += s.net;
      acc.fyDeposited += s.fyDeposited;
      acc.fyWithdrawn += s.fyWithdrawn;
      acc.fyNetBalance += s.fyNetBalance;
      acc.borrowed += s.borrowed;
      acc.outstanding += s.outstanding;
      return acc;
    },
    {
      previousBal: 0,
      net: 0,
      fyDeposited: 0,
      fyWithdrawn: 0,
      fyNetBalance: 0,
      borrowed: 0,
      outstanding: 0,
    },
  );
  const totalReceivables = columnTotals.outstanding;

  // Pool-wide savings progress: everyone's FY net against everyone's target.
  const totalFYTarget = fyTarget * members.length;
  const totalProgressPct =
    totalFYTarget > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((columnTotals.fyNetBalance / totalFYTarget) * 100),
          ),
        )
      : 0;
  const totalDepositsAllTime = poolTotals.deposited;
  const totalInterestsEarned = poolTotals.interest;

  // Everything the pool owns: cash on hand plus what members still owe it.
  // Using lifetime deposits as the denominator would exceed 100% whenever
  // repayments outrun the borrows on record (legacy 'return' rows do).
  const totalPoolFunds = availableBalance + totalReceivables;
  const availablePercentage =
    totalPoolFunds > 0
      ? Math.round((availableBalance / totalPoolFunds) * 100)
      : 0;

  const interestPercentage =
    totalDepositsAllTime > 0
      ? Number(((totalInterestsEarned / totalDepositsAllTime) * 100).toFixed(1))
      : 0;

  const summaryCards = [
    {
      title: "Total Deposited",
      value: formatINR(totalDepositsAllTime),
      icon: Landmark,
      subtitle: "Previous balances + all deposits",
      iconBg: "bg-emerald-500",
    },
    {
      title: "Total Outstanding",
      value: formatINR(totalReceivables),
      icon: ArrowDownRight,
      subtitle: "Current dues from members",
      iconBg: "bg-rose-500",
    },
    {
      title: "Total Interests Earned",
      value: formatINR(totalInterestsEarned),
      icon: TrendingUp,
      subtitle: `${interestPercentage}% of total deposited`,
      iconBg: "bg-amber-500",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Available Balance - Full Width Banner */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 border-0 shadow-lg shadow-indigo-500/25">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium tracking-wide uppercase">
                    Available Balance
                  </p>
                  <p className="text-3xl sm:text-4xl font-extrabold mt-2 text-white tracking-tight">
                    {formatINR(availableBalance)}
                  </p>
                  <p className="text-white/50 text-xs mt-2 font-medium">
                    {availablePercentage}% of Total Funds
                  </p>
                </div>
                <div className="p-3.5 bg-white/15 rounded-2xl backdrop-blur-sm">
                  <Wallet className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </m.div>

        {/* Summary Stats */}
        <section>
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`}
          >
            <m.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.35 }}
            >
              <FYStatsCard
                fy={currentFY}
                deposited={poolFYStats.deposited}
                withdrawn={poolFYStats.withdrawn}
                repaid={poolFYStats.repaid}
                borrowed={poolFYStats.borrowed}
                payout={poolFYStats.payout}
                interests={poolFYStats.interest}
              />
            </m.div>
            {summaryCards.map((stat, index) => (
              <m.div
                key={stat.title}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.17 + index * 0.07, duration: 0.35 }}
              >
                <SummaryCard {...stat} />
              </m.div>
            ))}
          </div>
        </section>

        {/* Members Section */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-lg font-semibold">Members</h2>
            <m.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/members")}
              className="text-sm text-primary font-medium"
            >
              View All
            </m.button>
          </div>

          {/* Mobile: Card List */}
          <StaggerContainer className="lg:hidden space-y-3">
            {members.map((member) => {
              const memberOb = getOpeningBalance(openingBalances, member.id);
              const s =
                memberTotals.get(member.id) ?? emptyMemberTotals(memberOb);

              return (
                <StaggerItem key={member.id}>
                  <MemberCard
                    member={member}
                    net={s.net}
                    receivable={s.outstanding}
                    borrowed={s.borrowed}
                    repaid={s.repaid}
                    previousBal={memberOb}
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
                    <TableHead className="text-right">FY Deposited</TableHead>
                    <TableHead className="text-right">FY Withdrawn</TableHead>
                    <TableHead className="text-right">Borrowed</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const memberOb = getOpeningBalance(
                      openingBalances,
                      member.id,
                    );
                    const s =
                      memberTotals.get(member.id) ?? emptyMemberTotals(memberOb);
                    const net = s.net;
                    const receivable = s.outstanding;
                    const borrowedTotal = s.borrowed;
                    const memberFyNetBalance = s.fyNetBalance;
                    const progressPct =
                      fyTarget > 0
                        ? Math.max(
                            0,
                            Math.min(
                              100,
                              Math.round(
                                (memberFyNetBalance / fyTarget) * 100,
                              ),
                            ),
                          )
                        : 0;

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
                          {memberOb !== 0 ? formatINR(memberOb) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            net >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {formatINR(net)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            s.fyDeposited > 0
                              ? "text-foreground"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {formatINR(s.fyDeposited)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            s.fyWithdrawn > 0
                              ? "text-foreground"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {formatINR(s.fyWithdrawn)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            borrowedTotal > 0
                              ? "text-foreground"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {formatINR(borrowedTotal)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            receivable > 0
                              ? "text-foreground"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {formatINR(receivable)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  progressPct >= 100
                                    ? "bg-emerald-500"
                                    : progressPct >= 50
                                      ? "bg-blue-500"
                                      : "bg-amber-500",
                                )}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8">
                              {progressPct}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="font-semibold">
                      Total
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {members.length}{" "}
                        {members.length === 1 ? "member" : "members"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground/60">
                      {columnTotals.previousBal !== 0
                        ? formatINR(columnTotals.previousBal)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-bold",
                        columnTotals.net >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {formatINR(columnTotals.net)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatINR(columnTotals.fyDeposited)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatINR(columnTotals.fyWithdrawn)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatINR(columnTotals.borrowed)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatINR(columnTotals.outstanding)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-background rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              totalProgressPct >= 100
                                ? "bg-emerald-500"
                                : totalProgressPct >= 50
                                  ? "bg-blue-500"
                                  : "bg-amber-500",
                            )}
                            style={{ width: `${totalProgressPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">
                          {totalProgressPct}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}
