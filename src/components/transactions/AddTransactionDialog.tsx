import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTransactionsByMember } from "@/lib/firestore";
import { createTransaction } from "@/lib/transactions";
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
import { transactionSchema } from "@/schemas";
import type { MemberDoc, TransactionDoc, StatsCurrent, AppConfig } from "@/types";
import { toast } from "sonner";
import { FullScreenDrawer } from "@/components/ui/bottom-sheet";
import { useEffect, useMemo, useState } from "react";

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
  amountLimits: { poolBalance: number; memberNet: number; totalOutstanding: number };
  txType: string;
  repaymentBlocked: boolean;
}) {
  const selectedMemberId = watch("memberId");

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label className="text-sm font-medium">Transaction Type</Label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {(["deposit", "repayment", "withdrawal", "borrow", "payout", "interest"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setValue("type", type)}
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
            onValueChange={(v) => setValue("memberId", v)}
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
          className="mt-1.5"
          placeholder="0.00"
          readOnly={txType === 'payout'}
        />
        {errors.amount && (
          <p className="text-sm text-destructive mt-1">
            {errors.amount.message}
          </p>
        )}
        {txType === 'borrow' && amountLimits.poolBalance > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Max available: ₹{amountLimits.poolBalance.toLocaleString('en-IN')}
          </p>
        )}
        {txType === 'withdrawal' && selectedMemberId && (
          <p className="text-xs text-muted-foreground mt-1">
            Member balance: ₹{amountLimits.memberNet.toLocaleString('en-IN')}
          </p>
        )}
        {txType === 'payout' && selectedMemberId && (
          <p className="text-xs text-muted-foreground mt-1">
            Full balance will be paid out
          </p>
        )}
        {txType === 'repayment' && selectedMemberId && amountLimits.totalOutstanding > 0 && (
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
          className="mt-1.5"
          {...register("date", {
            setValueAs: (v: string) => new Date(v),
          })}
          defaultValue={new Date().toISOString().split("T")[0]}
        />
        {errors.date && (
          <p className="text-sm text-destructive mt-1">{errors.date.message}</p>
        )}
      </div>

      {txType === "deposit" && (
        <div>
          <Label className="text-sm font-medium">Savings Month</Label>
          <Input
            type="month"
            {...register("savingsMonth")}
            className="mt-1.5"
          />
          {errors.savingsMonth && (
            <p className="text-sm text-destructive mt-1">
              {errors.savingsMonth.message}
            </p>
          )}
        </div>
      )}

      {txType === "repayment" && (
        <div>
          <Label className="text-sm font-medium">
            Savings Month (Optional)
          </Label>
          <Input
            type="month"
            {...register("savingsMonth")}
            className="mt-1.5"
          />
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
        <Button type="submit" disabled={isSubmitting || repaymentBlocked}>
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

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "deposit",
      memberId: "",
      amount: 0,
      date: new Date(),
      savingsMonth: "",
      notes: "",
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "members"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberDoc);
    },
    enabled: open,
  });

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "stats", "current"));
      return snap.data() as StatsCurrent | undefined;
    },
    enabled: open,
  });

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "config", "app"));
      return snap.data() as AppConfig | undefined;
    },
    enabled: open,
  });

  const selectedMemberId = watch("memberId");
  const txType = watch("type");

  const { data: memberTransactions = [], isFetched: memberTxFetched } = useQuery({
    queryKey: ["transactions", "member", selectedMemberId],
    queryFn: async () => {
      const snap = await getDocs(getTransactionsByMember(selectedMemberId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TransactionDoc);
    },
    enabled: open && !!selectedMemberId,
  });

  const amountLimits = useMemo(() => {
    const poolBalance = stats?.poolBalance ?? 0;

    const openingBalance = config?.openingBalances?.[selectedMemberId] ?? 0;
    let memberNet = openingBalance;

    // Track explicit debt components
    let totalWithdrawnBorrowed = 0;
    let totalRepaid = 0;

    for (const t of memberTransactions) {
      if (t.status !== 'active') continue;
      const type = (t as any).type === 'return' ? 'repayment' : t.type;

      // Member net calculation
      if (type === 'deposit' || type === 'repayment') {
        memberNet += t.amount;
      } else if (type === 'withdrawal' || type === 'borrow' || type === 'payout') {
        memberNet -= t.amount;
      }

      // Debt tracking for repayment max
      if (type === 'withdrawal' || type === 'borrow') {
        totalWithdrawnBorrowed += t.amount;
      } else if (type === 'repayment') {
        totalRepaid += t.amount;
      }
    }

    // If opening balance is negative, it represents carried-forward debt
    const negativeOBDebt = Math.max(0, -openingBalance);

    // Outstanding = total debt - what's been repaid
    const totalOutstanding = Math.max(0, totalWithdrawnBorrowed + negativeOBDebt - totalRepaid);

    return {
      poolBalance,
      memberNet: Math.max(0, memberNet),
      totalOutstanding,
    };
  }, [stats, config, memberTransactions, selectedMemberId]);

  // Auto-fill amount for payout
  useEffect(() => {
    if (txType === 'payout' && selectedMemberId && amountLimits.memberNet > 0) {
      setValue('amount', amountLimits.memberNet);
    }
  }, [txType, selectedMemberId, amountLimits.memberNet, setValue]);

  const onSubmit = async (data: any) => {
    if (data.type === 'borrow' && data.amount > amountLimits.poolBalance) {
      toast.error(`Cannot borrow more than pool balance (₹${amountLimits.poolBalance.toLocaleString('en-IN')})`);
      return;
    }
    if (data.type === 'withdrawal' && data.amount > amountLimits.memberNet) {
      toast.error(`Cannot withdraw more than member's balance (₹${amountLimits.memberNet.toLocaleString('en-IN')})`);
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
      const result = await createTransaction({
        type: data.type,
        memberId: data.type === 'interest' ? undefined : data.memberId,
        amount: data.amount,
        date: data.date,
        savingsMonth: data.savingsMonth || undefined,
        notes: data.notes || undefined,
        createdByUid: user!.uid,
      });

      toast.success(`Transaction created! New balance: ₹${result.newBalance}`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      reset();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to create transaction");
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const repaymentBlocked = txType === 'repayment' && !!selectedMemberId && memberTxFetched && amountLimits.totalOutstanding <= 0;

  // Mobile: Use FullScreenDrawer
  if (isMobile) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={handleClose}
        title="Add Transaction"
        onSave={handleSubmit(onSubmit)}
        saveLabel={isSubmitting ? "Creating..." : "Create"}
        saveDisabled={isSubmitting || repaymentBlocked}
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
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
