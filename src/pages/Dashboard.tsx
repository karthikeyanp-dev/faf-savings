import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getAllActiveTransactions,
  getTransactionsByFY,
  statsRef,
} from "@/lib/firestore";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  formatINR,
  getCurrentFY,
  calculateFYTarget,
  getOpeningBalance,
} from "@/utils/financialYear";
import type {
  AppConfig,
  MemberDoc,
  StatsCurrent,
  TransactionDoc,
} from "@/types";
import {
  Wallet,
  Landmark,
  ArrowDownRight,
  CalendarRange,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Percent,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { m } from "framer-motion";
import {
  StaggerContainer,
  StaggerItem,
} from "@/components/animations/PageTransition";
import { cn } from "@/lib/utils";

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
  interests,
}: {
  fy: string;
  deposited: number;
  withdrawn: number;
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

// Mobile Member Card (non-interactive, display only)
// Memoized so updates to one member (e.g. deposit) do not re-render
// every other member card. With 50+ members this is the most visible
// win on the dashboard.
const MemberCard = memo(function MemberCard({
  member,
  net,
  receivable,
  previousBal,
  fyDeposited,
  fyWithdrawn,
  fyTarget,
}: {
  member: MemberDoc;
  net: number;
  receivable: number;
  previousBal: number;
  fyDeposited: number;
  fyWithdrawn: number;
  fyTarget: number;
}) {
  const fyNetBalance = fyDeposited - fyWithdrawn;
  const progressPct =
    fyTarget > 0
      ? Math.max(0, Math.min(100, Math.round((fyNetBalance / fyTarget) * 100)))
      : 0;

  return (
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
          <p
            className={cn(
              "text-lg font-bold shrink-0",
              net >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {formatINR(net)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-border">
          <div>
            <p className="text-base font-bold text-muted-foreground/60">
              {previousBal !== 0 ? formatINR(previousBal) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Previous Bal</p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-base font-bold",
                receivable > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground/60",
              )}
            >
              {formatINR(receivable)}
            </p>
            <p className="text-xs text-muted-foreground">Outstanding</p>
          </div>
          <div>
            <p
              className={cn(
                "text-base font-bold",
                fyDeposited > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground/60",
              )}
            >
              {formatINR(fyDeposited)}
            </p>
            <p className="text-xs text-muted-foreground">FY Deposit</p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-base font-bold",
                fyWithdrawn > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground/60",
              )}
            >
              {formatINR(fyWithdrawn)}
            </p>
            <p className="text-xs text-muted-foreground">FY Withdrawn</p>
          </div>
        </div>

        {/* Full-width FY Progress */}
        <div className="mt-3">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">FY Progress</p>
            <p className="text-xs text-muted-foreground">
              {formatINR(fyNetBalance)} / {formatINR(fyTarget)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export function DashboardPage() {
  const navigate = useNavigate();
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

  // Bounded transaction queries: lifetime balances need a member-agnostic view,
  // and FY-specific cards need just the current FY.
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", "all-active"],
    queryFn: async () => {
      const snap = await getDocs(getAllActiveTransactions());
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TransactionDoc,
      );
    },
  });

  const { data: fyTransactions = [] } = useQuery({
    queryKey: ["transactions", "fy", currentFY],
    queryFn: async () => {
      const snap = await getDocs(getTransactionsByFY(currentFY));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TransactionDoc,
      );
    },
  });

  // All-time totals come from the stats doc so we never sum client-side.
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const snap = await getDoc(statsRef);
      return snap.data() as StatsCurrent | undefined;
    },
  });

  // Hooks must run on every render and in the same order, so the
  // memberStats / memberNetByMember useMemos live BEFORE the loading
  // early-return below. They produce empty maps when their source data
  // is still loading, which is fine.
  const memberStats = useMemo(() => {
    // One pass over fyTransactions. Per-member running totals for
    // deposits, withdrawals, returns, and interest. The plan's
    // {dep, wd, ret, int} shape.
    const map = new Map<
      string,
      { dep: number; wd: number; ret: number; int: number }
    >();
    for (const t of fyTransactions) {
      if (!t.memberId) continue;
      const s = map.get(t.memberId) ?? { dep: 0, wd: 0, ret: 0, int: 0 };
      if (t.type === "deposit") s.dep += t.amount;
      else if (t.type === "withdrawal") s.wd += t.amount;
      else if (t.type === "return") s.ret += t.amount;
      else if (t.type === "interest") s.int += t.amount;
      map.set(t.memberId, s);
    }
    return map;
  }, [fyTransactions]);

  const memberNetByMember = useMemo(() => {
    // Lifetime net per member (used for the per-member Balance column).
    // Computed in one pass over all active transactions, then seeded with
    // opening balances from config.
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (!t.memberId) continue;
      const prev = map.get(t.memberId) ?? 0;
      if (t.type === "deposit" || t.type === "return") {
        map.set(t.memberId, prev + t.amount);
      } else if (t.type === "withdrawal") {
        map.set(t.memberId, prev - t.amount);
      }
    }
    if (config?.openingBalances) {
      for (const [memberId, amount] of Object.entries(config.openingBalances)) {
        map.set(memberId, (map.get(memberId) ?? 0) + amount);
      }
    }
    // Ensure every member has an entry (default 0) so the JSX is uniform.
    for (const m of members) {
      if (!map.has(m.id)) map.set(m.id, 0);
    }
    return map;
  }, [transactions, members, config?.openingBalances]);

  if (configLoading || membersLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const openingBalances = config?.openingBalances;
  const openingInterest = config?.openingInterest ?? 0;

  // All-time totals are sourced from the stats doc; the transactions
  // list is only used for the per-member cards (where we still need each
  // member's lifetime net movement).
  const availableBalance = stats?.poolBalance ?? 0;
  const totalInterest = stats?.totalInterest ?? 0;
  const totalReceivables = members.reduce((sum, member) => {
    const net = memberNetByMember.get(member.id) ?? 0;
    return sum + Math.max(0, -net);
  }, 0);
  const totalDepositsAllTime = stats?.totalDeposit ?? 0;
  const fyDeposited = fyTransactions
    .filter((t) => t.type === "deposit")
    .reduce((sum, t) => sum + t.amount, 0);
  const fyWithdrawn = fyTransactions
    .filter((t) => t.type === "withdrawal")
    .reduce((sum, t) => sum + t.amount, 0);
  const fyInterest = fyTransactions
    .filter((t) => t.type === "interest")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalInterestsEarned = totalInterest + openingInterest;

  const totalPoolFunds = totalDepositsAllTime + totalInterestsEarned;
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
      subtitle: "All inflows into the pool",
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
                deposited={fyDeposited}
                withdrawn={fyWithdrawn}
                interests={fyInterest}
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
              const net = memberNetByMember.get(member.id) ?? 0;
              const receivable = Math.max(0, -net);
              const stats = memberStats.get(member.id) ?? {
                dep: 0,
                wd: 0,
                ret: 0,
                int: 0,
              };
              const memberFyNetWithdrawn = Math.max(
                0,
                stats.wd - stats.ret,
              );

              return (
                <StaggerItem key={member.id}>
                  <MemberCard
                    member={member}
                    net={net}
                    receivable={receivable}
                    previousBal={memberOb}
                    fyDeposited={stats.dep}
                    fyWithdrawn={memberFyNetWithdrawn}
                    fyTarget={fyTarget}
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
                    const net = memberNetByMember.get(member.id) ?? 0;
                    const receivable = Math.max(0, -net);
                    const stats = memberStats.get(member.id) ?? {
                      dep: 0,
                      wd: 0,
                      ret: 0,
                      int: 0,
                    };
                    const memberFyNetWithdrawn = Math.max(
                      0,
                      stats.wd - stats.ret,
                    );
                    const memberFyNetBalance = stats.dep - memberFyNetWithdrawn;
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
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.name}
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
                            stats.dep > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {formatINR(stats.dep)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            memberFyNetWithdrawn > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {formatINR(memberFyNetWithdrawn)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            receivable > 0
                              ? "text-rose-600 dark:text-rose-400"
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
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}
