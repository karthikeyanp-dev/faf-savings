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

export function calculatePoolBalance(transactions: LightweightTransaction[]): number {
  return transactions
    .filter(t => t.status === 'active')
    .reduce((sum, t) => {
      if (t.type === 'deposit' || t.type === 'return' || t.type === 'opening_balance') {
        return sum + t.amount;
      }
      if (t.type === 'withdrawal') {
        return sum - t.amount;
      }
      return sum;
    }, 0);
}

export function calculateMemberNet(
  transactions: Array<LightweightTransaction & { memberId: string }>,
  memberId: string
): number {
  return transactions
    .filter(t => t.status === 'active' && t.memberId === memberId)
    .reduce((sum, t) => {
      if (t.type === 'deposit' || t.type === 'return' || t.type === 'opening_balance') return sum + t.amount;
      if (t.type === 'withdrawal') return sum - t.amount;
      return sum;
    }, 0);
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
