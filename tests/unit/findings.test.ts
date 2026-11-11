import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/domain/findings';
import { brokenFixture, fixture } from './helpers';

const analysis = () => analyze(fixture());
const caseOf = (id: string, a = analysis()) => a.cases.find((c) => c.caseId === id)!;

describe('case analysis', () => {
  it('builds three live cases and one spec-only credit', () => {
    const a = analysis();
    expect(a.cases.map((c) => [c.caseId, c.paymentReference])).toEqual([
      ['A', 'SYN-PAY-001'],
      ['B', 'SYN-PAY-002'],
      ['C', 'SYN-PAY-003'],
    ]);
    expect(a.credits).toHaveLength(1);
    expect(a.generalDataIssues).toEqual([]);
  });

  it('writes the roll-up sentence for each case', () => {
    expect(caseOf('A').summary).toBe('Cash matched. Posting proven for Account A only.');
    expect(caseOf('B').summary).toBe('Cash matched. Not posted (confirmed). Ready to post is not established.');
    expect(caseOf('C').summary).toBe('Deposit short by $25.00, reason unknown. Not posted (confirmed). The posting call needs a person.');
  });

  it('shows the one day deposit gap as information, not a finding', () => {
    const a = caseOf('A');
    expect(a.info).toContain('Deposit arrived 1 day after the remittance date. Up to 3 business days is normal.');
    expect(a.info).toContain('Split check passed: $180.00 + $300.00 = $480.00, the parent payment.');
    expect(a.findings.every((f) => f.track !== 'cash')).toBe(true);
  });

  it('only Case C needs a human posting decision, and the tool suggests nothing', () => {
    expect(caseOf('A').postingDecision).toBeNull();
    expect(caseOf('B').postingDecision).toBeNull();
    expect(caseOf('C').postingDecision).toEqual({
      prompt: 'Remit supports $350.00. Deposit shows $325.00. This posting call needs a person.',
      remitCents: 35000,
      depositCents: 32500,
    });
  });
});

describe('golden findings', () => {
  it('matches the expected findings for cases A to C', () => {
    const rows = analysis().cases.flatMap((c) =>
      c.findings.map((f) => ({
        id: f.id,
        track: f.track,
        title: f.title,
        why: f.why,
        amountCents: f.amountCents,
        evidenceIds: f.evidenceIds,
        nextStep: f.nextStep,
        owner: f.suggestedOwner,
        category: f.suggestedCategory,
        requiresEvidence: f.requiresEvidence,
        waitingOn: f.waitingOn,
      })),
    );
    expect(rows).toEqual([
      {
        id: 'A:conflicting_status:ACCT-A',
        track: 'posting',
        title: 'Summary label conflicts with posting evidence',
        why: 'Summary label says "unposted" but saved transaction POST-001 shows $180.00 posted.',
        amountCents: 18000,
        evidenceIds: ['LED-001-A', 'POST-001'],
        nextStep: 'Confirm, then send a label fix to the billing system owner.',
        owner: 'Billing system admin',
        category: 'Conflicting status',
        requiresEvidence: false,
        waitingOn: null,
      },
      {
        id: 'A:missing_posting_evidence:ACCT-B',
        track: 'posting',
        title: 'Posting evidence missing for Account B',
        why: 'Posted amount not supplied. Posting history is incomplete. Transaction list unavailable.',
        amountCents: 30000,
        evidenceIds: ['LED-001-B'],
        nextStep: 'Request posting history for ACCT-B / FAC-B.',
        owner: 'Posting team (Facility B)',
        category: 'Missing posting evidence',
        requiresEvidence: true,
        waitingOn: 'Posting history for Account B is still missing.',
      },
      {
        id: 'B:claim_review_needed:ACCT-A',
        track: 'posting',
        title: 'Not posted. Ready to post is not established',
        why: 'Cash matches at $240.00 and the complete history has no saved transaction. Claim-level review was not supplied.',
        amountCents: 24000,
        evidenceIds: ['REM-002', 'DEP-002', 'LED-002'],
        nextStep: 'Request claim-level review.',
        owner: 'Posting team (Facility A)',
        category: 'Claim review needed',
        requiresEvidence: true,
        waitingOn: 'Claim-level review is still missing.',
      },
      {
        id: 'C:deposit_mismatch',
        track: 'cash',
        title: 'Deposit short by $25.00, reason unknown',
        why: 'Remittance REM-003 is $350.00. Deposit DEP-003 is $325.00.',
        amountCents: 2500,
        evidenceIds: ['REM-003', 'DEP-003', 'LED-003'],
        nextStep: 'Assign to Cash reconciliation to find the reason. Do not adjust the amount to make it balance.',
        owner: 'Cash reconciliation',
        category: 'Deposit mismatch',
        requiresEvidence: true,
        waitingOn: 'The reason for the $25.00 difference is still unknown.',
      },
    ]);
  });

  it('every finding names the rule it came from', () => {
    for (const c of analysis().cases) for (const f of c.findings) expect(f.rule.length).toBeGreaterThan(10);
  });

  it('never proposes an adjustment or a posting action for Case C', () => {
    const text = JSON.stringify(caseOf('C').findings).toLowerCase();
    expect(text).not.toContain('write off');
    expect(text).not.toContain('post the');
    expect(caseOf('C').findings.map((f) => f.kind)).toEqual(['deposit_mismatch']);
  });
});

describe('Case D is described, not worked', () => {
  it('lists the credit with what is unknown and what evidence is needed', () => {
    const d = analysis().credits[0]!;
    expect(d).toMatchObject({
      caseId: 'D',
      creditId: 'SYN-CREDIT-004',
      claimId: 'SYN-CLAIM-004',
      balanceCents: -9000,
      status: 'Investigation needed. Refund not established.',
      owner: 'Credit investigation',
    });
    expect(d.unknown).toEqual(['Transaction history', 'Remittance details', 'Refund history', 'Payer recovery history']);
  });
});

describe('findings on broken copies', () => {
  it('a failed data check becomes a data quality finding on its case', () => {
    const ds = brokenFixture((raw) => {
      raw.clearinghouse.remittance_records[1].amount_cents = 17000;
    });
    const a = caseOf('A', analyze(ds));
    const data = a.findings.filter((f) => f.track === 'data');
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ kind: 'data_quality', suggestedOwner: 'Billing system admin' });
    expect(data[0]!.title).toBe('Data check failed: Split allocations add up to the parent payment');
    expect(a.summary.startsWith('Data check failed.')).toBe(true);
  });
  it('a data issue with no case is kept as a general issue', () => {
    const ds = brokenFixture((raw) => {
      raw.case_index[3].credit_id = 'SYN-CREDIT-404';
    });
    expect(analyze(ds).generalDataIssues).toHaveLength(1);
  });
  it('a missing deposit raises a cash finding and no claim review finding', () => {
    const ds = brokenFixture((raw) => {
      raw.cash_tracker.deposits = raw.cash_tracker.deposits.filter((d: any) => d.deposit_id !== 'DEP-002');
    });
    const b = caseOf('B', analyze(ds));
    expect(b.findings.map((f) => f.kind)).toEqual(['deposit_missing']);
    expect(b.summary).toBe('No deposit found. Not posted (confirmed).');
  });
  it('a deposit over the remittance says "over", not "short"', () => {
    const ds = brokenFixture((raw) => {
      raw.cash_tracker.deposits[2].amount_cents = 36000;
      raw.cash_tracker.deposits[2].allocations[0].amount_cents = 36000;
    });
    expect(caseOf('C', analyze(ds)).findings[0]!.title).toBe('Deposit over by $10.00, reason unknown');
  });
  it('a ledger expected amount that differs from the remittance is flagged', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records[2].expected_amount_cents = 20000;
    });
    expect(caseOf('B', analyze(ds)).findings.map((f) => f.kind)).toContain('expected_amount_mismatch');
  });
});
