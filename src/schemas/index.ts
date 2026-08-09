import { z } from "zod";

// Dynamic caps for live field validation (withdrawal / borrow / repayment /
// payout). A limit of `undefined` skips the check (e.g. while balances are
// still loading).
export interface TransactionAmountLimits {
  borrowMax?: number;
  withdrawalMax?: number;
  repaymentMax?: number;
  payoutMax?: number;
}

// `<input type="date">` hands us "YYYY-MM-DD". `z.coerce.date()` alone would
// read that as UTC midnight, which drifts a day in UTC-negative zones and can
// flip the financial year at the Apr-1 boundary. Parse the parts as a local
// date instead, matching toDateInputValue()'s local-time formatting.
const localDate = z.preprocess((value) => {
  if (typeof value === "string") {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (parts) {
      return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    }
  }
  return value;
}, z.coerce.date());

export function createTransactionSchema(limits: TransactionAmountLimits = {}) {
  return z
    .object({
      type: z.enum(["deposit", "withdrawal", "repayment", "borrow", "payout", "opening_balance", "interest"]),
      // The form defaults memberId to "" and hides the field for `interest`,
      // so the base object must accept an empty string. The superRefine below
      // owns the "Member is required" rule.
      memberId: z.string().optional(),
      amount: z.coerce.number({ invalid_type_error: "Amount is required" }),
      date: localDate,
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
      // Require memberId for all types except 'interest'
      if (data.type !== "interest" && !data.memberId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Member is required",
          path: ["memberId"],
        });
      }
      if (data.type === "borrow" && limits.borrowMax !== undefined && data.amount > limits.borrowMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Cannot borrow more than pool balance (₹${limits.borrowMax.toLocaleString("en-IN")})`,
          path: ["amount"],
        });
      }
      if (data.type === "withdrawal" && limits.withdrawalMax !== undefined && data.amount > limits.withdrawalMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Cannot withdraw more than member's savings (₹${limits.withdrawalMax.toLocaleString("en-IN")})`,
          path: ["amount"],
        });
      }
      if (data.type === "repayment" && limits.repaymentMax !== undefined && limits.repaymentMax > 0 && data.amount > limits.repaymentMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Cannot repay more than outstanding amount (₹${limits.repaymentMax.toLocaleString("en-IN")})`,
          path: ["amount"],
        });
      }
      if (data.type === "payout" && limits.payoutMax !== undefined && data.amount > limits.payoutMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Cannot pay out more than member's savings (₹${limits.payoutMax.toLocaleString("en-IN")})`,
          path: ["amount"],
        });
      }
    });
}

export const transactionSchema = createTransactionSchema();

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
