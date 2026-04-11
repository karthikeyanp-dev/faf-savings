import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createTransaction } from '@/lib/transactions';
import { useAuth } from '@/providers/AuthProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem } from '@/components/ui/select';
import { transactionSchema } from '@/schemas';
import type { MemberDoc } from '@/types';
import { toast } from 'sonner';
import { FullScreenDrawer } from '@/components/ui/bottom-sheet';
import { useEffect, useState } from 'react';

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
  submitLabel = 'Create',
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
        {errors.type && <p className="text-sm text-destructive mt-1">{errors.type.message}</p>}
      </div>

      <div>
        <Label className="text-sm font-medium">Member</Label>
        <Select value={watch('memberId')} onValueChange={(v) => setValue('memberId', v)}>
          <SelectItem value="">Select member...</SelectItem>
          {members.filter((m) => m.active).map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </Select>
        {errors.memberId && <p className="text-sm text-destructive mt-1">{errors.memberId.message}</p>}
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
          defaultValue={new Date().toISOString().split('T')[0]}
        />
        {errors.date && <p className="text-sm text-destructive mt-1">{errors.date.message}</p>}
      </div>

      {txType === 'deposit' && (
        <div>
          <Label className="text-sm font-medium">Savings Month</Label>
          <Input type="month" {...register('savingsMonth')} className="mt-1.5" />
          {errors.savingsMonth && <p className="text-sm text-destructive mt-1">{errors.savingsMonth.message}</p>}
        </div>
      )}

      {txType === 'return' && (
        <div>
          <Label className="text-sm font-medium">Savings Month (Optional)</Label>
          <Input type="month" {...register('savingsMonth')} className="mt-1.5" />
        </div>
      )}

      <div>
        <Label className="text-sm font-medium">Notes (Optional)</Label>
        <Input {...register('notes')} placeholder="Add any notes..." className="mt-1.5" />
      </div>

      {/* Desktop buttons */}
      <div className="hidden lg:flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AddTransactionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
    reset,
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'deposit',
      memberId: '',
      amount: 0,
      date: new Date(),
      savingsMonth: '',
      notes: '',
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'members'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberDoc));
    },
    enabled: open,
  });

  const onSubmit = async (data: any) => {
    try {
      const result = await createTransaction({
        type: data.type,
        memberId: data.memberId,
        amount: data.amount,
        date: data.date,
        savingsMonth: data.savingsMonth || undefined,
        notes: data.notes || undefined,
        createdByUid: user!.uid,
      });

      toast.success(`Transaction created! New balance: ₹${result.newBalance}`);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      reset();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create transaction');
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Mobile: Use FullScreenDrawer
  if (isMobile) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={handleClose}
        title="Add Transaction"
        onSave={handleSubmit(onSubmit)}
        saveLabel={isSubmitting ? 'Creating...' : 'Create'}
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
          <DialogDescription>Create a new deposit, return, or withdrawal</DialogDescription>
        </DialogHeader>
        <TransactionFormContent
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          isSubmitting={isSubmitting}
          members={members}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}
