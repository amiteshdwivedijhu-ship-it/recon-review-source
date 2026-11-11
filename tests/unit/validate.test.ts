import { describe, expect, it } from 'vitest';
import { runDataChecks } from '../../src/domain/validate';
import { brokenFixture, fixture } from './helpers';

const failed = (checks: ReturnType<typeof runDataChecks>) => checks.filter((c) => !c.passed).map((c) => c.id);

describe('data checks on the real file', () => {
  it('runs six checks and all pass', () => {
    const checks = runDataChecks(fixture());
    expect(checks.map((c) => c.id)).toEqual([
      'split_sum',
      'deposit_allocation_sum',
      'account_facility_pair',
      'payer_exists',
      'posting_transaction_match',
      'links_resolve',
    ]);
    expect(failed(checks)).toEqual([]);
  });
});

describe('data checks on broken copies', () => {
  it('flags allocations that do not sum to their parent', () => {
    const ds = brokenFixture((raw) => {
      raw.clearinghouse.remittance_records[1].amount_cents = 17000;
    });
    const checks = runDataChecks(ds);
    expect(failed(checks)).toContain('split_sum');
    const issue = checks.find((c) => c.id === 'split_sum')!.issues[0]!;
    expect(issue.paymentReference).toBe('SYN-PAY-001');
    expect(issue.message).toContain('$470.00');
    expect(issue.message).toContain('$480.00');
    expect(issue.recordIds).toEqual(['REM-001', 'REM-001-A', 'REM-001-B']);
  });

  it('flags a parent payment with no allocations', () => {
    const ds = brokenFixture((raw) => {
      raw.clearinghouse.remittance_records = raw.clearinghouse.remittance_records.filter(
        (r: any) => r.record_type !== 'account_allocation',
      );
    });
    expect(failed(runDataChecks(ds))).toContain('split_sum');
  });

  it('flags deposit allocations that do not sum to the deposit', () => {
    const ds = brokenFixture((raw) => {
      raw.cash_tracker.deposits[0].allocations[0].amount_cents = 10000;
    });
    const checks = runDataChecks(ds);
    expect(failed(checks)).toEqual(['deposit_allocation_sum']);
    expect(checks.find((c) => c.id === 'deposit_allocation_sum')!.issues[0]!.recordIds).toEqual(['DEP-001']);
  });

  it('flags an account and facility pair that is not in the accounts table', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records[2].facility_id = 'FAC-B';
    });
    const checks = runDataChecks(ds);
    expect(failed(checks)).toContain('account_facility_pair');
    expect(checks.find((c) => c.id === 'account_facility_pair')!.issues[0]!.recordIds).toEqual(['LED-002']);
  });

  it('flags a payer id that does not exist', () => {
    const ds = brokenFixture((raw) => {
      raw.clearinghouse.remittance_records[4].payer_id = 'PAYER-99';
    });
    const checks = runDataChecks(ds);
    expect(failed(checks)).toEqual(['payer_exists']);
  });

  it('flags a posting transaction whose amount differs from the posted amount', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.posting_transactions[0].amount_cents = 17500;
    });
    expect(failed(runDataChecks(ds))).toEqual(['posting_transaction_match']);
  });

  it('flags a posting transaction that points at a different account', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.posting_transactions[0].account_id = 'ACCT-B';
      raw.billing_ledger.posting_transactions[0].facility_id = 'FAC-B';
    });
    expect(failed(runDataChecks(ds))).toEqual(['posting_transaction_match']);
  });

  it('flags a transaction id that does not resolve', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records[0].posting_transaction_ids = ['POST-404'];
    });
    expect(failed(runDataChecks(ds))).toContain('links_resolve');
  });

  it('flags a parent record id that does not resolve', () => {
    const ds = brokenFixture((raw) => {
      raw.clearinghouse.remittance_records[1].parent_record_id = 'REM-404';
    });
    expect(failed(runDataChecks(ds))).toContain('links_resolve');
  });

  it('flags a deposit whose payment reference has no remittance', () => {
    const ds = brokenFixture((raw) => {
      raw.cash_tracker.deposits[2].payment_reference = 'SYN-PAY-404';
    });
    expect(failed(runDataChecks(ds))).toContain('links_resolve');
  });

  it('flags a case index entry that points at nothing', () => {
    const ds = brokenFixture((raw) => {
      raw.case_index[3].credit_id = 'SYN-CREDIT-404';
    });
    expect(failed(runDataChecks(ds))).toContain('links_resolve');
  });
});
