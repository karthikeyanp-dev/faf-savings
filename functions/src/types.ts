export interface CreateTransactionInput {
  type: 'deposit' | 'withdrawal' | 'return' | 'opening_balance' | 'interest';
  memberId?: string;
  amount: number;
  date: string;
  savingsMonth?: string;
  notes?: string;
}

export interface UpdateTransactionInput {
  txId: string;
  type?: string;
  memberId?: string;
  amount?: number;
  date?: string;
  savingsMonth?: string;
  notes?: string;
}

export interface VoidTransactionInput {
  txId: string;
  reason: string;
}
