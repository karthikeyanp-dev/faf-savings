import { z } from "zod";

export const transactionSchema = z
  .object({
    type: z.enum(["deposit", "withdrawal", "return", "opening_balance", "interest"]),
    memberId: z.string().min(1, "Member is required").optional(),
    amount: z.coerce.number(),
    date: z.date(),
    savingsMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM")
      .optional()
      .or(z.literal("")),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "opening_balance" && data.amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must be greater than 0",
        path: ["amount"],
      });
    }
    if (data.type === "opening_balance" && data.amount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount cannot be 0",
        path: ["amount"],
      });
    }
    // Require memberId for all types except 'interest' and 'opening_balance'
    if (data.type !== "interest" && data.type !== "opening_balance" && !data.memberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Member is required",
        path: ["memberId"],
      });
    }
  });

export const voidSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export const memberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
});

export const paymentDetailsSchema = z.object({
  upiId: z.string().optional(),
  bankDetails: z.string().optional(),
});
