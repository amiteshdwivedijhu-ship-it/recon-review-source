import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../../src/domain/load';
import { FIXTURE_PATH, fixture, rawFixture } from './helpers';

describe('fixture file', () => {
  it('is byte for byte the original', () => {
    const hash = createHash('sha256').update(readFileSync(FIXTURE_PATH)).digest('hex');
    expect(hash).toBe('6dba24b2f9eb77c533021bd364f62b9acad098f21289dcfe773f29e7021f5f2b');
  });
});

describe('loadDataset', () => {
  it('loads the sample file with the documented record counts', () => {
    const ds = fixture();
    expect(ds.clearinghouse.remittance_records).toHaveLength(5);
    expect(ds.cash_tracker.deposits).toHaveLength(3);
    expect(ds.billing_ledger.payment_records).toHaveLength(4);
    expect(ds.billing_ledger.posting_transactions).toHaveLength(1);
    expect(ds.billing_ledger.credit_balances).toHaveLength(1);
    expect(ds.case_index).toHaveLength(4);
  });

  it('keeps null as null and zero as zero', () => {
    const ds = fixture();
    const rows = ds.billing_ledger.payment_records;
    const b = rows.find((r) => r.record_id === 'LED-001-B')!;
    expect(b.posted_amount_cents).toBeNull();
    expect(b.posting_transaction_ids).toBeNull();
    const two = rows.find((r) => r.record_id === 'LED-002')!;
    expect(two.posted_amount_cents).toBe(0);
    expect(two.posting_transaction_ids).toEqual([]);
    expect(two.claim_review_status).toBeNull();
    expect(ds.billing_ledger.credit_balances[0]!.refund_history).toBeNull();
  });

  it('rejects input that is not an object, without throwing', () => {
    for (const bad of [null, undefined, 42, 'text', []]) {
      const r = loadDataset(bad);
      expect(r.ok).toBe(false);
    }
  });

  it('reports a missing section by name', () => {
    const raw = rawFixture();
    delete raw.cash_tracker;
    const r = loadDataset(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('cash_tracker.deposits');
  });

  it('rejects an amount that is not integer cents', () => {
    const raw = rawFixture();
    raw.cash_tracker.deposits[0].amount_cents = 480.5;
    const r = loadDataset(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('DEP-001');
  });

  it('rejects an amount given as text', () => {
    const raw = rawFixture();
    raw.clearinghouse.remittance_records[0].amount_cents = '48000';
    expect(loadDataset(raw).ok).toBe(false);
  });

  it('rejects an undefined posted amount: missing must be an explicit null', () => {
    const raw = rawFixture();
    delete raw.billing_ledger.payment_records[1].posted_amount_cents;
    const r = loadDataset(raw);
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed date', () => {
    const raw = rawFixture();
    raw.cash_tracker.deposits[0].deposit_date = '04/03/2030';
    expect(loadDataset(raw).ok).toBe(false);
  });

  it('rejects an unknown remittance record type', () => {
    const raw = rawFixture();
    raw.clearinghouse.remittance_records[0].record_type = 'mystery';
    expect(loadDataset(raw).ok).toBe(false);
  });
});
