import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { voidTransaction } from '@/lib/transactions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { voidSchema } from '@/schemas';
import type { TransactionDoc } from '@/types';
import { toast } from 'sonner';
import { FullScreenDrawer } from '@/components/ui/bottom-sheet';
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export function VoidTransactionDialog({
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
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(voidSchema),
    defaultValues: {
      reason: '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      const result = await voidTransaction({
        txId: transaction.id,
        reason: data.reason,
      });

      toast.success(`Transaction voided! New balance: ₹${result.newBalance}`);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to void transaction');
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="flex items-start gap-3 p-4 bg-destructive/10 rounded-xl">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-destructive">Warning</p>
          <p className="text-sm text-destructive/80">
            This will reverse the transaction and update the pool balance. This action cannot be undone.
          </p>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Reason (required)</Label>
        <Input 
          {...register('reason')} 
          placeholder="Why are you voiding this transaction?" 
          className="mt-1.5"
        />
        {errors.reason && <p className="text-sm text-destructive mt-1">{errors.reason.message}</p>}
      </div>

      {/* Desktop buttons */}
      <div className="hidden lg:flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting ? 'Voiding...' : 'Void Transaction'}
        </Button>
      </div>
    </form>
  );

  // Mobile: Use FullScreenDrawer
  if (isMobile) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={onClose}
        title="Void Transaction"
        onSave={handleSubmit(onSubmit)}
        saveLabel={isSubmitting ? 'Voiding...' : 'Void'}
      >
        {formContent}
      </FullScreenDrawer>
    );
  }

  // Desktop: Use Dialog
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void Transaction</DialogTitle>
          <DialogDescription>
            This will reverse the transaction and update the pool balance. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
