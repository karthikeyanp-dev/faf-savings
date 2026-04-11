import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { memberSchema } from '@/schemas';
import { toast } from 'sonner';
import { FullScreenDrawer } from '@/components/ui/bottom-sheet';
import { useEffect, useState } from 'react';

function AddMemberFormContent({
  register,
  errors,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  register: any;
  errors: any;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label className="text-sm font-medium">Member Name</Label>
        <Input
          {...register('name')}
          placeholder="Enter member name"
          className="mt-1.5"
          autoFocus
        />
        {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <Label className="text-sm font-medium">Email (Optional)</Label>
        <Input
          type="email"
          {...register('email')}
          placeholder="member@example.com"
          className="mt-1.5"
        />
        {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
      </div>

      {/* Desktop buttons */}
      <div className="hidden lg:flex gap-2 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding...' : 'Add Member'}
        </Button>
      </div>
    </form>
  );
}

export function AddMemberDialog({
  open,
  onClose,
}: {
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
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '',
      email: '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await addDoc(collection(db, 'members'), {
        name: data.name.trim(),
        email: data.email?.trim() || null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Member added');
      queryClient.invalidateQueries({ queryKey: ['members'] });
      reset();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add member');
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
        title="Add Member"
        onSave={handleSubmit(onSubmit)}
        saveLabel={isSubmitting ? 'Adding...' : 'Add'}
      >
        <AddMemberFormContent
          register={register}
          errors={errors}
          isSubmitting={isSubmitting}
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
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Add a new member to the savings pool</DialogDescription>
        </DialogHeader>
        <AddMemberFormContent
          register={register}
          errors={errors}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}
