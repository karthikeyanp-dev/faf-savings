import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getAllActiveTransactions,
  getTransactionsByMember,
} from "@/lib/firestore";
import { createTransaction } from "@/lib/transactions";
import { cn, toDateInputValue } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { SavingsMonthPicker } from "@/components/ui/savings-month-picker";
import { createTransactionSchema } from "@/schemas";
import type { MemberDoc, TransactionDoc, AppConfig } from "@/types";
import { toast } from "sonner";
import { FullScreenDrawer } from "@/components/ui/bottom-sheet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCurrentSavingsMonth,
  buildMemberTotalsMap,
  computePoolTotals,
  getTotalOpeningBalance,
  normalizeTransactionType,
} from "@/utils/financialYear";

// Stable empty defaults: inline `= []` would create a new array identity on
// every render and feed memo/effect dependency loops.
const EMPTY_MEMBERS: MemberDoc[] = [];
const EMPTY_TRANSACTIONS: TransactionDoc[] = [];
const baseTransactionSchema = createTransactionSchema();

// Shared form content component
function TransactionFormContent({
  register,
  watch,
  setValue,
  errors,
  isSubmitting,
  members,
  onSubmit,
  onCancel,
  submitLabel = "Create",
  amountLimits,
  txType,
  repaymentBlocked,
  balancesLoading,
  isValid,
}: {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
  isSubmitting: boolean;
  members: MemberDoc[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel?: string;
  amountLimits: { poolBalance: number; memberSavings: number; totalOutstanding: number };
  txType: string;
  repaymentBlocked: boolean;
  balancesLoading: boolean;
  isValid: boolean;
}) {
  const selectedMemberId = watch("memberId");
  const errorBorder = "border-destructive focus-visible:ring-destructive/20 focus-visible:border-destructive";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label className="text-sm font-medium">Transaction Type</Label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {(["deposit", "repayment", "withdrawal", "borrow", "payout", "interest"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setValue("type", type, { shouldValidate: true, shouldDirty: true })}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                txType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        {errors.type && (
          <p className="text-sm text-destructive mt-1">{errors.type.message}</p>
        )}
      </div>

      {txType !== 'interest' && (
        <div>
          <Label className="text-sm font-medium">Member</Label>
          <Select
            value={watch("memberId")}
            onValueChange={(v) => setValue("memberId", v, { shouldValidate: true, shouldDirty: true })}
            className={cn(errors.memberId && errorBorder)}
          >
            <SelectItem value="">Select member...</SelectItem>
            {members
              .filter((m) => m.active)
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
          </Select>
          {errors.memberId && (
            <p className="text-sm text-destructive mt-1">
              {errors.memberId.message}
            </p>
          )}
        </div>
      )}

      <div>
        <Label className="text-sm font-medium">Amount (₹)</Label>
        <Input
          type="number"
          step="0.01"
          {...register("amount", { valueAsNumber: true })}
          className={cn("mt-1.5", errors.amount && errorBorder)}
          placeholder="0.00"
          readOnly={txType === 'payout'}
        />
        {errors.amount && (
          <p className="text-sm text-destructive mt-1">
            {errors.amount.message}
          </p>
        )}
        {/* While balances load the caps are unknown, so show that rather
            than a stale/zero figure the user might act on. */}
        {balancesLoading && (
          <p className="text-xs text-muted-foreground mt-1">
            Loading balance…
          </p>
        )}
        {!balancesLoading && txType === 'borrow' && amountLimits.poolBalance > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Max available: ₹{amountLimits.poolBalance.toLocaleString('en-IN')}
          </p>
        )}
        {!balancesLoading && txType === 'withdrawal' && selectedMemberId && (
          <p className="text-xs text-muted-foreground mt-1">
            Savings balance: ₹{amountLimits.memberSavings.toLocaleString('en-IN')}
          </p>
        )}
        {!balancesLoading && txType === 'payout' && selectedMemberId && (
          <p className="text-xs text-muted-foreground mt-1">
            Full balance will be paid out
          </p>
        )}
        {!balancesLoading && txType === 'repayment' && selectedMemberId && amountLimits.totalOutstanding > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Outstanding: ₹{amountLimits.totalOutstanding.toLocaleString('en-IN')}
          </p>
        )}
        {repaymentBlocked && (
          <p className="text-sm text-destructive mt-1">
            This member doesn&apos;t have any outstanding balance to repay
          </p>
        )}
      </div>

      <div>
        <Label className="text-sm font-medium">Date</Label>
        <Input
          type="date"
          className={cn("mt-1.5", errors.date && errorBorder)}
          {...register("date")}
        />
        {errors.date && (
          <p className="text-sm text-destructive mt-1">{errors.date.message}</p>
        )}
      </div>

      {(txType === "deposit" || txType === "return") && (
        <div>
          <Label className="text-sm font-medium">Savings Month</Label>
          <div className="mt-1.5">
            <SavingsMonthPicker
              value={watch("savingsMonth") || ""}
              onChange={(v) => setValue("savingsMonth", v, { shouldValidate: true })}
            />
          </div>
          {errors.savingsMonth && (
            <p className="text-sm text-destructive mt-1">
              {errors.savingsMonth.message}
            </p>
          )}
        </div>
      )}


      <div>
        <Label className="text-sm font-medium">Notes (Optional)</Label>
        <Input
          {...register("notes")}
          placeholder="Add any notes..."
          className="mt-1.5"
        />
      </div>

      {/* Desktop buttons */}
      <div className="hidden lg:flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || repaymentBlocked || balancesLoading || !isValid}
        >
          {isSubmitting ? "Creating..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AddTransactionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const getDefaultValues = () => ({
    type: "deposit",
    memberId: "",
    amount: 0,
    date: toDateInputValue(new Date()),
    savingsMonth: getCurrentSavingsMonth(),
    notes: "",
  });

  // Amount caps arrive asynchronously, so the schema is rebuilt as limits
  // load; the resolver delegates to the latest schema via a ref.
  const schemaRef = useRef(baseTransactionSchema);
  const dynamicResolver = useMemo(
    () => (values: any, context: any, options: any) =>
      zodResolver(schemaRef.current)(values, context, options),
    [],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting, isValid, isDirty },
    reset,
  } = useForm({
    resolver: dynamicResolver,
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: getDefaultValues(),
  });

  const { data: members = EMPTY_MEMBERS } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "members"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberDoc);
    },
    enabled: open,
  });

  // The borrow cap is the pool's real cash, derived from the ledger + config
  // like the Dashboard banner — stats/current drifts and omits the
  // carried-forward opening balances. Shares the Dashboard/Members cache key,
  // so this is normally already warm when the dialog opens.
  const { data: allTransactions = EMPTY_TRANSACTIONS, isFetched: allTxFetched } =
    useQuery({
      queryKey: ["transactions", "all-active"],
      queryFn: async () => {
        const snap = await getDocs(getAllActiveTransactions());
        return snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as TransactionDoc,
        );
      },
      enabled: open,
    });

  const { data: config, isFetched: configFetched } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "config", "app"));
      return snap.data() as AppConfig | undefined;
    },
    enabled: open,
  });

  // Both are needed: without config the opening balances are missing and the
  // cap would be understated.
  const poolFetched = allTxFetched && configFetched;

  const selectedMemberId = watch("memberId");
  const txType = watch("type");

  const { data: memberTransactions = EMPTY_TRANSACTIONS, isFetched: memberTxFetched } = useQuery({
    queryKey: ["transactions", "member", selectedMemberId],
    queryFn: async () => {
      const snap = await getDocs(getTransactionsByMember(selectedMemberId));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // Must match Members.tsx / MemberDetail.tsx, the other writers of
          // this cache key: normalize legacy 'return' -> 'repayment' or a
          // consumer that trusts the cached type renders the wrong label.
          type: normalizeTransactionType(data.type as string),
        } as TransactionDoc;
      });
    },
    enabled: open && !!selectedMemberId,
  });

  // Member caps need the config opening balance as much as the ledger:
  // before config resolves, a positive opening balance understates savings
  // and pure carried-forward debt reads as zero outstanding (blocking
  // repayment). Symmetric with poolFetched above.
  const memberBalancesReady = memberTxFetched && configFetched;

  const amountLimits = useMemo(() => {
    const poolBalance = computePoolTotals(
      allTransactions,
      getTotalOpeningBalance(config?.openingBalances),
      config?.openingInterest ?? 0,
    ).balance;
    if (!selectedMemberId) {
      return { poolBalance, memberSavings: 0, totalOutstanding: 0 };
    }

    // Same helper the Dashboard and Members pages use, so the caps enforced
    // here always match the outstanding figure shown elsewhere.
    const openingBalance = config?.openingBalances?.[selectedMemberId] ?? 0;
    const totals = buildMemberTotalsMap(memberTransactions, [selectedMemberId], {
      [selectedMemberId]: openingBalance,
    }).get(selectedMemberId)!;

    return {
      poolBalance,
      // Savings the member may draw via withdrawal/payout: their net
      // position plus any debt netted against it in the balance.
      memberSavings: Math.max(0, totals.net + totals.outstanding),
      totalOutstanding: totals.outstanding,
    };
  }, [
    allTransactions,
    config?.openingBalances,
    config?.openingInterest,
    memberTransactions,
    selectedMemberId,
  ]);

  // Balance-dependent types must not be submitted against caps that have
  // not loaded yet: memberSavings would collapse to the opening balance and
  // wrongly reject (or, for a drawn-down positive opening balance, wrongly
  // accept) the amount.
  const balancesLoading =
    (txType === 'borrow' && !poolFetched) ||
    ((txType === 'withdrawal' || txType === 'payout' || txType === 'repayment') &&
      !!selectedMemberId &&
      !memberBalancesReady);

  // Rebuild the schema with the latest caps and re-validate any value the
  // user has already typed once the limits arrive. Deps must be primitives:
  // an object dep would change identity every render and, combined with
  // trigger()'s state update, cause an infinite render loop.
  const { poolBalance, memberSavings, totalOutstanding } = amountLimits;
  useEffect(() => {
    schemaRef.current = createTransactionSchema({
      borrowMax: poolFetched ? poolBalance : undefined,
      withdrawalMax: memberBalancesReady ? memberSavings : undefined,
      repaymentMax: memberBalancesReady ? totalOutstanding : undefined,
      payoutMax: memberBalancesReady ? memberSavings : undefined,
    });
    if (isDirty) void trigger();
  }, [poolFetched, memberBalancesReady, poolBalance, memberSavings, totalOutstanding, isDirty, trigger]);

  // Auto-fill the (read-only) payout amount. Written unconditionally so a
  // figure typed for another type can't survive the switch to payout — the
  // old `> 0` guard left a stale amount in place for a zero-savings member.
  useEffect(() => {
    if (txType !== 'payout') return;
    const payoutAmount =
      selectedMemberId && memberBalancesReady ? memberSavings : 0;
    setValue('amount', payoutAmount, { shouldValidate: true });
  }, [txType, selectedMemberId, memberBalancesReady, memberSavings, setValue]);

  const onSubmit = async (data: any) => {
    if (balancesLoading) {
      toast.error('Still loading balances. Please try again in a moment.');
      return;
    }
    if (data.type === 'borrow' && data.amount > amountLimits.poolBalance) {
      toast.error(`Cannot borrow more than pool balance (₹${amountLimits.poolBalance.toLocaleString('en-IN')})`);
      return;
    }
    if (data.type === 'withdrawal' && data.amount > amountLimits.memberSavings) {
      toast.error(`Cannot withdraw more than member's savings (₹${amountLimits.memberSavings.toLocaleString('en-IN')})`);
      return;
    }
    if (data.type === 'payout' && data.amount > amountLimits.memberSavings) {
      toast.error(`Cannot pay out more than member's savings (₹${amountLimits.memberSavings.toLocaleString('en-IN')})`);
      return;
    }
    if (data.type === 'repayment' && amountLimits.totalOutstanding <= 0) {
      toast.error("This member doesn't have any outstanding balance to repay");
      return;
    }
    if (data.type === 'repayment' && data.amount > amountLimits.totalOutstanding) {
      toast.error(`Cannot repay more than outstanding amount (₹${amountLimits.totalOutstanding.toLocaleString('en-IN')})`);
      return;
    }
    try {
      await createTransaction({
        type: data.type,
        memberId: data.type === 'interest' ? undefined : data.memberId,
        amount: data.amount,
        date: data.date,
        // Only deposits carry a savings month; the form default must not
        // leak into other types.
        savingsMonth: data.type === 'deposit' ? data.savingsMonth || undefined : undefined,
        notes: data.notes || undefined,
        createdByUid: user!.uid,
      });

      // Deliberately not reporting createTransaction's newBalance: it comes
      // from stats/current, which excludes the config carry-forward and so
      // can contradict the Available Balance banner the user is looking at.
      toast.success("Transaction created");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      reset(getDefaultValues());
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to create transaction");
    }
  };

  const handleClose = () => {
    reset(getDefaultValues());
    onClose();
  };

  const repaymentBlocked = txType === 'repayment' && !!selectedMemberId && memberBalancesReady && amountLimits.totalOutstanding <= 0;

  // Mobile: Use FullScreenDrawer
  if (isMobile) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={handleClose}
        title="Add Transaction"
        onSave={handleSubmit(onSubmit)}
        saveLabel={isSubmitting ? "Creating..." : "Create"}
        saveDisabled={isSubmitting || repaymentBlocked || balancesLoading || !isValid}
      >
        <TransactionFormContent
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          isSubmitting={isSubmitting}
          members={members}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={handleClose}
          amountLimits={amountLimits}
          txType={txType}
          repaymentBlocked={repaymentBlocked}
          balancesLoading={balancesLoading}
          isValid={isValid}
        />
      </FullScreenDrawer>
    );
  }

  // Desktop: Use Dialog
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
          <DialogDescription>
            Create a new transaction
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          <TransactionFormContent
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
            isSubmitting={isSubmitting}
            members={members}
            onSubmit={handleSubmit(onSubmit)}
            onCancel={handleClose}
            amountLimits={amountLimits}
            txType={txType}
            repaymentBlocked={repaymentBlocked}
            balancesLoading={balancesLoading}
            isValid={isValid}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
