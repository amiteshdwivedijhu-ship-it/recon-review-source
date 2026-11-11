import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/domain/findings';
import { historyForCase, lastAction } from '../../src/domain/history';
import {
  type Action,
  type ReviewState,
  actionAvailability,
  applyAction,
  applyActionSequence,
  caseReview,
  initialReviewState,
  nextSteps,
  openFindingCount,
} from '../../src/domain/workflow';
import { brokenFixture, fixture } from './helpers';

const analysis = analyze(fixture());
const clock = { now: '2026-11-10T14:00:00Z', today: '2026-11-10' };
const LABEL = 'A:conflicting_status:ACCT-A';
const MISSING = 'A:missing_posting_evidence:ACCT-B';
const CLAIM = 'B:claim_review_needed:ACCT-A';
const SHORT = 'C:deposit_mismatch';

const start = () => initialReviewState(analysis);
function run(state: ReviewState, ...actions: Action[]): ReviewState {
  for (const action of actions) {
    const result = applyAction(state, analysis, action, clock);
    if (!result.ok) throw new Error(`expected ${action.type} to work: ${result.message}`);
    state = result.state;
  }
  return state;
}
function blocked(state: ReviewState, action: Action) {
  const result = applyAction(state, analysis, action, clock);
  expect(result.ok).toBe(false);
  // A blocked action must leave state and history untouched.
  expect(result.state).toBe(state);
  if (result.ok) throw new Error('unreachable');
  return result;
}
const assign = (findingId: string, over: Partial<Extract<Action, { type: 'assign' }>> = {}): Action => ({
  type: 'assign',
  findingId,
  owner: 'Cash reconciliation',
  category: 'Deposit mismatch',
  dueDate: '2026-11-12',
  note: 'Please find the reason for the gap.',
  ...over,
});
const request = (findingId: string, over: Partial<Extract<Action, { type: 'request_evidence' }>> = {}): Action => ({
  type: 'request_evidence',
  findingId,
  whatMissing: 'Posting history for ACCT-B / FAC-B',
  fromOwner: 'Posting team (Facility B)',
  dueDate: '2026-11-12',
  ...over,
});
const caseOf = (id: string) => analysis.cases.find((c) => c.caseId === id)!;

describe('starting state', () => {
  it('opens every finding with no history', () => {
    const s = start();
    expect(Object.values(s.findings).map((f) => f.status)).toEqual(['open', 'open', 'open', 'open']);
    expect(s.history).toEqual([]);
    expect(openFindingCount(s)).toBe(4);
    expect(lastAction(s.history, 'A')).toBeNull();
  });
});

describe('allowed moves', () => {
  it('Open to Confirmed', () => {
    const s = run(start(), { type: 'confirm', findingId: LABEL });
    expect(s.findings[LABEL]!.status).toBe('confirmed');
  });
  it('Open to Challenged with a reason, then Dismissed by reviewer', () => {
    let s = run(start(), { type: 'challenge', findingId: LABEL, reason: 'Label was fixed this morning.' });
    expect(s.findings[LABEL]).toMatchObject({ status: 'challenged', challengeReason: 'Label was fixed this morning.' });
    s = run(s, { type: 'dismiss', findingId: LABEL });
    expect(s.findings[LABEL]!.status).toBe('dismissed');
    expect(openFindingCount(s)).toBe(3);
  });
  it('Challenged back to Open', () => {
    const s = run(start(), { type: 'challenge', findingId: LABEL, reason: 'Not sure.' }, { type: 'reopen', findingId: LABEL });
    expect(s.findings[LABEL]).toMatchObject({ status: 'open', challengeReason: null });
  });
  it('Confirmed to Evidence requested', () => {
    const s = run(start(), { type: 'confirm', findingId: MISSING }, request(MISSING));
    expect(s.findings[MISSING]).toMatchObject({
      status: 'evidence_requested',
      evidenceRequest: { whatMissing: 'Posting history for ACCT-B / FAC-B', from: 'Posting team (Facility B)', dueDate: '2026-11-12' },
    });
  });
  it('Confirmed to Assigned', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT }, assign(SHORT));
    expect(s.findings[SHORT]).toMatchObject({
      status: 'assigned',
      assignment: { owner: 'Cash reconciliation', category: 'Deposit mismatch', dueDate: '2026-11-12', note: 'Please find the reason for the gap.' },
    });
  });
  it('Assigned to Resolved with a note, when no outside evidence is needed', () => {
    const s = run(
      start(),
      { type: 'confirm', findingId: LABEL },
      assign(LABEL, { owner: 'Billing system admin', category: 'Conflicting status' }),
      { type: 'resolve', findingId: LABEL, note: 'Label fix request sent.' },
    );
    expect(s.findings[LABEL]).toMatchObject({ status: 'resolved', resolutionNote: 'Label fix request sent.' });
  });
  it('Evidence requested to Resolved only after evidence is marked received', () => {
    let s = run(start(), { type: 'confirm', findingId: MISSING }, request(MISSING));
    const early = blocked(s, { type: 'resolve', findingId: MISSING, note: 'Done.' });
    expect(early.message).toBe("Can't resolve yet. Posting history for Account B is still missing.");
    s = run(s, { type: 'mark_evidence_received', findingId: MISSING }, { type: 'resolve', findingId: MISSING, note: 'History received and checked.' });
    expect(s.findings[MISSING]).toMatchObject({ status: 'resolved', evidenceReceived: true });
  });
  it('accepts a due date of today', () => {
    run(start(), { type: 'confirm', findingId: SHORT }, assign(SHORT, { dueDate: '2026-11-10' }));
  });
  it('trims text before saving', () => {
    const s = run(start(), { type: 'challenge', findingId: LABEL, reason: '  Stale.  ' });
    expect(s.findings[LABEL]!.challengeReason).toBe('Stale.');
  });
});

describe('blocked moves keep state unchanged and say why', () => {
  it('Resolve on Case A Account B while posting is unknown', () => {
    expect(blocked(start(), { type: 'resolve', findingId: MISSING, note: 'x' }).message).toBe(
      "Can't resolve yet. Posting history for Account B is still missing.",
    );
  });
  it('Resolve before any handoff', () => {
    const s = run(start(), { type: 'confirm', findingId: LABEL });
    expect(blocked(s, { type: 'resolve', findingId: LABEL, note: 'x' }).message).toBe(
      "Can't resolve yet. Confirm the finding, then request evidence or assign follow-up.",
    );
  });
  it('Resolve without a note', () => {
    const s = run(start(), { type: 'confirm', findingId: LABEL }, assign(LABEL));
    expect(blocked(s, { type: 'resolve', findingId: LABEL, note: '   ' }).fieldErrors).toEqual({ note: 'Add a resolution note.' });
  });
  it('Challenge without a reason', () => {
    const r = blocked(start(), { type: 'challenge', findingId: LABEL, reason: ' ' });
    expect(r.fieldErrors).toEqual({ reason: 'Add a reason for the challenge.' });
    expect(r.message).toBe('Challenge not saved. Fix 1 field.');
  });
  it('Assign or request evidence before Confirm', () => {
    expect(blocked(start(), assign(SHORT)).message).toBe('Confirm the finding first.');
    expect(blocked(start(), request(MISSING)).message).toBe('Confirm the finding first.');
  });
  it('handoff with no owner and no due date shows both field errors', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT });
    const r = blocked(s, assign(SHORT, { owner: '', dueDate: '' }));
    expect(r.fieldErrors).toEqual({ owner: 'Choose an owner.', dueDate: 'Add a due date.' });
    expect(r.message).toBe('Handoff not saved. Fix 2 fields.');
    expect(s.findings[SHORT]!.status).toBe('confirmed');
    expect(s.history).toHaveLength(1);
  });
  it('handoff with every field empty lists all four', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT });
    const r = blocked(s, assign(SHORT, { owner: '', category: '', dueDate: '', note: '' }));
    expect(r.fieldErrors).toEqual({
      owner: 'Choose an owner.',
      category: 'Choose a reason category.',
      dueDate: 'Add a due date.',
      note: 'Add a short note for the owner.',
    });
  });
  it('a due date in the past is rejected', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT });
    expect(blocked(s, assign(SHORT, { dueDate: '2026-11-09' })).fieldErrors).toEqual({ dueDate: "Due date can't be in the past." });
  });
  it('a due date that is not a real date is rejected', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT });
    expect(blocked(s, assign(SHORT, { dueDate: '2026-02-30' })).fieldErrors).toEqual({ dueDate: 'Enter a real date.' });
    expect(blocked(s, assign(SHORT, { dueDate: 'soon' })).fieldErrors).toEqual({ dueDate: 'Enter a real date.' });
  });
  it('an owner or category outside the fixed lists is rejected', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT });
    const r = blocked(s, assign(SHORT, { owner: 'Somebody else', category: 'Other' }));
    expect(r.fieldErrors).toEqual({ owner: 'Choose an owner.', category: 'Choose a reason category.' });
  });
  it('an evidence request needs what, who, and when', () => {
    const s = run(start(), { type: 'confirm', findingId: MISSING });
    const r = blocked(s, request(MISSING, { whatMissing: '', fromOwner: '', dueDate: '' }));
    expect(r.fieldErrors).toEqual({
      whatMissing: 'Say what evidence is missing.',
      fromOwner: 'Choose who to ask.',
      dueDate: 'Add a due date.',
    });
    expect(r.message).toBe('Evidence request not saved. Fix 3 fields.');
  });
  it('a note over 500 characters is rejected', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT });
    expect(blocked(s, assign(SHORT, { note: 'x'.repeat(501) })).fieldErrors).toEqual({ note: 'Keep this under 500 characters.' });
  });
  it('cannot confirm twice, or act on a closed finding', () => {
    let s = run(start(), { type: 'confirm', findingId: LABEL });
    expect(blocked(s, { type: 'confirm', findingId: LABEL }).message).toBe('Only an open finding can be confirmed.');
    expect(blocked(s, { type: 'challenge', findingId: LABEL, reason: 'Late doubt.' }).message).toBe('Only an open finding can be challenged.');
    s = run(s, assign(LABEL), { type: 'resolve', findingId: LABEL, note: 'Sent.' });
    expect(blocked(s, { type: 'confirm', findingId: LABEL }).message).toBe('Only an open finding can be confirmed.');
    expect(blocked(s, { type: 'resolve', findingId: LABEL, note: 'Again.' }).message).toBe('This finding is already resolved.');
  });
  it('cannot dismiss or reopen a finding that was not challenged', () => {
    expect(blocked(start(), { type: 'dismiss', findingId: LABEL }).message).toBe('Challenge the finding first.');
    expect(blocked(start(), { type: 'reopen', findingId: LABEL }).message).toBe('Only a challenged finding can go back to Open.');
  });
  it('cannot mark evidence received before a handoff, twice, or when none is awaited', () => {
    expect(blocked(start(), { type: 'mark_evidence_received', findingId: MISSING }).message).toBe(
      'Request evidence or assign follow-up first.',
    );
    const s = run(start(), { type: 'confirm', findingId: MISSING }, request(MISSING), { type: 'mark_evidence_received', findingId: MISSING });
    expect(blocked(s, { type: 'mark_evidence_received', findingId: MISSING }).message).toBe('Evidence is already marked received.');
    const t = run(start(), { type: 'confirm', findingId: LABEL }, assign(LABEL));
    expect(blocked(t, { type: 'mark_evidence_received', findingId: LABEL }).message).toBe('This finding is not waiting on outside evidence.');
  });
  it('an unknown finding id is refused', () => {
    expect(blocked(start(), { type: 'confirm', findingId: 'nope' }).message).toBe('Finding not found.');
  });
});

describe('action availability explains every disabled button', () => {
  it('on an open missing-evidence finding', () => {
    const a = actionAvailability(caseOf('A').findings[1]!, start().findings[MISSING]!);
    expect(a.confirm.allowed).toBe(true);
    expect(a.challenge.allowed).toBe(true);
    expect(a.request_evidence).toEqual({ allowed: false, reason: 'Confirm the finding first.' });
    expect(a.assign).toEqual({ allowed: false, reason: 'Confirm the finding first.' });
    expect(a.resolve).toEqual({ allowed: false, reason: "Can't resolve yet. Posting history for Account B is still missing." });
  });
});

describe('Case C posting decision', () => {
  it('is blocked without a reason', () => {
    const r = blocked(start(), { type: 'posting_decision', caseId: 'C', choice: 'hold', reason: '' });
    expect(r.fieldErrors).toEqual({ reason: 'Add a reason for this posting decision.' });
  });
  it('is blocked without a choice', () => {
    const r = blocked(start(), { type: 'posting_decision', caseId: 'C', choice: '', reason: 'Because.' });
    expect(r.fieldErrors).toEqual({ choice: 'Choose Hold or Proceed per remittance.' });
  });
  it('logs Hold with a reason and leaves the $25.00 exception open', () => {
    const s = run(start(), { type: 'posting_decision', caseId: 'C', choice: 'hold', reason: 'Wait for cash team.' });
    expect(s.postingDecisions.C).toMatchObject({ choice: 'hold', reason: 'Wait for cash team.' });
    expect(s.findings[SHORT]!.status).toBe('open');
    expect(openFindingCount(s)).toBe(4);
    expect(historyForCase(s.history, 'C')[0]).toMatchObject({
      action: 'Recorded posting decision',
      from: 'No decision',
      to: 'Hold',
      note: 'Wait for cash team.',
      actor: 'Demo reviewer',
    });
  });
  it('logs Proceed per remittance and still leaves the exception open', () => {
    const s = run(start(), { type: 'posting_decision', caseId: 'C', choice: 'proceed_per_remittance', reason: 'Remit is clear.' });
    expect(s.findings[SHORT]!.status).toBe('open');
    expect(caseReview(caseOf('C'), s).state).toBe('needs_attention');
  });
  it('can be changed later, and each change adds one history entry', () => {
    const s = run(
      start(),
      { type: 'posting_decision', caseId: 'C', choice: 'hold', reason: 'Wait.' },
      { type: 'posting_decision', caseId: 'C', choice: 'proceed_per_remittance', reason: 'Supervisor approved.' },
    );
    const history = historyForCase(s.history, 'C');
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ action: 'Changed posting decision', from: 'Hold', to: 'Proceed per remittance' });
  });
  it('is refused on a case that does not need one', () => {
    expect(blocked(start(), { type: 'posting_decision', caseId: 'A', choice: 'hold', reason: 'x' }).message).toBe(
      'This case has no posting decision to record.',
    );
  });
});

describe('decision history', () => {
  it('adds exactly one entry per action, newest first, with from and to', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT }, assign(SHORT));
    const history = historyForCase(s.history, 'C');
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      at: clock.now,
      actor: 'Demo reviewer',
      action: 'Assigned follow-up',
      subject: 'Deposit short by $25.00, reason unknown',
      from: 'Confirmed',
      to: 'Assigned',
      note: 'Cash reconciliation, due 2026-11-12. Deposit mismatch. Please find the reason for the gap.',
    });
    expect(history[1]).toMatchObject({ action: 'Confirmed finding', from: 'Open', to: 'Confirmed' });
    expect(lastAction(s.history, 'C')).toBe(history[0]);
    expect(historyForCase(s.history, 'A')).toEqual([]);
  });
  it('does not change the starting state object', () => {
    const s = start();
    run(s, { type: 'confirm', findingId: SHORT });
    expect(s.findings[SHORT]!.status).toBe('open');
    expect(s.history).toEqual([]);
  });
});

describe('case review roll-up never implies completion', () => {
  it('starts as needs attention for every case', () => {
    const s = start();
    expect(analysis.cases.map((c) => caseReview(c, s).state)).toEqual(['needs_attention', 'needs_attention', 'needs_attention']);
  });
  it('moves to waiting once every finding is handed off', () => {
    const s = run(start(), { type: 'confirm', findingId: CLAIM }, request(CLAIM, { fromOwner: 'Posting team (Facility A)' }));
    expect(caseReview(caseOf('B'), s)).toMatchObject({ state: 'waiting', label: 'Waiting on someone' });
  });
  it('Case C still needs attention after handoff until the posting decision is recorded', () => {
    let s = run(start(), { type: 'confirm', findingId: SHORT }, assign(SHORT));
    expect(caseReview(caseOf('C'), s).state).toBe('needs_attention');
    s = run(s, { type: 'posting_decision', caseId: 'C', choice: 'hold', reason: 'Wait.' });
    expect(caseReview(caseOf('C'), s).state).toBe('waiting');
  });
  it('with all findings closed, Case A is still not complete: posting for Account B is unknown', () => {
    const s = run(
      start(),
      { type: 'confirm', findingId: LABEL },
      assign(LABEL),
      { type: 'resolve', findingId: LABEL, note: 'Sent.' },
      { type: 'confirm', findingId: MISSING },
      request(MISSING),
      { type: 'mark_evidence_received', findingId: MISSING },
      { type: 'resolve', findingId: MISSING, note: 'Received.' },
    );
    const review = caseReview(caseOf('A'), s);
    expect(review.state).toBe('closed_open_items');
    expect(review.label).toBe('Findings resolved, not complete');
    expect(review.openItems).toEqual(['Posting unknown for Account B']);
    expect(openFindingCount(s)).toBe(2);
  });
  it('dismissing a finding does not make the case complete either', () => {
    const s = run(start(), { type: 'challenge', findingId: CLAIM, reason: 'Not needed.' }, { type: 'dismiss', findingId: CLAIM });
    const review = caseReview(caseOf('B'), s);
    expect(review.state).toBe('closed_open_items');
    expect(review.openItems).toEqual(['Not posted for Account A']);
  });
  it('a case is complete only when cash is matched and posting is proven for every account', () => {
    const ds = brokenFixture((raw) => {
      raw.billing_ledger.payment_records[0].summary_status = 'posted';
      raw.clearinghouse.remittance_records = raw.clearinghouse.remittance_records.filter((r: any) => r.record_id === 'REM-001' || r.record_id === 'REM-001-A');
      raw.clearinghouse.remittance_records[0].amount_cents = 18000;
      raw.cash_tracker.deposits = [raw.cash_tracker.deposits[0]];
      raw.cash_tracker.deposits[0].amount_cents = 18000;
      raw.cash_tracker.deposits[0].allocations = [raw.cash_tracker.deposits[0].allocations[0]];
      raw.billing_ledger.payment_records = [raw.billing_ledger.payment_records[0]];
      raw.case_index = [raw.case_index[0]];
    });
    const clean = analyze(ds);
    expect(clean.cases[0]!.findings).toEqual([]);
    expect(caseReview(clean.cases[0]!, initialReviewState(clean))).toMatchObject({ state: 'complete', label: 'Reconciled and posted', openItems: [] });
  });
});

describe('next step owners for the worklist', () => {
  it('starts with the reviewer and names the suggested owner', () => {
    expect(nextSteps(caseOf('C'), start())).toEqual([
      { who: 'You', what: 'Review 1 finding', due: null, suggested: ['Cash reconciliation'] },
      { who: 'You', what: 'Record the posting decision', due: null, suggested: [] },
    ]);
    expect(nextSteps(caseOf('A'), start())).toEqual([
      { who: 'You', what: 'Review 2 findings', due: null, suggested: ['Billing system admin', 'Posting team (Facility B)'] },
    ]);
  });
  it('shows the owner and due date after a handoff', () => {
    const s = run(start(), { type: 'confirm', findingId: SHORT }, assign(SHORT), { type: 'posting_decision', caseId: 'C', choice: 'hold', reason: 'Wait.' });
    expect(nextSteps(caseOf('C'), s)).toEqual([{ who: 'Cash reconciliation', what: 'Follow up', due: '2026-11-12', suggested: [] }]);
  });
  it('shows the request owner after an evidence request', () => {
    const s = run(start(), { type: 'confirm', findingId: MISSING }, request(MISSING));
    expect(nextSteps(caseOf('A'), s)).toEqual([
      { who: 'You', what: 'Review 1 finding', due: null, suggested: ['Billing system admin'] },
      { who: 'Posting team (Facility B)', what: 'Send evidence', due: '2026-11-12', suggested: [] },
    ]);
  });
});

describe('one-step handoff from Open (confirm and hand off together)', () => {
  const dueDate = '2030-04-15';
  const demoClock = { now: '2030-04-10T12:00:00Z', today: '2030-04-10' };
  const handoff: Action = { type: 'assign', findingId: SHORT, owner: 'Cash reconciliation', category: 'Deposit mismatch', dueDate, note: 'Find the reason.' };

  it('confirms and assigns as one step, with one history entry per move', () => {
    const result = applyActionSequence(start(), analysis, [{ type: 'confirm', findingId: SHORT }, handoff], demoClock);
    if (!result.ok) throw new Error(result.message);
    expect(result.state.findings[SHORT]!.status).toBe('assigned');
    expect(result.state.history.map((h) => `${h.from} to ${h.to}`)).toEqual(['Open to Confirmed', 'Confirmed to Assigned']);
  });

  it('changes nothing when the handoff is invalid: the finding stays Open, not Confirmed', () => {
    const state = start();
    const result = applyActionSequence(state, analysis, [{ type: 'confirm', findingId: SHORT }, { ...handoff, owner: '', dueDate: '' }], demoClock);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(state.findings[SHORT]!.status).toBe('open');
    expect(state.history).toEqual([]);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors).toMatchObject({ owner: 'Choose an owner.', dueDate: 'Add a due date.' });
  });

  it('rejects a due date before the demo clock date', () => {
    const state = start();
    const result = applyActionSequence(state, analysis, [{ type: 'confirm', findingId: SHORT }, { ...handoff, dueDate: '2030-04-09' }], demoClock);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });
});
