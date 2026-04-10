import { runTransaction, collection, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { TransactionType } from '@/types';

interface CreateTransactionParams {
  type: TransactionType;
  memberId: string;
  amount: number;
  date: Date;
  savingsMonth?: string;
  notes?: string;
  createdByUid: string;
}

export async function createTransaction(params: CreateTransactionParams) {
  const { type, memberId, amount, date, savingsMonth, notes, createdByUid } = params;
  
  const fy = getFY(date);

  const result = await runTransaction(db, async (transaction) => {
    const statsRef = doc(db, 'stats', 'current');
    const statsDoc = await transaction.get(statsRef);
    
    if (!statsDoc.exists()) {
      throw new Error('Stats document not found. Please run seed script first.');
    }

    const stats = statsDoc.data();
    
    // Calculate balance delta
    let balanceDelta = 0;
    if (type === 'deposit' || type === 'return' || type === 'opening_balance') {
      balanceDelta = amount;
    } else if (type === 'withdrawal') {
      balanceDelta = -amount;
    }

    const newBalance = stats.poolBalance + balanceDelta;
    
    // Enforce non-negative balance
    if (newBalance < 0) {
      throw new Error(
        `Insufficient pool balance. Available: ₹${stats.poolBalance}, Requested: ₹${amount}`
      );
    }

    // Create transaction document
    const txRef = doc(collection(db, 'transactions'));
    transaction.set(txRef, {
      type,
      memberId,
      amount,
      date: Timestamp.fromDate(date),
      fy,
      savingsMonth: savingsMonth || null,
      notes: notes || null,
      status: 'active',
      createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update stats
    const updates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: serverTimestamp(),
    };

    if (type === 'deposit' || type === 'opening_balance') {
      updates.totalDeposit = (stats.totalDeposit || 0) + amount;
    }
    if (type === 'return') {
      updates.totalReturn = (stats.totalReturn || 0) + amount;
    }
    if (type === 'withdrawal') {
      updates.totalWithdrawal = (stats.totalWithdrawal || 0) + amount;
    }

    transaction.update(statsRef, updates);

    return { txId: txRef.id, newBalance };
  });

  return result;
}

interface UpdateTransactionParams {
  txId: string;
  type?: TransactionType;
  memberId?: string;
  amount?: number;
  date?: Date;
  savingsMonth?: string;
  notes?: string;
}

export async function updateTransaction(params: UpdateTransactionParams) {
  const { txId, type, memberId, amount, date, savingsMonth, notes } = params;

  const result = await runTransaction(db, async (transaction) => {
    const txRef = doc(db, 'transactions', txId);
    const txDoc = await transaction.get(txRef);

    if (!txDoc.exists()) {
      throw new Error('Transaction not found');
    }

    const oldTx = txDoc.data();
    
    if (oldTx.status === 'void') {
      throw new Error('Cannot edit a voided transaction');
    }

    const statsRef = doc(db, 'stats', 'current');
    const statsDoc = await transaction.get(statsRef);
    const stats = statsDoc.data()!;

    // Calculate old delta
    let oldDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(oldTx.type)) {
      oldDelta = oldTx.amount;
    }
    if (oldTx.type === 'withdrawal') {
      oldDelta = -oldTx.amount;
    }

    // Calculate new delta
    const newType = type || oldTx.type;
    const newAmount = amount ?? oldTx.amount;
    let newDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(newType)) {
      newDelta = newAmount;
    }
    if (newType === 'withdrawal') {
      newDelta = -newAmount;
    }

    const balanceChange = newDelta - oldDelta;
    const newBalance = stats.poolBalance + balanceChange;

    if (newBalance < 0) {
      throw new Error(`Insufficient pool balance. Available: ₹${stats.poolBalance}`);
    }

    // Update transaction
    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (type) updateData.type = type;
    if (memberId) updateData.memberId = memberId;
    if (amount !== undefined) updateData.amount = amount;
    if (date) {
      updateData.date = Timestamp.fromDate(date);
      updateData.fy = getFY(date);
    }
    if (savingsMonth !== undefined) updateData.savingsMonth = savingsMonth;
    if (notes !== undefined) updateData.notes = notes;

    transaction.update(txRef, updateData);

    // Update stats
    const statsUpdates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: serverTimestamp(),
    };

    if (oldTx.type !== newType) {
      // Type changed: subtract from old total, add to new total
      if (oldTx.type === 'deposit' || oldTx.type === 'opening_balance') {
        statsUpdates.totalDeposit = (stats.totalDeposit || 0) - oldTx.amount;
      }
      if (oldTx.type === 'return') {
        statsUpdates.totalReturn = (stats.totalReturn || 0) - oldTx.amount;
      }
      if (oldTx.type === 'withdrawal') {
        statsUpdates.totalWithdrawal = (stats.totalWithdrawal || 0) - oldTx.amount;
      }
      
      if (newType === 'deposit' || newType === 'opening_balance') {
        statsUpdates.totalDeposit = ((statsUpdates.totalDeposit ?? stats.totalDeposit) || 0) + newAmount;
      }
      if (newType === 'return') {
        statsUpdates.totalReturn = ((statsUpdates.totalReturn ?? stats.totalReturn) || 0) + newAmount;
      }
      if (newType === 'withdrawal') {
        statsUpdates.totalWithdrawal = ((statsUpdates.totalWithdrawal ?? stats.totalWithdrawal) || 0) + newAmount;
      }
    } else if (oldTx.amount !== newAmount) {
      // Amount changed
      if (newType === 'deposit' || newType === 'opening_balance') {
        statsUpdates.totalDeposit = (stats.totalDeposit || 0) + (newAmount - oldTx.amount);
      }
      if (newType === 'return') {
        statsUpdates.totalReturn = (stats.totalReturn || 0) + (newAmount - oldTx.amount);
      }
      if (newType === 'withdrawal') {
        statsUpdates.totalWithdrawal = (stats.totalWithdrawal || 0) + (newAmount - oldTx.amount);
      }
    }

    transaction.update(statsRef, statsUpdates);

    return { newBalance };
  });

  return result;
}

interface VoidTransactionParams {
  txId: string;
  reason: string;
}

export async function voidTransaction(params: VoidTransactionParams) {
  const { txId, reason } = params;

  const result = await runTransaction(db, async (transaction) => {
    const txRef = doc(db, 'transactions', txId);
    const txDoc = await transaction.get(txRef);

    if (!txDoc.exists()) {
      throw new Error('Transaction not found');
    }

    const oldTx = txDoc.data();
    
    if (oldTx.status === 'void') {
      throw new Error('Transaction already voided');
    }

    const statsRef = doc(db, 'stats', 'current');
    const statsDoc = await transaction.get(statsRef);
    const stats = statsDoc.data()!;

    // Reverse the transaction
    let reversalDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(oldTx.type)) {
      reversalDelta = -oldTx.amount;
    }
    if (oldTx.type === 'withdrawal') {
      reversalDelta = oldTx.amount;
    }

    const newBalance = stats.poolBalance + reversalDelta;

    // Void transaction
    transaction.update(txRef, {
      status: 'void',
      voidReason: reason,
      updatedAt: serverTimestamp(),
    });

    // Update stats
    const statsUpdates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: serverTimestamp(),
    };

    if (oldTx.type === 'deposit' || oldTx.type === 'opening_balance') {
      statsUpdates.totalDeposit = (stats.totalDeposit || 0) - oldTx.amount;
    }
    if (oldTx.type === 'return') {
      statsUpdates.totalReturn = (stats.totalReturn || 0) - oldTx.amount;
    }
    if (oldTx.type === 'withdrawal') {
      statsUpdates.totalWithdrawal = (stats.totalWithdrawal || 0) - oldTx.amount;
    }

    transaction.update(statsRef, statsUpdates);

    return { newBalance };
  });

  return result;
}

function getFY(date: Date, fyStartMonth = 4): string {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= fyStartMonth) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}
