import { describe, it, expect } from 'vitest';
import { createTransactionSchema } from './index';

const base = {
  amount: 500,
  date: '2026-08-09',
  savingsMonth: '',
  notes: '',
};

describe('createTransactionSchema - member requirement', () => {
  it('accepts an interest transaction with the form\'s empty memberId default', () => {
    const result = createTransactionSchema().safeParse({
      ...base,
      type: 'interest',
      memberId: '',
    });
    expect(result.success).toBe(true);
  });

  it('still rejects an empty memberId for member-scoped types', () => {
    const result = createTransactionSchema().safeParse({
      ...base,
      type: 'deposit',
      memberId: '',
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]).toMatchObject({
      path: ['memberId'],
      message: 'Member is required',
    });
  });
});

describe('createTransactionSchema - amount caps', () => {
  it('caps payout at the member\'s savings', () => {
    const schema = createTransactionSchema({ payoutMax: 1000 });
    expect(
      schema.safeParse({ ...base, type: 'payout', memberId: 'm1', amount: 1001 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...base, type: 'payout', memberId: 'm1', amount: 1000 }).success,
    ).toBe(true);
  });

  it('skips the payout cap while the limit is unknown', () => {
    const schema = createTransactionSchema({});
    expect(
      schema.safeParse({ ...base, type: 'payout', memberId: 'm1', amount: 99999 }).success,
    ).toBe(true);
  });

  it('caps withdrawal and borrow independently of payout', () => {
    const schema = createTransactionSchema({ withdrawalMax: 100, borrowMax: 200 });
    expect(
      schema.safeParse({ ...base, type: 'withdrawal', memberId: 'm1', amount: 101 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...base, type: 'borrow', memberId: 'm1', amount: 201 }).success,
    ).toBe(false);
  });
});

describe('createTransactionSchema - date parsing', () => {
  it('reads a YYYY-MM-DD input as a local date, not UTC midnight', () => {
    const result = createTransactionSchema().safeParse({
      ...base,
      type: 'deposit',
      memberId: 'm1',
      date: '2026-04-01',
    });
    expect(result.success).toBe(true);
    const date = result.data!.date;
    // Local parts must round-trip regardless of the runner's timezone —
    // a UTC parse drifts to Mar 31 in UTC-negative zones and flips the FY.
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3);
    expect(date.getDate()).toBe(1);
  });
});
