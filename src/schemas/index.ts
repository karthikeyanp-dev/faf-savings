import { z } from 'zod';

export const transactionSchema = z.object({
  type: z.enum(['deposit', 'withdrawal', 'return']),
  memberId: z.string().min(1, 'Member is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.date(),
  savingsMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM').optional().or(z.literal('')),
  notes: z.string().optional(),
});

export const voidSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

export const memberSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export const paymentDetailsSchema = z.object({
  upiId: z.string().optional(),
  bankDetails: z.string().optional(),
});
