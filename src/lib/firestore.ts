import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';

export const membersRef = collection(db, 'members');
export const transactionsRef = collection(db, 'transactions');
export const statsRef = doc(db, 'stats', 'current');

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

export function getAllTransactions(
  cursor?: QueryDocumentSnapshot<DocumentData>
) {
  const constraints: Parameters<typeof query>[1][] = [
    where('status', 'in', ['active', 'void']),
    orderBy('date', 'desc'),
    limit(50),
  ];
  if (cursor) {
    constraints.push(startAfter(cursor));
  }
  return query(transactionsRef, ...constraints);
}
