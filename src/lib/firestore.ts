import { collection, doc, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';

export const usersRef = collection(db, 'users');
export const membersRef = collection(db, 'members');
export const transactionsRef = collection(db, 'transactions');
export const configRef = doc(db, 'config', 'app');
export const statsRef = doc(db, 'stats', 'current');
export const maintainerHistoryRef = collection(db, 'maintainerHistory');

export function getTransactionsByFY(fy: string) {
  return query(
    transactionsRef,
    where('fy', '==', fy),
    where('status', '==', 'active'),
    orderBy('date', 'desc')
  );
}

export function getTransactionsByMember(memberId: string) {
  return query(
    transactionsRef,
    where('memberId', '==', memberId),
    where('status', 'in', ['active', 'void']),
    orderBy('date', 'desc')
  );
}

export function getAllActiveTransactions() {
  return query(
    transactionsRef,
    where('status', '==', 'active'),
    orderBy('date', 'desc'),
    limit(100)
  );
}

export function getAllTransactions() {
  return query(
    transactionsRef,
    where('status', 'in', ['active', 'void']),
    orderBy('date', 'desc'),
    limit(100)
  );
}
