import { describe, it, expect } from 'vitest';
import { getFY, parseFY, calculatePoolBalance, calculateMemberNet, formatINR, normalizeTransactionType } from './financialYear';

describe('getFY', () => {
  it('returns 2025-2026 for April 2025', () => {
    expect(getFY(new Date(2025, 3, 1))).toBe('2025-2026');
  });

  it('returns 2025-2026 for December 2025', () => {
    expect(getFY(new Date(2025, 11, 31))).toBe('2025-2026');
  });

  it('returns 2025-2026 for January 2026', () => {
    expect(getFY(new Date(2026, 0, 15))).toBe('2025-2026');
  });

  it('returns 2025-2026 for March 2026', () => {
    expect(getFY(new Date(2026, 2, 31))).toBe('2025-2026');
  });

  it('returns 2026-2027 for April 2026', () => {
    expect(getFY(new Date(2026, 3, 1))).toBe('2026-2027');
  });

  it('handles custom FY start month', () => {
    expect(getFY(new Date(2025, 0, 1), 1)).toBe('2025-2026');
  });
});

describe('parseFY', () => {
  it('parses FY 2025-2026 correctly', () => {
    const { start, end } = parseFY('2025-2026');
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(3); // April
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(2); // March
  });
});

import type { LightweightTransaction } from './financialYear';

describe('calculatePoolBalance', () => {
  it('returns correct balance for mixed transactions', () => {
    const txs: LightweightTransaction[] = [
      { type: 'deposit', amount: 1000, status: 'active' },
      { type: 'withdrawal', amount: 300, status: 'active' },
      { type: 'repayment', amount: 200, status: 'active' },
      { type: 'withdrawal', amount: 100, status: 'void' },
    ];
    expect(calculatePoolBalance(txs)).toBe(900);
  });

  it('returns 0 for empty transactions', () => {
    expect(calculatePoolBalance([])).toBe(0);
  });

  it('handles configured opening balances', () => {
    const txs: LightweightTransaction[] = [
      { type: 'deposit', amount: 1000, status: 'active' },
    ];
    expect(calculatePoolBalance(txs, 5000)).toBe(6000);
  });

  it('excludes void transactions', () => {
    const txs: LightweightTransaction[] = [
      { type: 'deposit', amount: 1000, status: 'void' },
      { type: 'withdrawal', amount: 500, status: 'void' },
    ];
    expect(calculatePoolBalance(txs)).toBe(0);
  });
});

describe('calculateMemberNet', () => {
  it('calculates net balance for specific member', () => {
    const txs: Array<LightweightTransaction & { memberId: string }> = [
      { type: 'deposit', amount: 1000, status: 'active', memberId: 'member1' },
      { type: 'withdrawal', amount: 300, status: 'active', memberId: 'member1' },
      { type: 'deposit', amount: 2000, status: 'active', memberId: 'member2' },
    ];
    expect(calculateMemberNet(txs, 'member1', 500)).toBe(1200);
    expect(calculateMemberNet(txs, 'member2')).toBe(2000);
  });

  it('returns 0 for member with no transactions', () => {
    const txs: Array<LightweightTransaction & { memberId: string }> = [
      { type: 'deposit', amount: 1000, status: 'active', memberId: 'member1' },
    ];
    expect(calculateMemberNet(txs, 'member2')).toBe(0);
  });
});

describe('normalizeTransactionType', () => {
  it('maps "return" to "repayment"', () => {
    expect(normalizeTransactionType('return')).toBe('repayment');
  });

  it('passes through valid types unchanged', () => {
    expect(normalizeTransactionType('deposit')).toBe('deposit');
    expect(normalizeTransactionType('withdrawal')).toBe('withdrawal');
    expect(normalizeTransactionType('repayment')).toBe('repayment');
    expect(normalizeTransactionType('borrow')).toBe('borrow');
    expect(normalizeTransactionType('payout')).toBe('payout');
    expect(normalizeTransactionType('interest')).toBe('interest');
    expect(normalizeTransactionType('opening_balance')).toBe('opening_balance');
  });
});

describe('calculatePoolBalance - new transaction types', () => {
  it('borrow transactions subtract from pool balance', () => {
    const txs: LightweightTransaction[] = [
      { type: 'deposit', amount: 1000, status: 'active' },
      { type: 'borrow', amount: 400, status: 'active' },
    ];
    expect(calculatePoolBalance(txs)).toBe(600);
  });

  it('payout transactions subtract from pool balance', () => {
    const txs: LightweightTransaction[] = [
      { type: 'deposit', amount: 1000, status: 'active' },
      { type: 'payout', amount: 250, status: 'active' },
    ];
    expect(calculatePoolBalance(txs)).toBe(750);
  });

  it('repayment transactions add to pool balance', () => {
    const txs: LightweightTransaction[] = [
      { type: 'repayment', amount: 500, status: 'active' },
    ];
    expect(calculatePoolBalance(txs)).toBe(500);
  });

  it('calculates pool balance with all transaction types', () => {
    const transactions = [
      { type: 'deposit', amount: 1000, status: 'active' },
      { type: 'withdrawal', amount: 200, status: 'active' },
      { type: 'repayment', amount: 300, status: 'active' },
      { type: 'borrow', amount: 150, status: 'active' },
      { type: 'payout', amount: 500, status: 'active' },
      { type: 'interest', amount: 50, status: 'active' },
      { type: 'return', amount: 100, status: 'active' },  // legacy data
      { type: 'deposit', amount: 200, status: 'void' },   // should be ignored
    ];
    // Expected: 0 + 1000 - 200 + 300 - 150 - 500 + 50 + 100 = 600
    expect(calculatePoolBalance(transactions as any)).toBe(600);
  });

  it('backward compat: transactions with type "return" still add to pool', () => {
    const txs = [
      { type: 'deposit', amount: 1000, status: 'active' },
      { type: 'return', amount: 300, status: 'active' },
    ];
    expect(calculatePoolBalance(txs as any)).toBe(1300);
  });
});

describe('calculateMemberNet - new transaction types', () => {
  it('borrow subtracts from member net', () => {
    const txs: Array<LightweightTransaction & { memberId: string }> = [
      { type: 'deposit', amount: 1000, status: 'active', memberId: 'm1' },
      { type: 'borrow', amount: 400, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberNet(txs, 'm1')).toBe(600);
  });

  it('payout subtracts from member net', () => {
    const txs: Array<LightweightTransaction & { memberId: string }> = [
      { type: 'deposit', amount: 1000, status: 'active', memberId: 'm1' },
      { type: 'payout', amount: 250, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberNet(txs, 'm1')).toBe(750);
  });

  it('repayment adds to member net', () => {
    const txs: Array<LightweightTransaction & { memberId: string }> = [
      { type: 'repayment', amount: 500, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberNet(txs, 'm1')).toBe(500);
  });

  it('backward compat: type "return" transactions still add to member net', () => {
    const txs = [
      { type: 'deposit', amount: 1000, status: 'active', memberId: 'm1' },
      { type: 'return', amount: 200, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberNet(txs as any, 'm1')).toBe(1200);
  });
});

describe('formatINR', () => {
  it('formats positive amounts', () => {
    const result = formatINR(1000);
    expect(result).toContain('1,000');
  });

  it('formats zero', () => {
    const result = formatINR(0);
    expect(result).toContain('0');
  });

  it('formats negative amounts', () => {
    const result = formatINR(-500);
    expect(result).toContain('-');
  });
});
