import { describe, it, expect } from 'vitest';
import { getFY, parseFY, calculatePoolBalance, calculateMemberNet, formatINR } from './financialYear';

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
      { type: 'return', amount: 200, status: 'active' },
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
