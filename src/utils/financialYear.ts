import { Timestamp } from 'firebase/firestore';
import type { TransactionType } from '../types';

export function getFY(date: Date, fyStartMonth = 4): string {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= fyStartMonth) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export function parseFY(fy: string): { start: Date; end: Date } {
  const [startYear] = fy.split('-').map(Number);
  return {
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31),
  };
}

export interface LightweightTransaction {
  type: TransactionType;
  amount: number;
  status: 'active' | 'void';
}

export function calculatePoolBalance(
  transactions: LightweightTransaction[],
  openingBalanceTotal = 0,
  openingInterest = 0
): number {
  return transactions
    .filter(t => t.status === 'active')
    .reduce((sum, t) => {
      if (t.type === 'deposit' || t.type === 'return' || t.type === 'interest') {
        return sum + t.amount;
      }
      if (t.type === 'withdrawal') {
        return sum - t.amount;
      }
      return sum;
    }, openingBalanceTotal + openingInterest);
}

export function calculateMemberNet(
  transactions: Array<LightweightTransaction & { memberId: string }>,
  memberId: string,
  openingBalance = 0
): number {
  return transactions
    .filter(t => t.status === 'active' && t.memberId === memberId)
    .reduce((sum, t) => {
      if (t.type === 'deposit' || t.type === 'return') return sum + t.amount;
      if (t.type === 'withdrawal') return sum - t.amount;
      return sum;
    }, openingBalance);
}

export function getOpeningBalance(
  openingBalances: Record<string, number> | undefined,
  memberId: string
): number {
  return openingBalances?.[memberId] ?? 0;
}

export function getTotalOpeningBalance(
  openingBalances: Record<string, number> | undefined
): number {
  return Object.values(openingBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(timestamp: Timestamp | Date): string {
  const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Short month labels (0-indexed). */
const MONTH_LABELS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

const MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format a `"YYYY-MM"` savings month string.
 * - `'upper'` → `"MAR 2026"`
 * - `'short'` → `"Mar-2026"`
 * Returns the raw value unchanged if parsing fails (backward compat).
 */
export function formatSavingsMonth(value: string, style: 'upper' | 'short' = 'short'): string {
  if (!value) return value;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value;
  if (style === 'upper') return `${MONTH_LABELS[monthIdx]} ${year}`;
  return `${MONTH_LABELS_SHORT[monthIdx]}-${year}`;
}

export function getMonthLabels(): string[] {
  return MONTH_LABELS;
}

export function getCurrentSavingsMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getCurrentFY(): string {
  return getFY(new Date());
}

/**
 * Calculate the FY target for a member based on 500/month accumulation.
 * FY starts in April. Each month from April to the current month adds 500.
 */
export function calculateFYTarget(fy?: string): number {
  const now = new Date();
  const currentFY = fy || getCurrentFY();
  const [startYear] = currentFY.split('-').map(Number);

  // FY starts April 1st of startYear
  const fyStart = new Date(startYear, 3, 1); // month 3 = April (0-indexed)

  // If we're not yet in this FY, target is 0
  if (now < fyStart) return 0;

  // Calculate how many months have passed since FY start (inclusive of start month)
  const currentMonth = now.getMonth(); // 0-indexed
  const currentYear = now.getFullYear();

  let monthsElapsed: number;
  if (currentYear === startYear) {
    // Same year as FY start - April is month 3
    monthsElapsed = currentMonth - 3 + 1; // +1 because April itself counts
  } else if (currentYear === startYear + 1) {
    // Next year (Jan-Mar of the FY)
    monthsElapsed = (11 - 3 + 1) + (currentMonth + 1); // Apr-Dec + Jan-currentMonth
  } else {
    // Beyond this FY
    monthsElapsed = 12;
  }

  monthsElapsed = Math.max(0, Math.min(12, monthsElapsed));
  return monthsElapsed * 500;
}
