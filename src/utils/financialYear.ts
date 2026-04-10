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
