import {
  runTransaction,
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TransactionType } from "@/types";

interface CreateTransactionParams {
  type: TransactionType;
  memberId?: string;
  amount: number;
  date: Date;
  savingsMonth?: string;
  notes?: string;
  createdByUid: string;
}

export async function createTransaction(params: CreateTransactionParams) {
  const { type, memberId, amount, date, savingsMonth, notes, createdByUid } =
    params;

  const fy = getFY(date);

  const result = await runTransaction(db, async (transaction) => {
    const statsRef = doc(db, "stats", "current");
    const statsDoc = await transaction.get(statsRef);

    if (!statsDoc.exists()) {
      throw new Error(
        "Stats document not found. Please run seed script first.",
      );
    }

    const stats = statsDoc.data();

    // Calculate balance delta
    // opening_balance: amount can be positive or negative
    // deposit/return/interest: always positive amount, adds to pool
    // withdrawal: always positive amount, subtracts from pool
    let balanceDelta = 0;
    if (type === "deposit" || type === "return") {
      balanceDelta = amount;
    } else if (type === "opening_balance" || type === "interest") {
      balanceDelta = amount; // can be positive or negative
    } else if (type === "withdrawal") {
      balanceDelta = -amount;
    }

    const newBalance = stats.poolBalance + balanceDelta;

    // Enforce non-negative balance (opening_balance and interest exempted)
    if (newBalance < 0 && type !== "opening_balance" && type !== "interest") {
      throw new Error(
        `Insufficient pool balance. Available: ₹${stats.poolBalance}, Requested: ₹${amount}`,
      );
    }

    // Create transaction document
    const txRef = doc(collection(db, "transactions"));
    const txData: Record<string, any> = {
      type,
      amount,
      date: Timestamp.fromDate(date),
      fy,
      savingsMonth: savingsMonth || null,
      notes: notes || null,
      status: "active",
      createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    // Only include memberId if provided (not for interest transactions)
    if (memberId) {
      txData.memberId = memberId;
    }
    transaction.set(txRef, txData);

    // Update stats
    const updates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: serverTimestamp(),
    };

    if (type === "deposit" || type === "opening_balance") {
      updates.totalDeposit = (stats.totalDeposit || 0) + amount;
    }
    if (type === "return") {
      updates.totalReturn = (stats.totalReturn || 0) + amount;
    }
    if (type === "withdrawal") {
      updates.totalWithdrawal = (stats.totalWithdrawal || 0) + amount;
    }
    if (type === "interest") {
      updates.totalInterest = (stats.totalInterest || 0) + amount;
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
    const txRef = doc(db, "transactions", txId);
    const txDoc = await transaction.get(txRef);

    if (!txDoc.exists()) {
      throw new Error("Transaction not found");
    }

    const oldTx = txDoc.data();

    if (oldTx.status === "void") {
      throw new Error("Cannot edit a voided transaction");
    }

    const statsRef = doc(db, "stats", "current");
    const statsDoc = await transaction.get(statsRef);
    const stats = statsDoc.data()!;

    // Calculate old delta
    let oldDelta = 0;
    if (["deposit", "return", "opening_balance", "interest"].includes(oldTx.type)) {
      oldDelta = oldTx.amount;
    }
    if (oldTx.type === "withdrawal") {
      oldDelta = -oldTx.amount;
    }

    // Calculate new delta
    const newType = type || oldTx.type;
    const newAmount = amount ?? oldTx.amount;
    let newDelta = 0;
    if (["deposit", "return", "opening_balance", "interest"].includes(newType)) {
      newDelta = newAmount;
    }
    if (newType === "withdrawal") {
      newDelta = -newAmount;
    }

    const balanceChange = newDelta - oldDelta;
    const newBalance = stats.poolBalance + balanceChange;

    if (
      newBalance < 0 &&
      newType !== "opening_balance" &&
      newType !== "interest" &&
      oldTx.type !== "opening_balance" &&
      oldTx.type !== "interest"
    ) {
      throw new Error(
        `Insufficient pool balance. Available: ₹${stats.poolBalance}`,
      );
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
      if (oldTx.type === "deposit" || oldTx.type === "opening_balance") {
        statsUpdates.totalDeposit = (stats.totalDeposit || 0) - oldTx.amount;
      }
      if (oldTx.type === "return") {
        statsUpdates.totalReturn = (stats.totalReturn || 0) - oldTx.amount;
      }
      if (oldTx.type === "withdrawal") {
        statsUpdates.totalWithdrawal =
          (stats.totalWithdrawal || 0) - oldTx.amount;
      }
      if (oldTx.type === "interest") {
        statsUpdates.totalInterest = (stats.totalInterest || 0) - oldTx.amount;
      }

      if (newType === "deposit" || newType === "opening_balance") {
        statsUpdates.totalDeposit =
          ((statsUpdates.totalDeposit ?? stats.totalDeposit) || 0) + newAmount;
      }
      if (newType === "return") {
        statsUpdates.totalReturn =
          ((statsUpdates.totalReturn ?? stats.totalReturn) || 0) + newAmount;
      }
      if (newType === "withdrawal") {
        statsUpdates.totalWithdrawal =
          ((statsUpdates.totalWithdrawal ?? stats.totalWithdrawal) || 0) +
          newAmount;
      }
      if (newType === "interest") {
        statsUpdates.totalInterest =
          ((statsUpdates.totalInterest ?? stats.totalInterest) || 0) + newAmount;
      }
    } else if (oldTx.amount !== newAmount) {
      // Amount changed
      if (newType === "deposit" || newType === "opening_balance") {
        statsUpdates.totalDeposit =
          (stats.totalDeposit || 0) + (newAmount - oldTx.amount);
      }
      if (newType === "return") {
        statsUpdates.totalReturn =
          (stats.totalReturn || 0) + (newAmount - oldTx.amount);
      }
      if (newType === "withdrawal") {
        statsUpdates.totalWithdrawal =
          (stats.totalWithdrawal || 0) + (newAmount - oldTx.amount);
      }
      if (newType === "interest") {
        statsUpdates.totalInterest =
          (stats.totalInterest || 0) + (newAmount - oldTx.amount);
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
    const txRef = doc(db, "transactions", txId);
    const txDoc = await transaction.get(txRef);

    if (!txDoc.exists()) {
      throw new Error("Transaction not found");
    }

    const oldTx = txDoc.data();

    if (oldTx.status === "void") {
      throw new Error("Transaction already voided");
    }

    const statsRef = doc(db, "stats", "current");
    const statsDoc = await transaction.get(statsRef);
    const stats = statsDoc.data()!;

    // Reverse the transaction
    let reversalDelta = 0;
    if (["deposit", "return", "opening_balance", "interest"].includes(oldTx.type)) {
      reversalDelta = -oldTx.amount;
    }
    if (oldTx.type === "withdrawal") {
      reversalDelta = oldTx.amount;
    }

    const newBalance = stats.poolBalance + reversalDelta;

    // Void transaction
    transaction.update(txRef, {
      status: "void",
      voidReason: reason,
      updatedAt: serverTimestamp(),
    });

    // Update stats
    const statsUpdates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: serverTimestamp(),
    };

    if (oldTx.type === "deposit" || oldTx.type === "opening_balance") {
      statsUpdates.totalDeposit = (stats.totalDeposit || 0) - oldTx.amount;
    }
    if (oldTx.type === "return") {
      statsUpdates.totalReturn = (stats.totalReturn || 0) - oldTx.amount;
    }
    if (oldTx.type === "withdrawal") {
      statsUpdates.totalWithdrawal =
        (stats.totalWithdrawal || 0) - oldTx.amount;
    }
    if (oldTx.type === "interest") {
      statsUpdates.totalInterest = (stats.totalInterest || 0) - oldTx.amount;
    }

    transaction.update(statsRef, statsUpdates);

    return { newBalance };
  });

  return result;
}

interface SetOpeningBalanceEntry {
  memberId: string;
  amount: number;
}

interface SetOpeningBalancesParams {
  entries: SetOpeningBalanceEntry[];
  openingInterest?: number;
  date: Date;
  fy: string;
  createdByUid: string;
}

export async function setOpeningBalances(params: SetOpeningBalancesParams) {
  const { entries, openingInterest, date, fy, createdByUid } = params;

  const [existingObSnap, existingInterestSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, "transactions"),
        where("type", "==", "opening_balance"),
        where("status", "==", "active"),
      ),
    ),
    getDocs(
      query(
        collection(db, "transactions"),
        where("type", "==", "interest"),
        where("status", "==", "active"),
        where("notes", "==", `Opening interest for FY ${fy}`),
      ),
    ),
  ]);

  const result = await runTransaction(db, async (transaction) => {
    const statsRef = doc(db, "stats", "current");
    const statsDoc = await transaction.get(statsRef);

    if (!statsDoc.exists()) {
      throw new Error(
        "Stats document not found. Please run seed script first.",
      );
    }

    const stats = statsDoc.data();
    const existingObDocs = await Promise.all(
      existingObSnap.docs.map((snapshot) => transaction.get(snapshot.ref)),
    );
    const existingInterestDocs = await Promise.all(
      existingInterestSnap.docs.map((snapshot) => transaction.get(snapshot.ref)),
    );

    let totalObReversal = 0;
    for (const obDoc of existingObDocs) {
      if (!obDoc.exists()) continue;
      const obData = obDoc.data();
      if (obData.status !== "active") continue;
      totalObReversal += obData.amount;
      transaction.update(obDoc.ref, {
        status: "void",
        voidReason: "Replaced by new opening balance",
        updatedAt: serverTimestamp(),
      });
    }

    let totalInterestReversal = 0;
    for (const intDoc of existingInterestDocs) {
      if (!intDoc.exists()) continue;
      const intData = intDoc.data();
      if (intData.status !== "active") continue;
      totalInterestReversal += intData.amount;
      transaction.update(intDoc.ref, {
        status: "void",
        voidReason: "Replaced by new opening interest",
        updatedAt: serverTimestamp(),
      });
    }

    let totalNewOb = 0;
    for (const entry of entries) {
      if (entry.amount === 0) continue;
      totalNewOb += entry.amount;
      const txRef = doc(collection(db, "transactions"));
      transaction.set(txRef, {
        type: "opening_balance",
        memberId: entry.memberId,
        amount: entry.amount,
        date: Timestamp.fromDate(date),
        fy,
        savingsMonth: null,
        notes: `Opening balance for FY ${fy}`,
        status: "active",
        createdByUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    let totalNewInterest = 0;
    if (openingInterest !== undefined && openingInterest !== 0) {
      totalNewInterest = openingInterest;
      const interestTxRef = doc(collection(db, "transactions"));
      transaction.set(interestTxRef, {
        type: "interest",
        amount: openingInterest,
        date: Timestamp.fromDate(date),
        fy,
        savingsMonth: null,
        notes: `Opening interest for FY ${fy}`,
        status: "active",
        createdByUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const obNetChange = totalNewOb - totalObReversal;
    const interestNetChange = totalNewInterest - totalInterestReversal;
    const totalNetChange = obNetChange + interestNetChange;

    const newPoolBalance = stats.poolBalance + totalNetChange;
    const newTotalDeposit =
      (stats.totalDeposit || 0) - totalObReversal + totalNewOb;
    const newTotalInterest =
      (stats.totalInterest || 0) - totalInterestReversal + totalNewInterest;

    transaction.update(statsRef, {
      poolBalance: newPoolBalance,
      totalDeposit: newTotalDeposit,
      totalInterest: newTotalInterest,
      updatedAt: serverTimestamp(),
    });

    return {
      voidedCount: existingObDocs.filter((snapshot) => snapshot.exists() && snapshot.data().status === "active").length + existingInterestDocs.filter((snapshot) => snapshot.exists() && snapshot.data().status === "active").length,
      createdCount: entries.filter((entry) => entry.amount !== 0).length + (openingInterest !== undefined && openingInterest !== 0 ? 1 : 0),
      newPoolBalance,
    };
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
