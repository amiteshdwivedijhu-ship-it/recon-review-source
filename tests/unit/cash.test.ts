import { describe, expect, it } from 'vitest';
import { listPayments, receiptTotals, reconcileCash } from '../../src/domain/cash';
import { brokenFixture, fixture } from './helpers';

const cashFor = (ref: string, ds = fixture()) => reconcileCash(ds, listPayments(ds).find((p) => p.paymentReference === ref)!);

describe('receipt totals: do not double count', () => {
  it('counts 3 payments from 5 remittance rows', () => {
    const t = receiptTotals(fixture());
    expect(t.remittanceRowCount).toBe(5);
    expect(t.paymentCount).toBe(3);
  });
  it('received total is $1,070.00, not the naive $1,550.00 row sum', () => {
    const t = receiptTotals(fixture());
    expect(t.receivedCents).toBe(107000);
    expect(t.naiveRowSumCents).toBe(155000);
    expect(t.receivedCents).not.toBe(t.naiveRowSumCents);
  });
  it('deposits total $1,045.00, $25.00 less than received', () => {
    const t = receiptTotals(fixture());
    expect(t.depositedCents).toBe(104500);
    expect(t.differenceCents).toBe(-2500);
  });
});

describe('listPayments', () => {
  it('lists a split payment once with its two allocations', () => {
    const a = listPayments(fixture()).find((p) => p.paymentReference === 'SYN-PAY-001')!;
    expect(a.totalCents).toBe(48000);
    expect(a.isSplit).toBe(true);
    expect(a.remitRecordId).toBe('REM-001');
    expect(a.allocations.map((x) => [x.recordId, x.accountId, x.facilityId, x.amountCents])).toEqual([
      ['REM-001-A', 'ACCT-A', 'FAC-A', 18000],
      ['REM-001-B', 'ACCT-B', 'FAC-B', 30000],
    ]);
    expect(a.allocationSumCents).toBe(48000);
    expect(a.splitSumsToParent).toBe(true);
  });
  it('treats a single payment as one allocation of itself', () => {
    const b = listPayments(fixture()).find((p) => p.paymentReference === 'SYN-PAY-002')!;
    expect(b.isSplit).toBe(false);
    expect(b.allocations).toHaveLength(1);
    expect(b.allocations[0]!.amountCents).toBe(24000);
  });
});

describe('cash reconciliation', () => {
  it('Case A: deposit matches, per account, 1 day after the remittance', () => {
    const cash = cashFor('SYN-PAY-001');
    expect(cash.status).toBe('matched');
    expect(cash.remitCents).toBe(48000);
    expect(cash.depositCents).toBe(48000);
    expect(cash.differenceCents).toBe(0);
    expect(cash.depositIds).toEqual(['DEP-001']);
    expect(cash.gapCalendarDays).toBe(1);
    expect(cash.gapBusinessDays).toBe(1);
    expect(cash.gapWithinWindow).toBe(true);
    expect(cash.accounts.map((a) => [a.accountId, a.remitCents, a.depositCents, a.expectedCents, a.differenceCents, a.status])).toEqual([
      ['ACCT-A', 18000, 18000, 18000, 0, 'matched'],
      ['ACCT-B', 30000, 30000, 30000, 0, 'matched'],
    ]);
  });
  it('Case B: $240.00 matched across remittance, deposit, and ledger', () => {
    const cash = cashFor('SYN-PAY-002');
    expect(cash.status).toBe('matched');
    expect(cash.accounts[0]).toMatchObject({ remitCents: 24000, depositCents: 24000, expectedCents: 24000, status: 'matched' });
    expect(cash.gapCalendarDays).toBe(1);
  });
  it('Case C: variance, deposit short by $25.00', () => {
    const cash = cashFor('SYN-PAY-003');
    expect(cash.status).toBe('variance');
    expect(cash.remitCents).toBe(35000);
    expect(cash.depositCents).toBe(32500);
    expect(cash.differenceCents).toBe(-2500);
    expect(cash.accounts[0]).toMatchObject({ differenceCents: -2500, status: 'variance', expectedCents: 35000 });
  });
  it('a missing deposit is Unknown, never a $0.00 deposit', () => {
    const ds = brokenFixture((raw) => {
      raw.cash_tracker.deposits = raw.cash_tracker.deposits.filter((d: any) => d.deposit_id !== 'DEP-002');
    });
    const cash = cashFor('SYN-PAY-002', ds);
    expect(cash.status).toBe('unknown');
    expect(cash.depositCents).toBeNull();
    expect(cash.differenceCents).toBeNull();
    expect(cash.gapCalendarDays).toBeNull();
    expect(cash.accounts[0]).toMatchObject({ depositCents: null, differenceCents: null, status: 'unknown' });
  });
  it('a deposit with the right total but wrong account split is a variance per account', () => {
    const ds = brokenFixture((raw) => {
      raw.cash_tracker.deposits[0].allocations[0].amount_cents = 20000;
      raw.cash_tracker.deposits[0].allocations[1].amount_cents = 28000;
    });
    const cash = cashFor('SYN-PAY-001', ds);
    expect(cash.differenceCents).toBe(0);
    expect(cash.accounts.map((a) => a.status)).toEqual(['variance', 'variance']);
    expect(cash.status).toBe('variance');
  });
  it('a deposit over the remittance is a variance with a positive difference', () => {
    const ds = brokenFixture((raw) => {
      raw.cash_tracker.deposits[2].amount_cents = 36000;
      raw.cash_tracker.deposits[2].allocations[0].amount_cents = 36000;
    });
    expect(cashFor('SYN-PAY-003', ds)).toMatchObject({ status: 'variance', differenceCents: 1000 });
  });
  it('a missing ledger row leaves the expected amount Unknown', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records = raw.billing_ledger.payment_records.filter((r: any) => r.record_id !== 'LED-002');
    });
    expect(cashFor('SYN-PAY-002', ds).accounts[0]!.expectedCents).toBeNull();
  });
});
