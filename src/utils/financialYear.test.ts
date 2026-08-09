import { describe, it, expect } from 'vitest';
import { getFY, parseFY, calculatePoolBalance, calculateMemberNet, calculateMemberOutstanding, buildMemberTotalsMap, computeMemberTotals, computePoolFYStats, computePoolTotals, formatINR, normalizeTransactionType } from './financialYear';

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

describe('computePoolTotals', () => {
  const ledger = [
    { type: 'deposit', amount: 38600, status: 'active' },
    { type: 'repayment', amount: 35364.01, status: 'active' },
    { type: 'borrow', amount: 11700, status: 'active' },
  ] as any;

  it('adds the config opening balance and interest to the derived cash position', () => {
    const totals = computePoolTotals(ledger, 9339, 1979.2);
    expect(totals.deposited).toBeCloseTo(47939, 2);
    expect(totals.interest).toBeCloseTo(1979.2, 2);
    expect(totals.balance).toBeCloseTo(73582.21, 2);
  });

  it('separates the lifetime flow buckets', () => {
    const totals = computePoolTotals(
      [
        { type: 'deposit', amount: 1000, status: 'active' },
        { type: 'withdrawal', amount: 200, status: 'active' },
        { type: 'return', amount: 300, status: 'active' }, // legacy
        { type: 'borrow', amount: 150, status: 'active' },
        { type: 'payout', amount: 500, status: 'active' },
        { type: 'interest', amount: 50, status: 'active' },
        { type: 'deposit', amount: 999, status: 'void' }, // ignored
      ] as any,
    );
    expect(totals).toEqual({
      balance: 500,
      deposited: 1000,
      interest: 50,
      repaid: 300,
      withdrawn: 200,
      borrowed: 150,
      paidOut: 500,
    });
  });

  it('ignores opening_balance transactions (config is the source of truth)', () => {
    const totals = computePoolTotals(
      [
        { type: 'opening_balance', amount: 5000, status: 'active' },
        { type: 'deposit', amount: 1000, status: 'active' },
      ] as any,
      5000,
    );
    expect(totals.balance).toBe(6000);
    expect(totals.deposited).toBe(6000);
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

describe('calculateMemberOutstanding', () => {
  it('borrow creates debt, repayment reduces it', () => {
    const txs = [
      { type: 'borrow', amount: 5000, status: 'active', memberId: 'm1' },
      { type: 'repayment', amount: 2000, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberOutstanding(txs as any, 'm1')).toBe(3000);
  });

  it('withdrawal never creates debt', () => {
    const txs = [
      { type: 'deposit', amount: 10000, status: 'active', memberId: 'm1' },
      { type: 'withdrawal', amount: 10000, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberOutstanding(txs as any, 'm1')).toBe(0);
  });

  it('negative opening balance counts as carried-forward debt', () => {
    const txs = [
      { type: 'borrow', amount: 1000, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberOutstanding(txs as any, 'm1', -19164)).toBe(20164);
  });

  it('deposits do not offset outstanding debt', () => {
    const txs = [
      { type: 'borrow', amount: 4000, status: 'active', memberId: 'm1' },
      { type: 'deposit', amount: 9000, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberOutstanding(txs as any, 'm1')).toBe(4000);
  });

  it('clamps at zero when repaid exceeds debt', () => {
    const txs = [
      { type: 'borrow', amount: 1000, status: 'active', memberId: 'm1' },
      { type: 'repayment', amount: 5000, status: 'active', memberId: 'm1' },
    ];
    expect(calculateMemberOutstanding(txs as any, 'm1')).toBe(0);
  });

  it('ignores void transactions and other members', () => {
    const txs = [
      { type: 'borrow', amount: 9000, status: 'void', memberId: 'm1' },
      { type: 'borrow', amount: 7000, status: 'active', memberId: 'm2' },
    ];
    expect(calculateMemberOutstanding(txs as any, 'm1')).toBe(0);
  });
});

describe('buildMemberTotalsMap', () => {
  const txs = [
    { type: 'deposit', amount: 10000, status: 'active', memberId: 'm1', fy: '2026-2027' },
    { type: 'withdrawal', amount: 2000, status: 'active', memberId: 'm1', fy: '2026-2027' },
    { type: 'borrow', amount: 5000, status: 'active', memberId: 'm1', fy: '2025-2026' },
    { type: 'return', amount: 1000, status: 'active', memberId: 'm1', fy: '2025-2026' },
    { type: 'deposit', amount: 3000, status: 'void', memberId: 'm1', fy: '2026-2027' },
    { type: 'deposit', amount: 7000, status: 'active', memberId: 'm2', fy: '2026-2027' },
    { type: 'interest', amount: 500, status: 'active', fy: '2026-2027' },
  ];

  it('aggregates lifetime figures per member in one pass', () => {
    const map = buildMemberTotalsMap(txs as any, ['m1', 'm2']);
    const m1 = map.get('m1')!;
    // 10000 - 2000 - 5000 + 1000 (legacy 'return' counts as repayment)
    expect(m1.net).toBe(4000);
    expect(m1.deposited).toBe(10000);
    expect(m1.withdrawn).toBe(2000);
    expect(m1.paidOut).toBe(0);
    expect(m1.borrowed).toBe(5000);
    expect(m1.repaid).toBe(1000);
    expect(m1.outstanding).toBe(4000);
    expect(map.get('m2')!.net).toBe(7000);
  });

  it('keeps payouts out of `withdrawn`, mirroring PoolTotals', () => {
    const withPayout = [
      { type: 'deposit', amount: 8000, status: 'active', memberId: 'm1', fy: '2026-2027' },
      { type: 'withdrawal', amount: 1000, status: 'active', memberId: 'm1', fy: '2026-2027' },
      { type: 'payout', amount: 7000, status: 'active', memberId: 'm1', fy: '2026-2027' },
    ];
    const m1 = buildMemberTotalsMap(withPayout as any, ['m1'], undefined, '2026-2027').get('m1')!;
    expect(m1.withdrawn).toBe(1000);
    expect(m1.paidOut).toBe(7000);
    // Both still drain the balance.
    expect(m1.net).toBe(0);
  });

  it('a full payout pulls FY savings progress back down with the balance', () => {
    const paidOutInFull = [
      { type: 'deposit', amount: 6000, status: 'active', memberId: 'm1', fy: '2026-2027' },
      { type: 'payout', amount: 6000, status: 'active', memberId: 'm1', fy: '2026-2027' },
    ];
    const m1 = buildMemberTotalsMap(paidOutInFull as any, ['m1'], undefined, '2026-2027').get('m1')!;
    expect(m1.fyDeposited).toBe(6000);
    // The payout is not a withdrawal, but it does reduce savings held.
    expect(m1.fyWithdrawn).toBe(0);
    expect(m1.fyPaidOut).toBe(6000);
    expect(m1.fyNetBalance).toBe(0);
    expect(m1.net).toBe(0);
  });

  it('seeds an entry for every requested member, even with no transactions', () => {
    const map = buildMemberTotalsMap(txs as any, ['m1', 'm2', 'm3']);
    expect(map.get('m3')).toEqual(
      expect.objectContaining({ net: 0, borrowed: 0, repaid: 0, outstanding: 0 }),
    );
  });

  it('folds opening balances into net and carries negative ones as debt', () => {
    const map = buildMemberTotalsMap(txs as any, ['m1'], { m1: -19164 });
    expect(map.get('m1')!.net).toBe(4000 - 19164);
    // borrowed 5000 + carried debt 19164 - repaid 1000
    expect(map.get('m1')!.outstanding).toBe(23164);
  });

  it('scopes FY figures to the requested FY', () => {
    const map = buildMemberTotalsMap(txs as any, ['m1'], undefined, '2026-2027');
    const m1 = map.get('m1')!;
    expect(m1.fyDeposited).toBe(10000);
    expect(m1.fyWithdrawn).toBe(2000);
    expect(m1.fyPaidOut).toBe(0);
    expect(m1.fyNetBalance).toBe(8000);
  });

  it('matches computeMemberTotals for the same member', () => {
    const batch = buildMemberTotalsMap(txs as any, ['m1'], { m1: 500 }, '2026-2027').get('m1');
    const single = computeMemberTotals(
      txs.filter((t) => t.memberId === 'm1') as any,
      500,
      '2026-2027',
    );
    expect(batch).toEqual(single);
  });
});

describe('computePoolFYStats', () => {
  it('totals the pool by type for one FY only', () => {
    const txs = [
      { type: 'deposit', amount: 1000, status: 'active', fy: '2026-2027' },
      { type: 'withdrawal', amount: 200, status: 'active', fy: '2026-2027' },
      { type: 'return', amount: 300, status: 'active', fy: '2026-2027' },
      { type: 'borrow', amount: 150, status: 'active', fy: '2026-2027' },
      { type: 'payout', amount: 50, status: 'active', fy: '2026-2027' },
      { type: 'interest', amount: 75, status: 'active', fy: '2026-2027' },
      { type: 'deposit', amount: 9999, status: 'active', fy: '2025-2026' },
      { type: 'deposit', amount: 8888, status: 'void', fy: '2026-2027' },
    ];
    expect(computePoolFYStats(txs as any, '2026-2027')).toEqual({
      deposited: 1000,
      withdrawn: 200,
      repaid: 300,
      borrowed: 150,
      payout: 50,
      interest: 75,
    });
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
