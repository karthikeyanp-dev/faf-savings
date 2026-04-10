import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { updateTransaction } from '@/lib/transactions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { transactionSchema } from '@/schemas';
import type { TransactionDoc } from '@/types';
import { toast } from 'sonner';
import { FullScreenDrawer } from '@/components/ui/bottom-sheet';
import { useEffect, useState } from 'react';

// Form content component
function EditFormContent({
  register,
  watch,
  setValue,
  errors,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const txType = watch('type');

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label className="text-sm font-medium">Transaction Type</Label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {['deposit', 'return', 'withdrawal'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setValue('type', type)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                txType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {type}
            </button>
          ))}
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
      </div>

      <div>
        <Label className="text-sm font-medium">Date</Label>
        <Input
          type="date"
          className="mt-1.5"
          {...register('date', {
            setValueAs: (v: string) => new Date(v),
          })}
        />
      </div>

      {(txType === 'deposit' || txType === 'return') && (
        <div>
          <Label className="text-sm font-medium">Savings Month</Label>
          <Input type="month" {...register('savingsMonth')} className="mt-1.5" />
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
        <Button type="submit" disabled={isSubmitting}>
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

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: transaction.type as any,
      memberId: transaction.memberId,
      amount: transaction.amount,
      date: transaction.date.toDate(),
      savingsMonth: transaction.savingsMonth || '',
      notes: transaction.notes || '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      const result = await updateTransaction({
        txId: transaction.id,
        type: data.type,
        memberId: data.memberId,
        amount: data.amount,
        date: data.date,
        savingsMonth: data.savingsMonth || undefined,
        notes: data.notes || undefined,
      });

      toast.success(`Transaction updated! New balance: ₹${result.newBalance}`);
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
      >
        <EditFormContent
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={onClose}
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
        />
      </DialogContent>
    </Dialog>
  );
}
