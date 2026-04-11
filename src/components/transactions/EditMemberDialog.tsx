import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { memberSchema } from '@/schemas';
import type { MemberDoc } from '@/types';
import { toast } from 'sonner';
import { FullScreenDrawer } from '@/components/ui/bottom-sheet';
import { useEffect, useState } from 'react';

// Shared form content
function EditMemberFormContent({
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
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

export function EditMemberDialog({
  member,
  open,
  onClose,
}: {
  member: MemberDoc;
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
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: member.name,
      email: member.email || '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await updateDoc(doc(db, 'members', member.id), {
        name: data.name.trim(),
        email: data.email?.trim() || null,
        updatedAt: serverTimestamp(),
      });
      toast.success('Member updated');
      queryClient.invalidateQueries({ queryKey: ['members'] });
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update member');
    }
  };

  // Mobile: Use FullScreenDrawer
  if (isMobile) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={onClose}
        title="Edit Member"
        onSave={handleSubmit(onSubmit)}
        saveLabel={isSubmitting ? 'Saving...' : 'Save'}
      >
        <EditMemberFormContent
          register={register}
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
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>Update member details</DialogDescription>
        </DialogHeader>
        <EditMemberFormContent
          register={register}
          errors={errors}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
