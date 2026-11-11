import { describe, expect, it } from 'vitest';
import { listPayments } from '../../src/domain/cash';
import { assessPosting } from '../../src/domain/posting';
import { brokenFixture, fixture } from './helpers';

function postingFor(ref: string, accountId: string, ds = fixture()) {
  const payment = listPayments(ds).find((p) => p.paymentReference === ref)!;
  return assessPosting(ds, payment, payment.allocations.find((a) => a.accountId === accountId)!);
}

describe('posting status comes from transaction evidence', () => {
  it('Case A, Account A: verified posted by saved transaction POST-001', () => {
    const p = postingFor('SYN-PAY-001', 'ACCT-A');
    expect(p.status).toBe('verified_posted');
    expect(p.provenCents).toBe(18000);
    expect(p.transactions).toHaveLength(1);
    expect(p.transactions[0]).toMatchObject({
      transaction_id: 'POST-001',
      amount_cents: 18000,
      posted_by: 'DEMO-OPERATOR-01',
      posted_at: '2030-04-04T09:00:00Z',
    });
    expect(p.ledgerRecordId).toBe('LED-001-A');
    expect(p.readiness).toBe('not_applicable');
  });
  it('Case A, Account A: the "unposted" summary label is a conflict, not the truth', () => {
    const p = postingFor('SYN-PAY-001', 'ACCT-A');
    expect(p.conflicts).toHaveLength(1);
    expect(p.conflicts[0]!.kind).toBe('summary_label');
    expect(p.conflicts[0]!.message).toBe('Summary label says "unposted" but saved transaction POST-001 shows $180.00 posted.');
  });
  it('Case A, Account B: unknown, with each missing piece named', () => {
    const p = postingFor('SYN-PAY-001', 'ACCT-B');
    expect(p.status).toBe('unknown');
    expect(p.provenCents).toBeNull();
    expect(p.postedAmountCents).toBeNull();
    expect(p.transactions).toEqual([]);
    expect(p.unknownReasons).toEqual(['Posted amount not supplied', 'Posting history is incomplete', 'Transaction list unavailable']);
    expect(p.conflicts).toEqual([]);
  });
  it('Case B: not posted (confirmed), readiness not established', () => {
    const p = postingFor('SYN-PAY-002', 'ACCT-A');
    expect(p.status).toBe('not_posted_confirmed');
    expect(p.provenCents).toBe(0);
    expect(p.postedAmountCents).toBe(0);
    expect(p.readiness).toBe('not_established');
    expect(p.claimReviewStatus).toBeNull();
    expect(p.conflicts).toEqual([]);
  });
  it('Case C: not posted (confirmed)', () => {
    const p = postingFor('SYN-PAY-003', 'ACCT-A');
    expect(p.status).toBe('not_posted_confirmed');
    expect(p.readiness).toBe('not_established');
  });
});

describe('posting rules on broken copies', () => {
  it('a "posted" label with no saved transaction does not prove posting', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records[2].summary_status = 'posted';
      raw.billing_ledger.payment_records[2].posting_status = 'posted';
    });
    const p = postingFor('SYN-PAY-002', 'ACCT-A', ds);
    expect(p.status).toBe('not_posted_confirmed');
    expect(p.conflicts.map((c) => c.kind)).toEqual(['summary_label', 'detail_status']);
  });
  it('an empty list with incomplete history is unknown, not "not posted"', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records[2].posting_history_complete = false;
    });
    const p = postingFor('SYN-PAY-002', 'ACCT-A', ds);
    expect(p.status).toBe('unknown');
    expect(p.unknownReasons).toEqual(['Posting history is incomplete']);
  });
  it('a transaction for a different account does not count as proof', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.posting_transactions[0].account_id = 'ACCT-B';
      raw.billing_ledger.posting_transactions[0].facility_id = 'FAC-B';
    });
    const p = postingFor('SYN-PAY-001', 'ACCT-A', ds);
    expect(p.status).toBe('unknown');
    expect(p.transactions).toEqual([]);
    expect(p.outOfScopeTransactionIds).toEqual(['POST-001']);
  });
  it('a transaction that is not saved does not count as proof', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.posting_transactions[0].transaction_status = 'draft';
    });
    expect(postingFor('SYN-PAY-001', 'ACCT-A', ds).status).toBe('unknown');
  });
  it('a saved transaction for the wrong amount is an amount mismatch', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.posting_transactions[0].amount_cents = 15000;
    });
    const p = postingFor('SYN-PAY-001', 'ACCT-A', ds);
    expect(p.status).toBe('amount_mismatch');
    expect(p.provenCents).toBe(15000);
  });
  it('no ledger row means unknown', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records = raw.billing_ledger.payment_records.filter((r: any) => r.record_id !== 'LED-003');
    });
    const p = postingFor('SYN-PAY-003', 'ACCT-A', ds);
    expect(p.status).toBe('unknown');
    expect(p.ledgerRecordId).toBeNull();
    expect(p.unknownReasons).toEqual(['No ledger row for this account and facility']);
  });
  it('a supplied claim review is reported, but readiness is still a human call', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records[2].claim_review_status = 'reviewed';
    });
    expect(postingFor('SYN-PAY-002', 'ACCT-A', ds).readiness).toBe('review_supplied');
  });
});
