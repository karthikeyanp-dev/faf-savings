import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
import { Badge } from "@/components/ui/badge";
import {
  formatINR,
  getCurrentFY,
  calculatePoolBalance,
  calculateMemberNet,
  calculateFYTarget,
  getOpeningBalance,
  getTotalOpeningBalance,
} from "@/utils/financialYear";
import type { AppConfig, MemberDoc, TransactionDoc } from "@/types";
import { Wallet, Landmark, ArrowDownRight, CalendarCheck, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  StaggerContainer,
  StaggerItem,
} from "@/components/animations/PageTransition";
import { cn } from "@/lib/utils";

// Summary Stat Card
function SummaryCard({
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
      <CardContent className="p-4">
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
}

// Mobile Member Card (non-interactive, display only)
function MemberCard({
  member,
  net,
  receivable,
  fyDeposited,
  fyTarget,
  openingBalance,
}: {
  member: MemberDoc;
  net: number;
  receivable: number;
  fyDeposited: number;
  fyTarget: number;
  openingBalance: number;
}) {
  const progressPct =
    fyTarget > 0
      ? Math.min(100, Math.round((fyDeposited / fyTarget) * 100))
      : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
              member.active
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{member.name}</p>
            <Badge
              variant={member.active ? "default" : "secondary"}
              className="text-[10px]"
            >
              {member.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-border">
          <div>
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
            <p className="text-xs text-muted-foreground">Balance</p>
          </div>
          <div>
            <p className="text-lg font-bold">{formatINR(receivable)}</p>
            <p className="text-xs text-muted-foreground">Outstanding</p>
          </div>
          <div>
            <p className="text-lg font-bold">{formatINR(openingBalance)}</p>
            <p className="text-xs text-muted-foreground">Opening Bal</p>
          </div>
          <div>
            <p className="text-lg font-bold">{formatINR(fyDeposited)}</p>
            <p className="text-xs text-muted-foreground">FY Deposited</p>
          </div>
        </div>

        {/* Full-width FY Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">FY Progress</p>
            <p className="text-xs font-medium">
              {formatINR(fyDeposited)} / {formatINR(fyTarget)}
            </p>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
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
        </div>
      </CardContent>
    </Card>
  );
}

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

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "transactions"));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TransactionDoc,
      );
    },
  });

  if (configLoading || membersLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const activeTransactions = transactions.filter((t) => t.status === "active");
  const fyTransactions = activeTransactions.filter((t) => t.fy === currentFY);
  const openingBalances = config?.openingBalances;
  const totalOpeningBalance = getTotalOpeningBalance(openingBalances);
  const openingInterest = config?.openingInterest ?? 0;
  const availableBalance = calculatePoolBalance(
    activeTransactions,
    totalOpeningBalance,
    openingInterest,
  );

  const totalDeposited = activeTransactions
    .filter((t) => t.type === "deposit")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalInterest = activeTransactions
    .filter((t) => t.type === "interest")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalReceivables = members.reduce((sum, member) => {
    const net = calculateMemberNet(
      activeTransactions.map((t) => ({ ...t, memberId: t.memberId })),
      member.id,
      getOpeningBalance(openingBalances, member.id),
    );
    return sum + Math.max(0, -net);
  }, 0);
  const fyDeposited = fyTransactions
    .filter((t) => t.type === "deposit")
    .reduce((sum, t) => sum + t.amount, 0);

  const summaryCards = [
    {
      title: "Total Deposited",
      value: formatINR(totalDeposited),
      icon: Landmark,
      subtitle: "Lifetime",
      iconBg: "bg-emerald-500",
    },
    ...(totalOpeningBalance !== 0
      ? [
          {
            title: "Opening Balances",
            value: formatINR(totalOpeningBalance),
            icon: Wallet,
            subtitle: "From previous FYs",
            iconBg: "bg-purple-500",
          },
        ]
      : []),
    ...(totalInterest !== 0
      ? [
          {
            title: "Interest Earned",
            value: formatINR(totalInterest),
            icon: TrendingUp,
            subtitle: "Pool interest income",
            iconBg: "bg-amber-500",
          },
        ]
      : []),
    {
      title: "Outstanding Dues",
      value: formatINR(totalReceivables),
      icon: ArrowDownRight,
      subtitle: "Amount owed by members",
      iconBg: "bg-rose-500",
    },
    {
      title: `FY ${currentFY} Deposits`,
      value: formatINR(fyDeposited),
      icon: CalendarCheck,
      subtitle: `Target: ${formatINR(fyTarget * members.filter((m) => m.active).length)}`,
      iconBg: "bg-violet-500",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Available Balance - Full Width Banner */}
        <motion.div
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
                  <p className="text-white/50 text-xs mt-2">
                    Pool funds ready for use
                  </p>
                </div>
                <div className="p-3.5 bg-white/15 rounded-2xl backdrop-blur-sm">
                  <Wallet className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Summary Stats */}
        <section>
          <div
            className={`grid grid-cols-1 ${summaryCards.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3`}
          >
            {summaryCards.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.07, duration: 0.35 }}
              >
                <SummaryCard {...stat} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* Members Section */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-lg font-semibold">Members</h2>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/members")}
              className="text-sm text-primary font-medium"
            >
              View All
            </motion.button>
          </div>

          {/* Mobile: Card List */}
          <StaggerContainer className="lg:hidden space-y-3">
            {members.map((member) => {
              const net = calculateMemberNet(
                activeTransactions.map((t) => ({ ...t, memberId: t.memberId })),
                member.id,
                getOpeningBalance(openingBalances, member.id),
              );
              const receivable = Math.max(0, -net);
              const memberOb = getOpeningBalance(openingBalances, member.id);
              const memberFyDeposited = fyTransactions
                .filter((t) => t.memberId === member.id && t.type === "deposit")
                .reduce((sum, t) => sum + t.amount, 0);

              return (
                <StaggerItem key={member.id}>
                  <MemberCard
                    member={member}
                    net={net}
                    receivable={receivable}
                    fyDeposited={memberFyDeposited}
                    fyTarget={fyTarget}
                    openingBalance={memberOb}
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
                    <TableHead className="text-right">Opening Bal</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">FY Deposited</TableHead>
                    <TableHead className="text-right">FY Target</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const net = calculateMemberNet(
                      activeTransactions.map((t) => ({
                        ...t,
                        memberId: t.memberId,
                      })),
                      member.id,
                      getOpeningBalance(openingBalances, member.id),
                    );
                    const receivable = Math.max(0, -net);
                    const memberOb = getOpeningBalance(openingBalances, member.id);
                    const memberFyDeposited = fyTransactions
                      .filter(
                        (t) => t.memberId === member.id && t.type === "deposit",
                      )
                      .reduce((sum, t) => sum + t.amount, 0);
                    const progressPct =
                      fyTarget > 0
                        ? Math.min(
                            100,
                            Math.round((memberFyDeposited / fyTarget) * 100),
                          )
                        : 0;

                    return (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.name}
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
                        <TableCell className="text-right">
                          {memberOb !== 0 ? formatINR(memberOb) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatINR(receivable)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatINR(memberFyDeposited)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatINR(fyTarget)}
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
                        <TableCell>
                          <Badge
                            variant={member.active ? "default" : "secondary"}
                          >
                            {member.active ? "Active" : "Inactive"}
                          </Badge>
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
