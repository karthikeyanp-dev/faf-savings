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

/**
 * Every active transaction, unbounded. This feeds the lifetime per-member
 * KPIs (borrowed / repaid / outstanding), which are wrong if the window
 * clips an old borrow while keeping its recent repayment. The pool is a
 * small private group, so the full set is a few hundred docs at most —
 * and it is fetched once and shared via the ['transactions','all-active']
 * query cache across Dashboard and Members.
 *
 * Expected upper bound: ~50 members × ~24 transactions/year, i.e. low
 * thousands after a decade. Past that, replace the derived KPIs with a
 * server-side rollup (a scheduled function maintaining per-member and pool
 * aggregate docs) rather than paginating here — partial windows are what
 * made the lifetime figures wrong in the first place.
 */
export function getAllActiveTransactions() {
  return query(
    transactionsRef,
    where('status', '==', 'active'),
    orderBy('date', 'desc')
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
