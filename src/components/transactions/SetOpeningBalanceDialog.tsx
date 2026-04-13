import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setOpeningBalances } from "@/lib/transactions";
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
import type { MemberDoc, TransactionDoc } from "@/types";
import { toast } from "sonner";
import { getCurrentFY } from "@/utils/financialYear";

function getFYStartDate(fy: string): Date {
  const [startYear] = fy.split("-").map(Number);
  return new Date(startYear, 3, 1);
}

function OpeningBalanceFormContent({
  members,
  existingBalances,
  existingInterest,
  amounts,
  interestAmount,
  onAmountChange,
  onInterestChange,
  onSubmit,
  fy,
}: {
  members: MemberDoc[];
  existingBalances: Record<string, number>;
  existingInterest: number;
  amounts: Record<string, string>;
  interestAmount: string;
  onAmountChange: (memberId: string, value: string) => void;
  onInterestChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  fy: string;
}) {
  const totalNew = Object.values(amounts).reduce(
    (sum, v) => sum + (parseFloat(v) || 0),
    0,
  );
  const totalExisting = Object.values(existingBalances).reduce(
    (sum, v) => sum + v,
    0,
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="bg-muted/50 rounded-xl p-3 space-y-1">
        <p className="text-xs text-muted-foreground">
          Set each member's accumulated balance from before FY {fy}. This will
          be recorded as an opening balance transaction dated April 1,{" "}
          {fy.split("-")[0]}.
        </p>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Existing members total</span>
          <span className="font-medium">
            ₹{totalExisting.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Existing interest</span>
          <span className="font-medium">
            ₹{existingInterest.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">New entries total</span>
          <span className="font-semibold text-primary">
            ₹{totalNew.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* Opening Interest Input */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <Label className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Opening Interest Balance
        </Label>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 mb-2">
          Interest earned from previous FYs that's already in the pool
        </p>
        <Input
          type="number"
          step="1"
          placeholder="₹0"
          value={interestAmount}
          onChange={(e) => onInterestChange(e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="space-y-3">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium truncate block">
                {member.name}
              </Label>
              {existingBalances[member.id] !== 0 && (
                <p className="text-xs text-muted-foreground">
                  Current opening balance: ₹
                  {existingBalances[member.id].toLocaleString("en-IN")}
                </p>
              )}
            </div>
            <Input
              type="number"
              step="1"
              placeholder="₹0"
              value={amounts[member.id] || ""}
              onChange={(e) => onAmountChange(member.id, e.target.value)}
              className="w-28 shrink-0"
            />
          </div>
        ))}
      </div>
    </form>
  );
}

export function SetOpeningBalanceDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [interestAmount, setInterestAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentFY = getCurrentFY();
  const fyStartDate = getFYStartDate(currentFY);

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "members"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberDoc);
    },
    enabled: open,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "transactions"));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TransactionDoc,
      );
    },
    enabled: open,
  });

  const existingBalances: Record<string, number> = {};
  const activeTransactions = transactions.filter((t) => t.status === "active");
  for (const member of members) {
    const ob = activeTransactions
      .filter((t) => t.memberId === member.id && t.type === "opening_balance")
      .reduce((sum, t) => sum + t.amount, 0);
    existingBalances[member.id] = ob;
  }
  
  const existingInterest = activeTransactions
    .filter((t) => t.type === "interest" && t.notes === `Opening interest for FY ${currentFY}`)
    .reduce((sum, t) => sum + t.amount, 0);

  const handleAmountChange = (memberId: string, value: string) => {
    setAmounts((prev) => ({ ...prev, [memberId]: value }));
  };

  const handleInterestChange = (value: string) => {
    setInterestAmount(value);
  };

  const submitBalances = async () => {
    const entries = members
      .map((m) => ({
        memberId: m.id,
        name: m.name,
        amount: parseFloat(amounts[m.id] || "0") || 0,
      }))
      .filter((e) => e.amount !== 0);

    const interest = parseFloat(interestAmount || "0") || 0;

    if (entries.length === 0 && interest === 0) {
      toast.error("Please enter at least one opening balance or interest amount");
      return;
    }

    setIsSubmitting(true);

    try {
      const fy = currentFY;
      const result = await setOpeningBalances({
        entries,
        openingInterest: interest || undefined,
        date: fyStartDate,
        fy,
        createdByUid: user!.uid,
      });

      toast.success(
        `Opening balances updated for ${result.createdCount} member${result.createdCount !== 1 ? "s" : ""}`,
      );
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      resetForm();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to set opening balances");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitBalances();
  };

  const resetForm = () => {
    setAmounts({});
    setInterestAmount("");
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[min(90vh,48rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Set Opening Balances</DialogTitle>
          <DialogDescription>
            Enter each member's accumulated balance from before FY {currentFY}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(min(90vh,48rem)-8.5rem)] overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          <OpeningBalanceFormContent
            members={members}
            existingBalances={existingBalances}
            existingInterest={existingInterest}
            amounts={amounts}
            interestAmount={interestAmount}
            onAmountChange={handleAmountChange}
            onInterestChange={handleInterestChange}
            onSubmit={handleSubmit}
            fy={currentFY}
          />
        </div>
        <div className="flex gap-2 border-t border-border px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="flex-1"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submitBalances}
            className="flex-1"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save Opening Balances"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
