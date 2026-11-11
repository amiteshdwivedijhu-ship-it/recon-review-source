import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/domain/findings';
import { formatCents, formatPercent } from '../../src/domain/money';
import { brokenFixture, fixture } from './helpers';

describe('north star: verified dollars in window', () => {
  it('counts 18000 of 107000 on the sample data', () => {
    const m = analyze(fixture()).metric;
    expect(m.verifiedCents).toBe(18000);
    expect(m.receivedCents).toBe(107000);
    expect(m.windowBusinessDays).toBe(3);
    expect(`${formatCents(m.verifiedCents)} of ${formatCents(m.receivedCents)} (${formatPercent(m.verifiedCents, m.receivedCents)})`).toBe(
      '$180.00 of $1,070.00 (16.8%)',
    );
  });
  it('explains each account line', () => {
    const lines = analyze(fixture()).metric.lines.map((l) => [l.caseId, l.accountId, l.amountCents, l.counted, l.reason]);
    expect(lines).toEqual([
      ['A', 'ACCT-A', 18000, true, 'Cash matched and posting proven 1 business day after deposit.'],
      ['A', 'ACCT-B', 30000, false, 'Posting unknown.'],
      ['B', 'ACCT-A', 24000, false, 'Not posted.'],
      ['C', 'ACCT-A', 35000, false, 'Cash not matched.'],
    ]);
  });
  it('does not count a posting saved after the 3 business day window', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.posting_transactions[0].posted_at = '2030-04-09T09:00:00Z'; // Tuesday, 4 business days
    });
    const m = analyze(ds).metric;
    expect(m.verifiedCents).toBe(0);
    expect(m.lines[0]!.reason).toBe('Posting proven 4 business days after deposit, outside the window.');
  });
  it('counts a posting saved exactly 3 business days after deposit', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.posting_transactions[0].posted_at = '2030-04-08T09:00:00Z'; // Monday
    });
    expect(analyze(ds).metric.verifiedCents).toBe(18000);
  });
});
