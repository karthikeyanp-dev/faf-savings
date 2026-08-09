import { Timestamp } from 'firebase/firestore';
import type { TransactionType } from '../types';

/** Maps legacy type values to current ones. Handles old 'return' → 'repayment'. */
export function normalizeTransactionType(type: string): TransactionType {
  if (type === 'return') return 'repayment';
  return type as TransactionType;
}

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

/**
 * Canonical pool-level lifetime figures, derived from the ledger.
 *
 * These are computed from the transactions rather than read from
 * `stats/current`, because that doc is a denormalized running total that
 * only the app's own writes keep up to date: it drifts whenever documents
 * are changed outside the app, and it never included the config-level
 * `openingBalances` / `openingInterest` at all. Deriving keeps the pool
 * banner in agreement with the per-member cards, which have always been
 * computed from the same list via buildMemberTotalsMap().
 */
export interface PoolTotals {
  /** Cash the pool actually holds: deposited + interest + repaid − withdrawn − borrowed − paidOut. */
  balance: number;
  /** Lifetime member contributions: opening balances + deposits. */
  deposited: number;
  /** Lifetime interest credited: opening interest + interest transactions. */
  interest: number;
  /** Lifetime repayments (legacy 'return' normalized). */
  repaid: number;
  /** Lifetime withdrawals. */
  withdrawn: number;
  /** Lifetime borrows. */
  borrowed: number;
  /** Lifetime payouts. */
  paidOut: number;
}

/**
 * `openingBalanceTotal` / `openingInterest` come from `config/app`, which is
 * the source of truth for carried-forward figures; `opening_balance`
 * transactions are deliberately ignored here, matching accumulate() so the
 * pool total and the member cards can never count them differently.
 *
 * Carried-forward *interest* has no dedicated transaction type, so it cannot
 * be excluded symmetrically: an `interest` row that mirrors
 * `config.openingInterest` would be counted twice (once from the ledger, once
 * from config). Nothing in the app writes such a row — the only code path
 * that did, setOpeningBalances(), is unused, and SetOpeningBalanceDialog
 * writes config/app only — but `npx tsx scripts/reconcile-stats.ts` detects
 * the collision on real data and refuses to write. If carried-forward
 * interest ever needs a ledger row, give it its own type and exclude it here
 * the way `opening_balance` is excluded.
 */
export function computePoolTotals(
  transactions: LightweightTransaction[],
  openingBalanceTotal = 0,
  openingInterest = 0
): PoolTotals {
  const totals: PoolTotals = {
    balance: 0,
    deposited: openingBalanceTotal,
    interest: openingInterest,
    repaid: 0,
    withdrawn: 0,
    borrowed: 0,
    paidOut: 0,
  };
  for (const t of transactions) {
    if (t.status !== 'active') continue;
    const type = normalizeTransactionType(t.type);
    if (type === 'deposit') totals.deposited += t.amount;
    else if (type === 'interest') totals.interest += t.amount;
    else if (type === 'repayment') totals.repaid += t.amount;
    else if (type === 'withdrawal') totals.withdrawn += t.amount;
    else if (type === 'borrow') totals.borrowed += t.amount;
    else if (type === 'payout') totals.paidOut += t.amount;
  }
  totals.balance =
    totals.deposited +
    totals.interest +
    totals.repaid -
    totals.withdrawn -
    totals.borrowed -
    totals.paidOut;
  return totals;
}

export function calculatePoolBalance(
  transactions: LightweightTransaction[],
  openingBalanceTotal = 0,
  openingInterest = 0
): number {
  return computePoolTotals(transactions, openingBalanceTotal, openingInterest).balance;
}

export function calculateMemberNet(
  transactions: Array<LightweightTransaction & { memberId: string }>,
  memberId: string,
  openingBalance = 0
): number {
  return transactions
    .filter(t => t.status === 'active' && t.memberId === memberId)
    .reduce((sum, t) => {
      const type = normalizeTransactionType(t.type);
      if (type === 'deposit' || type === 'repayment') return sum + t.amount;
      if (type === 'withdrawal' || type === 'borrow' || type === 'payout') return sum - t.amount;
      return sum;
    }, openingBalance);
}

/**
 * Debt still owed by one member. Thin wrapper over computeMemberTotals so
 * this and the UI can never disagree about what "outstanding" means.
 */
export function calculateMemberOutstanding(
  transactions: Array<LightweightTransaction & { memberId?: string }>,
  memberId: string,
  openingBalance = 0
): number {
  return computeMemberTotals(
    transactions.filter(t => t.memberId === memberId),
    openingBalance
  ).outstanding;
}

/**
 * Canonical per-member aggregates. Every page (Dashboard, Members,
 * MemberDetail) and the add-transaction caps must source their member
 * figures from these helpers so the same concept always shows the same
 * number app-wide.
 */
export interface MemberTotals {
  /** Current balance: lifetime net flows (dep + rep − wd − bor − pay) + openingBalance. */
  net: number;
  /** Lifetime deposits. */
  deposited: number;
  /** Lifetime repayments (legacy 'return' normalized). */
  repaid: number;
  /** Lifetime withdrawals. Payouts are tracked separately in `paidOut`. */
  withdrawn: number;
  /** Lifetime payouts (full balance settlements), mirroring PoolTotals. */
  paidOut: number;
  /** Lifetime borrows. */
  borrowed: number;
  /** Debt: borrows + carried-forward negative opening balance − repayments. */
  outstanding: number;
  /** Current-FY deposits. */
  fyDeposited: number;
  /** Current-FY gross withdrawals. */
  fyWithdrawn: number;
  /** Current-FY payouts. */
  fyPaidOut: number;
  /** Savings progress base: fyDeposited − fyWithdrawn − fyPaidOut. */
  fyNetBalance: number;
}

interface RawMemberAccum {
  flows: number;
  deposited: number;
  repaid: number;
  withdrawn: number;
  paidOut: number;
  borrowed: number;
  fyDeposited: number;
  fyWithdrawn: number;
  fyPaidOut: number;
}

const emptyAccum = (): RawMemberAccum => ({
  flows: 0,
  deposited: 0,
  repaid: 0,
  withdrawn: 0,
  paidOut: 0,
  borrowed: 0,
  fyDeposited: 0,
  fyWithdrawn: 0,
  fyPaidOut: 0,
});

function accumulate(raw: RawMemberAccum, t: LightweightTransaction & { fy?: string }, currentFY?: string) {
  const type = normalizeTransactionType(t.type);
  if (type === 'deposit') {
    raw.flows += t.amount;
    raw.deposited += t.amount;
  } else if (type === 'repayment') {
    raw.flows += t.amount;
    raw.repaid += t.amount;
  } else if (type === 'withdrawal') {
    raw.flows -= t.amount;
    raw.withdrawn += t.amount;
  } else if (type === 'payout') {
    // Kept out of `withdrawn` so the member cards and PoolTotals/PoolFYStats
    // agree on what "withdrawn" means; both drain savings, so both reduce
    // net and the FY savings progress below.
    raw.flows -= t.amount;
    raw.paidOut += t.amount;
  } else if (type === 'borrow') {
    raw.flows -= t.amount;
    raw.borrowed += t.amount;
  }
  if (t.fy === currentFY) {
    if (type === 'deposit') raw.fyDeposited += t.amount;
    else if (type === 'withdrawal') raw.fyWithdrawn += t.amount;
    else if (type === 'payout') raw.fyPaidOut += t.amount;
  }
}

function finalizeMemberTotals(raw: RawMemberAccum, openingBalance: number): MemberTotals {
  return {
    net: raw.flows + openingBalance,
    deposited: raw.deposited,
    repaid: raw.repaid,
    withdrawn: raw.withdrawn,
    paidOut: raw.paidOut,
    borrowed: raw.borrowed,
    // Withdrawals draw savings and never create debt; deposits do not
    // offset it. Only borrows + a negative opening balance create debt.
    outstanding: Math.max(0, raw.borrowed + Math.max(0, -openingBalance) - raw.repaid),
    fyDeposited: raw.fyDeposited,
    fyWithdrawn: raw.fyWithdrawn,
    fyPaidOut: raw.fyPaidOut,
    // Savings progress tracks savings flows only (deposits − withdrawals −
    // payouts); borrows/repayments are debt flows and don't affect the FY
    // target. A full payout must pull the bar back down with the balance.
    fyNetBalance: raw.fyDeposited - raw.fyWithdrawn - raw.fyPaidOut,
  };
}

/** Totals for a member with no transactions (opening balance only). */
export function emptyMemberTotals(openingBalance = 0): MemberTotals {
  return finalizeMemberTotals(emptyAccum(), openingBalance);
}

export function computeMemberTotals(
  transactions: Array<LightweightTransaction & { memberId?: string; fy?: string }>,
  openingBalance = 0,
  currentFY?: string,
): MemberTotals {
  const raw = emptyAccum();
  for (const t of transactions) {
    if (t.status !== 'active') continue;
    accumulate(raw, t, currentFY);
  }
  return finalizeMemberTotals(raw, openingBalance);
}

/**
 * One-pass per-member totals over a shared transaction list (e.g. all
 * active transactions), keyed by memberId. Every id in `memberIds` gets
 * an entry (zeroed when it has no transactions) so callers can `.get(id)!`
 * safely; extra members present in the transactions are included too.
 */
export function buildMemberTotalsMap(
  transactions: Array<LightweightTransaction & { memberId?: string; fy?: string }>,
  memberIds: string[],
  openingBalances?: Record<string, number>,
  currentFY?: string,
): Map<string, MemberTotals> {
  const rawByMember = new Map<string, RawMemberAccum>();
  for (const memberId of memberIds) rawByMember.set(memberId, emptyAccum());
  for (const t of transactions) {
    if (t.status !== 'active' || !t.memberId) continue;
    const raw = rawByMember.get(t.memberId) ?? emptyAccum();
    accumulate(raw, t, currentFY);
    rawByMember.set(t.memberId, raw);
  }
  const map = new Map<string, MemberTotals>();
  for (const [memberId, raw] of rawByMember) {
    map.set(memberId, finalizeMemberTotals(raw, openingBalances?.[memberId] ?? 0));
  }
  return map;
}

export interface PoolFYStats {
  deposited: number;
  withdrawn: number;
  repaid: number;
  borrowed: number;
  payout: number;
  interest: number;
}

/** Pool-level totals for one FY (member-agnostic, e.g. interest included). */
export function computePoolFYStats(
  transactions: Array<LightweightTransaction & { fy?: string }>,
  currentFY: string,
): PoolFYStats {
  const stats: PoolFYStats = {
    deposited: 0,
    withdrawn: 0,
    repaid: 0,
    borrowed: 0,
    payout: 0,
    interest: 0,
  };
  for (const t of transactions) {
    if (t.status !== 'active' || t.fy !== currentFY) continue;
    const type = normalizeTransactionType(t.type);
    if (type === 'deposit') stats.deposited += t.amount;
    else if (type === 'withdrawal') stats.withdrawn += t.amount;
    else if (type === 'repayment') stats.repaid += t.amount;
    else if (type === 'borrow') stats.borrowed += t.amount;
    else if (type === 'payout') stats.payout += t.amount;
    else if (type === 'interest') stats.interest += t.amount;
  }
  return stats;
}

export function getOpeningBalance(
  openingBalances: Record<string, number> | undefined,
  memberId: string
): number {
  return openingBalances?.[memberId] ?? 0;
}

export function getTotalOpeningBalance(
  openingBalances: Record<string, number> | undefined
): number {
  return Object.values(openingBalances ?? {}).reduce((sum, amount) => sum + amount, 0);
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

/** Short month labels (0-indexed). */
const MONTH_LABELS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

const MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format a `"YYYY-MM"` savings month string.
 * - `'upper'` → `"MAR 2026"`
 * - `'short'` → `"Mar-2026"`
 * Returns the raw value unchanged if parsing fails (backward compat).
 */
export function formatSavingsMonth(value: string, style: 'upper' | 'short' = 'short'): string {
  if (!value) return value;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value;
  if (style === 'upper') return `${MONTH_LABELS[monthIdx]} ${year}`;
  return `${MONTH_LABELS_SHORT[monthIdx]}-${year}`;
}

export function getMonthLabels(): string[] {
  return MONTH_LABELS;
}

export function getCurrentSavingsMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
