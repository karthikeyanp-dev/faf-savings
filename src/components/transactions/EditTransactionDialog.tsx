import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllActiveTransactions, getTransactionsByMember } from '@/lib/firestore';
import { updateTransaction } from '@/lib/transactions';
import { toDateInputValue } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SavingsMonthPicker } from '@/components/ui/savings-month-picker';

import { createTransactionSchema } from '@/schemas';
import type { AppConfig, TransactionDoc } from '@/types';
import {
  buildMemberTotalsMap,
  computePoolTotals,
  getCurrentSavingsMonth,
  getTotalOpeningBalance,
  normalizeTransactionType,
} from '@/utils/financialYear';
import { toast } from 'sonner';
import { FullScreenDrawer } from '@/components/ui/bottom-sheet';
import { useEffect, useMemo, useRef, useState } from 'react';

// Stable empty defaults: inline `= []` would create a new array identity on
// every render and feed memo dependency loops.
const EMPTY_TRANSACTIONS: TransactionDoc[] = [];
const baseTransactionSchema = createTransactionSchema();

// Form content component
function EditFormContent({
  register,
  watch,
  setValue,
  errors,
  isSubmitting,
  onSubmit,
  onCancel,
  amountLimits,
  balancesLoading,
}: {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  amountLimits: { poolBalance: number; memberSavings: number; totalOutstanding: number };
  balancesLoading: boolean;
}) {
  const txType = watch('type');
  // The toggle is never stored: a deposit is "monthly" exactly while it
  // carries a savings month, so the mode derives from the field itself.
  const isMonthlySaving = !!watch('savingsMonth');

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label className="text-sm font-medium">Transaction Type</Label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {(["deposit", "repayment", "interest", "borrow", "withdrawal", "payout"] as const).map((type) => {
            // First row is money coming in (green), second row money going out (orange).
            const isPaymentIn = ["deposit", "repayment", "interest"].includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => setValue('type', type, { shouldValidate: true, shouldDirty: true })}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                  txType === type
                    ? 'bg-primary text-primary-foreground'
                    : `bg-muted hover:bg-muted/80 ${
                        isPaymentIn
                          ? 'text-green-700 dark:text-green-600'
                          : 'text-orange-700 dark:text-orange-600'
                      }`
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Amount (₹)</Label>
        <Input 
          type="number" 
          step="0.01" 
          {...register('amount', { valueAsNumber: true })} 
          className="mt-1.5"
          placeholder="0.00"
        />
        {errors.amount && <p className="text-sm text-destructive mt-1">{errors.amount.message}</p>}
        {/* The caps below exclude this transaction's own contribution, so
            they describe the room available for the edited amount. */}
        {balancesLoading && (
          <p className="text-xs text-muted-foreground mt-1">Loading balance…</p>
        )}
        {!balancesLoading && txType === 'borrow' && (
          <p className="text-xs text-muted-foreground mt-1">
            Max available: ₹{amountLimits.poolBalance.toLocaleString('en-IN')}
          </p>
        )}
        {!balancesLoading && (txType === 'withdrawal' || txType === 'payout') && (
          <p className="text-xs text-muted-foreground mt-1">
            Savings balance: ₹{amountLimits.memberSavings.toLocaleString('en-IN')}
          </p>
        )}
        {!balancesLoading && txType === 'repayment' && (
          <p className="text-xs text-muted-foreground mt-1">
            Outstanding: ₹{amountLimits.totalOutstanding.toLocaleString('en-IN')}
          </p>
        )}
      </div>

      <div>
        <Label className="text-sm font-medium">Date</Label>
        <Input
          type="date"
          className="mt-1.5"
          {...register('date')}
        />
      </div>

      {txType === 'deposit' && (
        <div className="space-y-3">
          {/* Unlabeled mode toggle: picking "Normal Saving" clears the month
              so the deposit is stored without one — the presence of the value
              is the only difference between the two kinds of savings. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setValue('savingsMonth', watch('savingsMonth') || getCurrentSavingsMonth(), { shouldValidate: true })
              }
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isMonthlySaving
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Monthly Saving
            </button>
            <button
              type="button"
              onClick={() => setValue('savingsMonth', '', { shouldValidate: true })}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                !isMonthlySaving
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Normal Saving
            </button>
          </div>
          {isMonthlySaving && (
            <div>
              <Label className="text-sm font-medium">Savings Month</Label>
              <div className="mt-1.5">
                <SavingsMonthPicker
                  value={watch('savingsMonth') || ''}
                  onChange={(v) => setValue('savingsMonth', v)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <Label className="text-sm font-medium">Notes</Label>
        <Input {...register('notes')} placeholder="Add any notes..." className="mt-1.5" />
      </div>

      {/* Desktop buttons */}
      <div className="hidden lg:flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || balancesLoading}>
          {isSubmitting ? 'Updating...' : 'Update'}
        </Button>
      </div>
    </form>
  );
}

export function EditTransactionDialog({
  transaction,
  open,
  onClose,
}: {
  transaction: TransactionDoc;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Caps arrive asynchronously, so the schema is rebuilt as limits load and
  // the resolver delegates to the latest schema via a ref — same pattern as
  // AddTransactionDialog.
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
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: dynamicResolver,
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      type: normalizeTransactionType(transaction.type) as any,
      memberId: transaction.memberId,
      amount: transaction.amount,
      date: toDateInputValue(transaction.date.toDate()),
      savingsMonth: transaction.savingsMonth || '',
      notes: transaction.notes || '',
    },
  });

  const memberId = transaction.memberId;

  const { data: allTransactions = EMPTY_TRANSACTIONS, isFetched: allTxFetched } =
    useQuery({
      queryKey: ['transactions', 'all-active'],
      queryFn: async () => {
        const snap = await getDocs(getAllActiveTransactions());
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TransactionDoc);
      },
      enabled: open,
    });

  const { data: config, isFetched: configFetched } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'config', 'app'));
      return snap.data() as AppConfig | undefined;
    },
    enabled: open,
  });

  const { data: memberTransactions = EMPTY_TRANSACTIONS, isFetched: memberTxFetched } =
    useQuery({
      queryKey: ['transactions', 'member', memberId],
      queryFn: async () => {
        const snap = await getDocs(getTransactionsByMember(memberId!));
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            // Must match the other writers of this cache key.
            type: normalizeTransactionType(data.type as string),
          } as TransactionDoc;
        });
      },
      enabled: open && !!memberId,
    });

  const poolFetched = allTxFetched && configFetched;
  const memberBalancesReady = memberTxFetched && configFetched;

  // Caps measured against the ledger *without* this transaction, so the new
  // amount is validated against the room that actually exists for it — an
  // edit that only lowers a borrow must not be rejected by its own old value.
  const amountLimits = useMemo(() => {
    const others = allTransactions.filter((t) => t.id !== transaction.id);
    const poolBalance = computePoolTotals(
      others,
      getTotalOpeningBalance(config?.openingBalances),
      config?.openingInterest ?? 0,
    ).balance;
    if (!memberId) {
      return { poolBalance, memberSavings: 0, totalOutstanding: 0 };
    }
    const openingBalance = config?.openingBalances?.[memberId] ?? 0;
    const totals = buildMemberTotalsMap(
      memberTransactions.filter((t) => t.id !== transaction.id),
      [memberId],
      { [memberId]: openingBalance },
    ).get(memberId)!;
    return {
      poolBalance,
      memberSavings: Math.max(0, totals.net + totals.outstanding),
      totalOutstanding: totals.outstanding,
    };
  }, [
    allTransactions,
    memberTransactions,
    config?.openingBalances,
    config?.openingInterest,
    memberId,
    transaction.id,
  ]);

  const txType = watch('type');
  const balancesLoading =
    (txType === 'borrow' && !poolFetched) ||
    ((txType === 'withdrawal' || txType === 'payout' || txType === 'repayment') &&
      !!memberId &&
      !memberBalancesReady);

  // Deps must be primitives: an object dep would change identity every render
  // and, combined with trigger()'s state update, cause a render loop.
  const { poolBalance, memberSavings, totalOutstanding } = amountLimits;
  useEffect(() => {
    schemaRef.current = createTransactionSchema({
      borrowMax: poolFetched ? poolBalance : undefined,
      withdrawalMax: memberBalancesReady ? memberSavings : undefined,
      repaymentMax: memberBalancesReady ? totalOutstanding : undefined,
      payoutMax: memberBalancesReady ? memberSavings : undefined,
    });
    if (isDirty) void trigger();
  }, [
    poolFetched,
    memberBalancesReady,
    poolBalance,
    memberSavings,
    totalOutstanding,
    isDirty,
    trigger,
  ]);

  // Caps are per-type, so the existing amount must be re-checked against the
  // new type's limit on every switch — setValue only revalidates the field it
  // was given, so the amount would otherwise keep its pre-switch verdict.
  // Skipped on mount so opening a legacy over-cap transaction doesn't open
  // pre-flagged; the user's first edit surfaces it.
  const prevTypeRef = useRef(txType);
  useEffect(() => {
    if (prevTypeRef.current === txType) return;
    prevTypeRef.current = txType;
    void trigger('amount');
  }, [txType, trigger]);

  const onSubmit = async (data: any) => {
    if (balancesLoading) {
      toast.error('Still loading balances. Please try again in a moment.');
      return;
    }
    try {
      await updateTransaction({
        txId: transaction.id,
        type: data.type,
        memberId: data.memberId,
        amount: data.amount,
        date: data.date,
        // Only deposits carry a savings month; null clears stale values —
        // legacy months on non-deposits, or a month the edit just removed by
        // switching the deposit to "Normal Saving".
        savingsMonth: data.type === 'deposit' ? data.savingsMonth || null : null,
        notes: data.notes || undefined,
      });

      // Not reporting updateTransaction's newBalance: it comes from
      // stats/current, which excludes the config carry-forward and so can
      // contradict the Available Balance banner on the Dashboard.
      toast.success('Transaction updated');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update transaction');
    }
  };

  // Mobile: Use FullScreenDrawer
  if (isMobile) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={onClose}
        title="Edit Transaction"
        onSave={handleSubmit(onSubmit)}
        saveLabel={isSubmitting ? 'Updating...' : 'Update'}
        saveDisabled={isSubmitting || balancesLoading}
      >
        <EditFormContent
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={onClose}
          amountLimits={amountLimits}
          balancesLoading={balancesLoading}
        />
      </FullScreenDrawer>
    );
  }

  // Desktop: Use Dialog
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
        </DialogHeader>
        <EditFormContent
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={onClose}
          amountLimits={amountLimits}
          balancesLoading={balancesLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
