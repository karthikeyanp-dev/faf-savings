import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

function getFY(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  if (month >= 4) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

async function verifyMaintainer(uid: string): Promise<void> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'maintainer') {
    throw new functions.https.HttpsError('permission-denied', 'Only maintainer can perform this action');
  }
}

export const createTransaction = functions.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  await verifyMaintainer(uid);

  const data = request.data as any;
  if (typeof data.amount !== 'number' || Number.isNaN(data.amount) || !data.date) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid transaction data');
  }
  if (data.type !== 'opening_balance' && data.amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Amount must be greater than 0');
  }
  // memberId is required for all types except 'interest'
  if (data.type !== 'interest' && !data.memberId) {
    throw new functions.https.HttpsError('invalid-argument', 'memberId is required for this transaction type');
  }
  if (data.type === 'deposit' && !data.savingsMonth) {
    throw new functions.https.HttpsError('invalid-argument', 'savingsMonth required for deposits');
  }

  const fy = getFY(data.date);

  return db.runTransaction(async (tx) => {
    const statsRef = db.collection('stats').doc('current');
    const statsDoc = await tx.get(statsRef);
    if (!statsDoc.exists) throw new Error('Stats document not found');
    const stats = statsDoc.data()!;

    let balanceDelta = 0;
    if (data.type === 'deposit' || data.type === 'return' || data.type === 'opening_balance' || data.type === 'interest') {
      balanceDelta = data.amount;
    } else if (data.type === 'withdrawal') {
      balanceDelta = -data.amount;
    }

    const newBalance = stats.poolBalance + balanceDelta;
    // Interest and opening_balance are exempt from balance check
    if (newBalance < 0 && data.type !== 'interest' && data.type !== 'opening_balance') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Insufficient pool balance. Available: ${stats.poolBalance}, Requested: ${data.amount}`
      );
    }

    const txRef = db.collection('transactions').doc();
    const txData: Record<string, any> = {
      type: data.type,
      amount: data.amount,
      date: admin.firestore.Timestamp.fromDate(new Date(data.date)),
      fy,
      savingsMonth: data.savingsMonth || null,
      notes: data.notes || null,
      status: 'active',
      createdByUid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Only include memberId if provided (not for interest)
    if (data.memberId) {
      txData.memberId = data.memberId;
    }
    tx.set(txRef, txData);

    const updates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.type === 'deposit' || data.type === 'opening_balance') {
      updates.totalDeposit = (stats.totalDeposit || 0) + data.amount;
    }
    if (data.type === 'return') {
      updates.totalReturn = (stats.totalReturn || 0) + data.amount;
    }
    if (data.type === 'withdrawal') {
      updates.totalWithdrawal = (stats.totalWithdrawal || 0) + data.amount;
    }
    if (data.type === 'interest') {
      updates.totalInterest = (stats.totalInterest || 0) + data.amount;
    }

    tx.update(statsRef, updates);

    return { txId: txRef.id, newBalance };
  });
});

export const updateTransaction = functions.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  await verifyMaintainer(uid);

  const { txId, ...updates } = request.data as any;

  return db.runTransaction(async (tx) => {
    const txRef = db.collection('transactions').doc(txId);
    const txDoc = await tx.get(txRef);
    if (!txDoc.exists) throw new functions.https.HttpsError('not-found', 'Transaction not found');
    if (txDoc.data()?.status === 'void') {
      throw new functions.https.HttpsError('failed-precondition', 'Cannot edit a voided transaction');
    }

    const oldTx = txDoc.data()!;
    const statsRef = db.collection('stats').doc('current');
    const statsDoc = await tx.get(statsRef);
    const stats = statsDoc.data()!;

    let oldDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(oldTx.type)) oldDelta = oldTx.amount;
    if (oldTx.type === 'withdrawal') oldDelta = -oldTx.amount;

    const newType = updates.type || oldTx.type;
    const newAmount = updates.amount ?? oldTx.amount;
    let newDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(newType)) newDelta = newAmount;
    if (newType === 'withdrawal') newDelta = -newAmount;

    const balanceChange = newDelta - oldDelta;
    const newBalance = stats.poolBalance + balanceChange;
    if (newBalance < 0) {
      throw new functions.https.HttpsError('failed-precondition', `Insufficient pool balance. Available: ${stats.poolBalance}`);
    }

    const updateData: Record<string, any> = {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (updates.date) {
      updateData.fy = getFY(updates.date);
      updateData.date = admin.firestore.Timestamp.fromDate(new Date(updates.date));
    }

    tx.update(txRef, updateData);

    const statsUpdates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (oldTx.type !== newType) {
      if (oldTx.type === 'deposit' || oldTx.type === 'opening_balance') {
        statsUpdates.totalDeposit = (stats.totalDeposit || 0) - oldTx.amount;
      }
      if (oldTx.type === 'return') statsUpdates.totalReturn = (stats.totalReturn || 0) - oldTx.amount;
      if (oldTx.type === 'withdrawal') statsUpdates.totalWithdrawal = (stats.totalWithdrawal || 0) - oldTx.amount;
      
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

    tx.update(statsRef, statsUpdates);
    return { newBalance };
  });
});

export const voidTransaction = functions.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  await verifyMaintainer(uid);

  const { txId, reason } = request.data as any;
  if (!reason) throw new functions.https.HttpsError('invalid-argument', 'Void reason required');

  return db.runTransaction(async (tx) => {
    const txRef = db.collection('transactions').doc(txId);
    const txDoc = await tx.get(txRef);
    if (!txDoc.exists) throw new functions.https.HttpsError('not-found', 'Transaction not found');
    if (txDoc.data()?.status === 'void') {
      throw new functions.https.HttpsError('failed-precondition', 'Transaction already voided');
    }

    const oldTx = txDoc.data()!;
    const statsRef = db.collection('stats').doc('current');
    const statsDoc = await tx.get(statsRef);
    const stats = statsDoc.data()!;

    let reversalDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(oldTx.type)) reversalDelta = -oldTx.amount;
    if (oldTx.type === 'withdrawal') reversalDelta = oldTx.amount;

    const newBalance = stats.poolBalance + reversalDelta;

    tx.update(txRef, {
      status: 'void',
      voidReason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const statsUpdates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

    tx.update(statsRef, statsUpdates);
    return { newBalance };
  });
});
