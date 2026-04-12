import type { Timestamp } from 'firebase/firestore';

export type Role = 'maintainer' | 'viewer';
export type TransactionType = 'deposit' | 'withdrawal' | 'return' | 'opening_balance' | 'interest';
export type TransactionStatus = 'active' | 'void';

export interface UserDoc {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberDoc {
  id: string;
  name: string;
  email?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TransactionDoc {
  id: string;
  type: TransactionType;
  memberId: string;
  amount: number;
  date: Timestamp;
  fy: string;
  savingsMonth?: string;
  notes?: string;
  status: TransactionStatus;
  voidReason?: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AppConfig {
  fyStartMonth: number;
  currentMaintainerUid: string;
  upiId?: string;
  bankDetails?: string;
  qrUrl?: string;
  updatedAt: Timestamp;
  updatedByUid: string;
}

export interface StatsCurrent {
  poolBalance: number;
  totalDeposit: number;
  totalReturn: number;
  totalWithdrawal: number;
  totalInterest: number;
  updatedAt: Timestamp;
}

export interface MaintainerHistoryDoc {
  id: string;
  from: Timestamp;
  to?: Timestamp;
  maintainerUid: string;
  handoverByUid: string;
  createdAt: Timestamp;
}
