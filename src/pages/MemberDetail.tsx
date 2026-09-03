import { memo, useMemo, useState, useCallback, useEffect, Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTransactionsByMember, membersRef } from "@/lib/firestore";
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
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import {
  formatINR,
  getCurrentFY,
  calculateFYTarget,
  formatDate,
  getOpeningBalance,
  normalizeTransactionType,
  parseFY,
  formatSavingsMonth,
  computeMemberTotals,
} from "@/utils/financialYear";
import type { AppConfig, MemberDoc, TransactionDoc } from "@/types";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Wallet,
  TrendingUp,
  Pencil,
  Undo2,
  Calendar,
  Ban,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";

// Maintainer-only dialogs: defer their form code (zod, react-hook-form)
// until the user actually opens one.
const EditTransactionDialog = lazy(() =>
  import("@/components/transactions/EditTransactionDialog").then((mod) => ({
    default: mod.EditTransactionDialog,
  })),
);
const VoidTransactionDialog = lazy(() =>
  import("@/components/transactions/VoidTransactionDialog").then((mod) => ({
    default: mod.VoidTransactionDialog,
  })),
);

const txTypeConfig = {
  deposit: { label: "Deposit", color: "bg-green-500", icon: ArrowUpRight },
  withdrawal: { label: "Withdrawal", color: "bg-orange-500", icon: ArrowDownRight },
  repayment: { label: "Repayment", color: "bg-blue-500", icon: RotateCcw },
  borrow: { label: "Borrow", color: "bg-red-500", icon: ArrowDownRight },
  payout: { label: "Payout", color: "bg-indigo-500", icon: Wallet },
  opening_balance: { label: "Previous FY Balance", color: "bg-purple-500", icon: Wallet },
  interest: { label: "Interest", color: "bg-amber-500", icon: TrendingUp },
};

// Transaction history row. Memoized so unrelated parent state changes
// (e.g. opening balance editing) do not re-render every history row.
const TransactionRow = memo(function TransactionRow({
  tx,
  isMaintainer,
  onEdit,
  onVoid,
}: {
  tx: TransactionDoc;
  isMaintainer: boolean;
  onEdit: (tx: TransactionDoc) => void;
  onVoid: (tx: TransactionDoc) => void;
}) {
  // Normalize before lookup so legacy 'return' rows (e.g. from a
  // prefetch that skipped normalization) never fall back to Deposit.
  const txType = normalizeTransactionType(tx.type);
  const config = txTypeConfig[txType] || txTypeConfig.deposit;
  const Icon = config.icon;
  const isActive = tx.status === "active";
  // Outflows (and negative carried-over balances) render as -amount in
  // orange; everything else as +amount in green. Uses the normalized type
  // so a row that skipped normalization can't be signed the wrong way.
  const isOutflow =
    txType === "withdrawal" || txType === "borrow" || txType === "payout";
  const signedAmount = isOutflow ? -tx.amount : tx.amount;

  return (
    <TableRow
      className={cn(
        !isActive &&
          "bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200/90 shadow-[inset_4px_0_0_0_rgb(244,63,94)]",
      )}
    >
      <TableCell className="py-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-1.5 rounded-lg shrink-0",
              isActive ? config.color : "bg-slate-300 dark:bg-slate-700",
            )}
          >
            {isActive ? (
              <Icon className="h-3.5 w-3.5 text-white" />
            ) : (
              <Ban className="h-3.5 w-3.5 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{config.label}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(tx.date)}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {tx.type === "deposit" && tx.savingsMonth && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full w-fit">
              {formatSavingsMonth(tx.savingsMonth, "short")}
            </span>
          )}
          {!isActive && tx.voidReason ? (
            <p
              className="text-xs text-rose-700 dark:text-rose-300/90 italic truncate max-w-[240px]"
              title={`Reason: ${tx.voidReason}`}
            >
              <span className="font-semibold not-italic">Reason:</span>{" "}
              {tx.voidReason}
            </p>
          ) : tx.notes ? (
            <p className="text-xs text-muted-foreground truncate max-w-[240px]">
              {tx.notes}
            </p>
          ) : null}
        </div>
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-semibold whitespace-nowrap",
          !isActive
            ? "text-muted-foreground line-through decoration-rose-500 decoration-2"
            : signedAmount < 0
              ? "text-orange-600 dark:text-orange-400"
              : "text-green-600 dark:text-green-400",
        )}
      >
        {signedAmount < 0 ? "-" : "+"}
        {formatINR(Math.abs(signedAmount))}
      </TableCell>
      <TableCell className="text-right">
        {isActive ? (
          <Badge variant="default" className="text-[10px]">
            active
          </Badge>
        ) : (
          <Badge
            variant="destructive"
            className="text-[10px] inline-flex items-center gap-1"
          >
            <Ban className="h-3 w-3" />
            Voided
          </Badge>
        )}
      </TableCell>
      {isMaintainer && (
        <TableCell className="text-right">
          {isActive && tx.type !== "opening_balance" && (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(tx)}
                aria-label="Edit transaction"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onVoid(tx)}
                aria-label="Revert transaction"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </TableCell>
      )}
    </TableRow>
  );
});

// Mobile transaction card. Deliberately mirrors the Activity page card so
// the two histories read as the same object on a phone; the table above is
// desktop-only. Memoized for the same reason as TransactionRow.
const TransactionCard = memo(function TransactionCard({
  tx,
  isMaintainer,
  onEdit,
  onVoid,
}: {
  tx: TransactionDoc;
  isMaintainer: boolean;
  onEdit: (tx: TransactionDoc) => void;
  onVoid: (tx: TransactionDoc) => void;
}) {
  const txType = normalizeTransactionType(tx.type);
  const config = txTypeConfig[txType] || txTypeConfig.deposit;
  const Icon = config.icon;
  const isActive = tx.status === "active";
  const isOutflow =
    txType === "withdrawal" || txType === "borrow" || txType === "payout";
  const signedAmount = isOutflow ? -tx.amount : tx.amount;
  // Opening balance rows are derived, not user-entered: never editable.
  const canModify = isMaintainer && isActive && tx.type !== "opening_balance";

  return (
    <Card
      className={cn(
        "overflow-hidden",
        !isActive &&
          "border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "p-2 rounded-xl shrink-0",
                isActive ? config.color : "bg-slate-300 dark:bg-slate-700",
              )}
            >
              {isActive ? (
                <Icon className="h-4 w-4 text-white" />
              ) : (
                <Ban className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-semibold">{config.label}</p>
                {!isActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-300 px-1.5 py-0.5 rounded">
                    <Ban className="h-2.5 w-2.5" />
                    Voided
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p
              className={cn(
                "font-bold text-lg whitespace-nowrap",
                !isActive
                  ? "text-muted-foreground line-through decoration-rose-500 decoration-2"
                  : signedAmount < 0
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-green-600 dark:text-green-400",
              )}
            >
              {signedAmount < 0 ? "-" : "+"}
              {formatINR(Math.abs(signedAmount))}
            </p>
          </div>
        </div>

        {/* Void reason — only meaningful for voided transactions */}
        {!isActive && tx.voidReason && (
          <p className="mt-2.5 text-xs text-rose-700 dark:text-rose-300/90 italic line-clamp-2">
            <span className="font-semibold not-italic">Reason:</span>{" "}
            {tx.voidReason}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDate(tx.date)}</span>
          </div>
          {/* Savings month only means something for deposits; legacy
              borrow/repayment docs may carry stale values. */}
          {tx.type === "deposit" && tx.savingsMonth && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {formatSavingsMonth(tx.savingsMonth, "short")}
            </span>
          )}

          {/* Negative vertical margin lets the 28px tap targets overhang the
              20px text line instead of setting the row height. */}
          {canModify && (
            <div className="ml-auto -my-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onEdit(tx)}
                aria-label="Edit transaction"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onVoid(tx)}
                aria-label="Revert transaction"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/20"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {tx.notes && (
          <p className="text-sm text-muted-foreground mt-2">{tx.notes}</p>
        )}
      </CardContent>
    </Card>
  );
});

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isMaintainer } = useAuth();
  const currentFY = getCurrentFY();
  const fyTarget = calculateFYTarget(currentFY);

  // Reset scroll position when navigating to (or between) member detail
  // pages, so a tap on a card at the bottom of the home page does not
  // leave the detail view scrolled to the footer.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [id]);

  const [editingTx, setEditingTx] = useState<TransactionDoc | null>(null);
  const [voidingTx, setVoidingTx] = useState<TransactionDoc | null>(null);

  // Stable setters so memoized history rows keep stable onEdit/onVoid props.
  const openEditDialog = useCallback((tx: TransactionDoc) => setEditingTx(tx), []);
  const openVoidDialog = useCallback((tx: TransactionDoc) => setVoidingTx(tx), []);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const snap = await getDocs(membersRef);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberDoc);
    },
  });

  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["transactions", "member", id],
    queryFn: async () => {
      if (!id) return [] as TransactionDoc[];
      const snap = await getDocs(getTransactionsByMember(id));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // Normalize legacy 'return' -> 'repayment' so history rows
          // show the correct label/icon instead of the deposit fallback.
          type: normalizeTransactionType(data.type),
        } as TransactionDoc;
      });
    },
    enabled: !!id,
  });

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "config", "app"));
      return snap.data() as AppConfig;
    },
  });

  const openingBalance = getOpeningBalance(config?.openingBalances, id ?? "");

  // All member KPIs come from the shared helper so Dashboard, Members and
  // this page can never drift apart on formulas.
  const stats = useMemo(
    () => computeMemberTotals(transactions, openingBalance, currentFY),
    [transactions, openingBalance, currentFY],
  );

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  const member = memberById.get(id ?? "");

  // History shows every member transaction across all FYs (including
  // pre-FY dated entries), plus a synthetic "Previous FY Balance" row
  // anchored at the start of the opening-balance FY so the ledger reads
  // from the carried-over position. Re-sorted client-side because of the
  // synthetic row (server query is already date-desc).
  const memberTransactions = useMemo(() => {
    const rows = transactions.filter((t) => t.type !== "opening_balance");
    if (openingBalance !== 0 && id) {
      const fy = config?.openingBalanceFY ?? currentFY;
      const stamp = Timestamp.fromDate(parseFY(fy).start);
      rows.push({
        id: `opening-balance-${id}`,
        type: "opening_balance",
        memberId: id,
        amount: openingBalance,
        date: stamp,
        fy,
        notes: "Previous FY balance",
        status: "active",
        createdByUid: "system",
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
    return rows.sort((a, b) => b.date.toMillis() - a.date.toMillis());
  }, [transactions, openingBalance, config?.openingBalanceFY, currentFY, id]);

  if (membersLoading || transactionsLoading || configLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

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

  const net = stats.net;
  const receivable = stats.outstanding;
  // FY-scoped so this card always equals the "FY Deposited" figure the
  // Dashboard and Members pages show for the same member (its subtitle
  // is "Current FY").
  const totalDeposit = stats.fyDeposited;
  const totalRepaid = stats.repaid;
  const totalWithdrawal = stats.withdrawn;
  const totalPaidOut = stats.paidOut;
  const totalBorrow = stats.borrowed;
  const fyNetBalance = stats.fyNetBalance;
  const progressPct =
    fyTarget > 0
      ? Math.max(0, Math.min(100, Math.round((fyNetBalance / fyTarget) * 100)))
      : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <m.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate("/members")}
            className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </m.button>
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
        <m.div
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
        </m.div>

        {/* Stats Grid: single row on desktop, responsive grid below */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:flex lg:gap-3">
          {openingBalance !== 0 && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 }}
              className="lg:flex-1"
            >
              <Card className="h-full border-purple-200 dark:border-purple-800 opacity-50">
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
            </m.div>
          )}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="lg:flex-1"
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
          </m.div>
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:flex-1"
          >
            <Card className="h-full">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Outstanding
                </p>
                <p className="text-lg font-bold mt-1">
                  {formatINR(receivable)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Amount owed · lifetime
                </p>
              </CardContent>
            </Card>
          </m.div>
          {totalRepaid > 0 && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="lg:flex-1"
            >
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Repaid
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatINR(totalRepaid)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Repayments · lifetime
                  </p>
                </CardContent>
              </Card>
            </m.div>
          )}
          {totalWithdrawal > 0 && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="lg:flex-1"
            >
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Withdrawals
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatINR(totalWithdrawal)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Taken out · lifetime
                  </p>
                </CardContent>
              </Card>
            </m.div>
          )}
          {/* Payouts drain savings like a withdrawal but are a separate
              concept (full settlement), and the pool FY card tracks them
              separately — so they get their own tile instead of inflating
              the Withdrawals figure. */}
          {totalPaidOut > 0 && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="lg:flex-1"
            >
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Paid Out
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatINR(totalPaidOut)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Balance settlements · lifetime
                  </p>
                </CardContent>
              </Card>
            </m.div>
          )}
          {totalBorrow > 0 && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="lg:flex-1"
            >
              <Card className="h-full">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Borrowed
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatINR(totalBorrow)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    From pool, to repay · lifetime
                  </p>
                </CardContent>
              </Card>
            </m.div>
          )}
        </div>

        {/* FY Progress */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">FY {currentFY} Progress</p>
                <p className="text-sm font-medium">
                  {formatINR(fyNetBalance)} / {formatINR(fyTarget)}
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
                    : `${formatINR(Math.max(0, fyTarget - fyNetBalance))} remaining`}
                </p>
              </div>
            </CardContent>
          </Card>
        </m.div>

        {/* Transaction History */}
        <section>
          <h2 className="text-lg font-semibold mb-3 px-1">
            Transaction History
          </h2>
          {memberTransactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No transactions found</p>
            </div>
          ) : (
            <>
              {/* Mobile: card list matching the Activity page */}
              <div className="md:hidden space-y-3">
                {memberTransactions.map((tx) => (
                  <TransactionCard
                    key={tx.id}
                    tx={tx}
                    isMaintainer={isMaintainer}
                    onEdit={openEditDialog}
                    onVoid={openVoidDialog}
                  />
                ))}
              </div>

              {/* Desktop: table */}
              <Card className="overflow-hidden hidden md:block">
                <div className="[&>div]:max-h-[70vh]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card [&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:bg-card">
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                        {isMaintainer && (
                          <TableHead className="text-right">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {memberTransactions.map((tx) => (
                        <TransactionRow
                          key={tx.id}
                          tx={tx}
                          isMaintainer={isMaintainer}
                          onEdit={openEditDialog}
                          onVoid={openVoidDialog}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </section>

        {/* Maintainer dialogs */}
        {editingTx && (
          <Suspense fallback={null}>
            <EditTransactionDialog
              transaction={editingTx}
              open
              onClose={() => setEditingTx(null)}
            />
          </Suspense>
        )}
        {voidingTx && (
          <Suspense fallback={null}>
            <VoidTransactionDialog
              transaction={voidingTx}
              open
              onClose={() => setVoidingTx(null)}
            />
          </Suspense>
        )}
      </div>
    </AppLayout>
  );
}
