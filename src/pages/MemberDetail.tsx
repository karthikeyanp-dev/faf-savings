import { useQuery } from "@tanstack/react-query";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatINR,
  getCurrentFY,
  calculateMemberNet,
  calculateFYTarget,
  formatDate,
  getOpeningBalance,
} from "@/utils/financialYear";
import type { AppConfig, MemberDoc, TransactionDoc } from "@/types";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Wallet,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  StaggerContainer,
  StaggerItem,
} from "@/components/animations/PageTransition";
import { cn } from "@/lib/utils";

const txTypeConfig = {
  deposit: { label: "Deposit", color: "bg-green-500", icon: ArrowUpRight },
  withdrawal: {
    label: "Withdrawal",
    color: "bg-orange-500",
    icon: ArrowDownRight,
  },
  return: { label: "Return", color: "bg-blue-500", icon: RotateCcw },
  opening_balance: {
    label: "Previous Balance",
    color: "bg-purple-500",
    icon: Wallet,
  },
  interest: {
    label: "Interest",
    color: "bg-amber-500",
    icon: TrendingUp,
  },
};

function TransactionRow({ tx }: { tx: TransactionDoc }) {
  const config = txTypeConfig[tx.type] || txTypeConfig.deposit;
  const Icon = config.icon;
  const isActive = tx.status === "active";

  return (
    <Card className={cn(!isActive && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-xl", config.color)}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">{config.label}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(tx.date)}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "font-bold",
                tx.type === "withdrawal"
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-green-600 dark:text-green-400",
              )}
            >
              {tx.type === "withdrawal" ? "-" : "+"}
              {formatINR(tx.amount)}
            </p>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className="text-[10px]"
            >
              {tx.status}
            </Badge>
          </div>
        </div>

        {tx.savingsMonth && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {tx.savingsMonth}
            </span>
          </div>
        )}

        {tx.notes && (
          <p className="text-xs text-muted-foreground mt-2">{tx.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentFY = getCurrentFY();
  const fyTarget = calculateFYTarget(currentFY);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "members"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberDoc);
    },
  });

  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "transactions"));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TransactionDoc,
      );
    },
  });

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "config", "app"));
      return snap.data() as AppConfig;
    },
  });

  if (membersLoading || transactionsLoading || configLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const member = members.find((m) => m.id === id);
  if (!member) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Member not found</p>
          <button
            onClick={() => navigate("/members")}
            className="text-primary font-medium mt-2 text-sm"
          >
            Back to Members
          </button>
        </div>
      </AppLayout>
    );
  }

  const activeTransactions = transactions.filter((t) => t.status === "active");
  const fyTransactions = activeTransactions.filter((t) => t.fy === currentFY);
  const openingBalances = config?.openingBalances;
  const openingBalance = getOpeningBalance(openingBalances, member.id);

  const net = calculateMemberNet(
    activeTransactions.map((t) => ({ ...t, memberId: t.memberId })),
    member.id,
    openingBalance,
  );
  const receivable = Math.max(0, -net);
  const totalDeposit = activeTransactions
    .filter((t) => t.memberId === member.id && t.type === "deposit")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalReturn = activeTransactions
    .filter((t) => t.memberId === member.id && t.type === "return")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawal = activeTransactions
    .filter((t) => t.memberId === member.id && t.type === "withdrawal")
    .reduce((sum, t) => sum + t.amount, 0);
  const fyDeposited = fyTransactions
    .filter((t) => t.memberId === member.id && t.type === "deposit")
    .reduce((sum, t) => sum + t.amount, 0);
  const progressPct =
    fyTarget > 0
      ? Math.min(100, Math.round((fyDeposited / fyTarget) * 100))
      : 0;

  // All transactions for this member, sorted by date descending
  const memberTransactions = transactions
    .filter((t) => t.memberId === member.id && t.type !== "opening_balance")
    .sort((a, b) => b.date.toMillis() - a.date.toMillis());

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate("/members")}
            className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </motion.button>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold",
                member.active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{member.name}</h1>
              <Badge
                variant={member.active ? "default" : "secondary"}
                className="text-[10px]"
              >
                {member.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card
            className={cn(
              "border-0 shadow-md",
              net >= 0
                ? "bg-gradient-to-br from-emerald-600 to-emerald-500"
                : "bg-gradient-to-br from-rose-600 to-rose-500",
            )}
          >
            <CardContent className="p-5">
              <p className="text-white/70 text-sm font-medium">
                Current Balance
              </p>
              <p className="text-3xl font-extrabold text-white mt-1">
                {formatINR(net)}
              </p>
              <p className="text-white/50 text-xs mt-1">
                {net >= 0 ? "In credit" : "Outstanding dues"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {openingBalance !== 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 }}
            >
              <Card className="h-full border-purple-200 dark:border-purple-800">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-purple-600 dark:text-purple-400">
                    Previous Balance
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatINR(openingBalance)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    From previous FYs
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card className="h-full">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Total Deposited
                </p>
                <p className="text-lg font-bold mt-1">
                  {formatINR(totalDeposit)}
                </p>
                <p className="text-[11px] text-muted-foreground">Current FY</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="h-full">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Outstanding
                </p>
                <p className="text-lg font-bold mt-1">
                  {formatINR(receivable)}
                </p>
                <p className="text-[11px] text-muted-foreground">Amount owed</p>
              </CardContent>
            </Card>
          </motion.div>
          {totalReturn > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Returns
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatINR(totalReturn)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Received</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
          {totalWithdrawal > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
            >
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Withdrawals
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatINR(totalWithdrawal)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Taken out</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {/* FY Progress */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">FY {currentFY} Progress</p>
                <p className="text-sm font-medium">
                  {formatINR(fyDeposited)} / {formatINR(fyTarget)}
                </p>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden mt-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    progressPct >= 100
                      ? "bg-emerald-500"
                      : progressPct >= 50
                        ? "bg-blue-500"
                        : "bg-amber-500",
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  {progressPct}% of target
                </p>
                <p className="text-xs text-muted-foreground">
                  {progressPct >= 100
                    ? "Target reached!"
                    : `${formatINR(fyTarget - fyDeposited)} remaining`}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Transaction History */}
        <section>
          <h2 className="text-lg font-semibold mb-3 px-1">
            Transaction History
          </h2>
          <StaggerContainer className="space-y-3">
            {memberTransactions.map((tx) => (
              <StaggerItem key={tx.id}>
                <TransactionRow tx={tx} />
              </StaggerItem>
            ))}
          </StaggerContainer>

          {memberTransactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No transactions found</p>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
