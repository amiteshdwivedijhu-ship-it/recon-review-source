import type { Analysis, CaseAnalysis, Finding } from './findings';
import { type HistoryEntry, appendHistory } from './history';
import { isIsoDate } from './load';
import { formatCents } from './money';
import { OWNERS, REASON_CATEGORIES, type Owner, type ReasonCategory } from './types';

export type FindingStatus = 'open' | 'confirmed' | 'challenged' | 'dismissed' | 'evidence_requested' | 'assigned' | 'resolved';

export const STATUS_LABEL: Record<FindingStatus, string> = {
  open: 'Open',
  confirmed: 'Confirmed',
  challenged: 'Challenged',
  dismissed: 'Dismissed by reviewer',
  evidence_requested: 'Evidence requested',
  assigned: 'Assigned',
  resolved: 'Resolved',
};

export type PostingChoice = 'hold' | 'proceed_per_remittance';
export const POSTING_CHOICE_LABEL: Record<PostingChoice, string> = {
  hold: 'Hold',
  proceed_per_remittance: 'Proceed per remittance',
};

export interface FindingReview {
  status: FindingStatus;
  challengeReason: string | null;
  evidenceRequest: { whatMissing: string; from: Owner; dueDate: string } | null;
  assignment: { owner: Owner; category: ReasonCategory; dueDate: string; note: string } | null;
  evidenceReceived: boolean;
  resolutionNote: string | null;
}

export interface PostingDecision {
  choice: PostingChoice;
  reason: string;
  at: string;
}

/** Everything the reviewer has done. Held in memory only. */
export interface ReviewState {
  findings: Record<string, FindingReview>;
  postingDecisions: Record<string, PostingDecision>;
  history: HistoryEntry[];
}

/** Form values arrive as plain text, so every field is checked here, not trusted. */
export type Action =
  | { type: 'confirm'; findingId: string }
  | { type: 'challenge'; findingId: string; reason: string }
  | { type: 'dismiss'; findingId: string }
  | { type: 'reopen'; findingId: string }
  | { type: 'request_evidence'; findingId: string; whatMissing: string; fromOwner: string; dueDate: string }
  | { type: 'assign'; findingId: string; owner: string; category: string; dueDate: string; note: string }
  | { type: 'mark_evidence_received'; findingId: string }
  | { type: 'resolve'; findingId: string; note: string }
  | { type: 'posting_decision'; caseId: string; choice: string; reason: string };

export type FindingActionType = Exclude<Action['type'], 'posting_decision'>;

export interface Clock {
  /** ISO timestamp for the history entry. */
  now: string;
  /** Today as YYYY-MM-DD, used to reject past due dates. */
  today: string;
}

export type ActionResult =
  | { ok: true; state: ReviewState; toast: string }
  | { ok: false; state: ReviewState; message: string; fieldErrors: Record<string, string> };

/**
 * How the screens send an action. confirmFirst hands off an open finding in one step:
 * the finding is confirmed and handed off together, or not at all.
 */
export type Dispatch = (action: Action, options?: { confirmFirst?: boolean }) => ActionResult;

export const MAX_TEXT = 500;
const HANDOFF: FindingStatus[] = ['evidence_requested', 'assigned'];
const NEEDS_REVIEWER: FindingStatus[] = ['open', 'challenged', 'confirmed'];
const CLOSED: FindingStatus[] = ['resolved', 'dismissed'];

export function initialReviewState(analysis: Analysis): ReviewState {
  const findings: Record<string, FindingReview> = {};
  for (const c of analysis.cases) {
    for (const f of c.findings) {
      findings[f.id] = { status: 'open', challengeReason: null, evidenceRequest: null, assignment: null, evidenceReceived: false, resolutionNote: null };
    }
  }
  return { findings, postingDecisions: {}, history: [] };
}

/** Why a move is not allowed right now, or null when it is. Field checks come later. */
function guard(type: FindingActionType, finding: Finding, review: FindingReview): string | null {
  const { status } = review;
  switch (type) {
    case 'confirm':
      return status === 'open' ? null : 'Only an open finding can be confirmed.';
    case 'challenge':
      return status === 'open' ? null : 'Only an open finding can be challenged.';
    case 'dismiss':
      return status === 'challenged' ? null : 'Challenge the finding first.';
    case 'reopen':
      return status === 'challenged' ? null : 'Only a challenged finding can go back to Open.';
    case 'request_evidence':
    case 'assign':
      if (status === 'confirmed') return null;
      if (status === 'open') return 'Confirm the finding first.';
      if (status === 'challenged') return 'This finding is challenged. Move it back to Open and confirm it first.';
      if (HANDOFF.includes(status)) return `Already handed off: ${STATUS_LABEL[status].toLowerCase()}.`;
      return status === 'resolved' ? 'This finding is already resolved.' : 'This finding was dismissed.';
    case 'mark_evidence_received':
      if (!finding.requiresEvidence) return 'This finding is not waiting on outside evidence.';
      if (CLOSED.includes(status)) return status === 'resolved' ? 'This finding is already resolved.' : 'This finding was dismissed.';
      if (!HANDOFF.includes(status)) return 'Request evidence or assign follow-up first.';
      return review.evidenceReceived ? 'Evidence is already marked received.' : null;
    case 'resolve':
      if (status === 'resolved') return 'This finding is already resolved.';
      if (status === 'dismissed') return 'This finding was dismissed.';
      if (finding.requiresEvidence && !review.evidenceReceived) return `Can't resolve yet. ${finding.waitingOn ?? 'Evidence is still missing.'}`;
      if (!HANDOFF.includes(status)) return "Can't resolve yet. Confirm the finding, then request evidence or assign follow-up.";
      return null;
  }
}

export type Availability = Record<FindingActionType, { allowed: true } | { allowed: false; reason: string }>;

/** For the action panel: which buttons work, and the reason for each one that does not. */
export function actionAvailability(finding: Finding, review: FindingReview): Availability {
  const types: FindingActionType[] = ['confirm', 'challenge', 'dismiss', 'reopen', 'request_evidence', 'assign', 'mark_evidence_received', 'resolve'];
  return Object.fromEntries(
    types.map((type) => {
      const reason = guard(type, finding, review);
      return [type, reason === null ? { allowed: true } : { allowed: false, reason }];
    }),
  ) as Availability;
}

function requiredText(errors: Record<string, string>, field: string, value: string, missing: string): string {
  const text = value.trim();
  if (text === '') errors[field] = missing;
  else if (text.length > MAX_TEXT) errors[field] = `Keep this under ${MAX_TEXT} characters.`;
  return text;
}

function dueDateError(value: string, today: string): string | null {
  const text = value.trim();
  if (text === '') return 'Add a due date.';
  if (!isIsoDate(text)) return 'Enter a real date.';
  if (text < today) return "Due date can't be in the past.";
  return null;
}

const isOwner = (v: string): v is Owner => (OWNERS as readonly string[]).includes(v);
const isCategory = (v: string): v is ReasonCategory => (REASON_CATEGORIES as readonly string[]).includes(v);
const isChoice = (v: string): v is PostingChoice => v === 'hold' || v === 'proceed_per_remittance';

function findFinding(analysis: Analysis, findingId: string): Finding | null {
  for (const c of analysis.cases) {
    const found = c.findings.find((f) => f.id === findingId);
    if (found) return found;
  }
  return null;
}

/**
 * The only way review state changes. Pure: returns a new state or a refusal.
 * A refusal returns the very same state object, so nothing can change by accident.
 */
export function applyAction(state: ReviewState, analysis: Analysis, action: Action, clock: Clock): ActionResult {
  const refuse = (message: string, fieldErrors: Record<string, string> = {}): ActionResult => ({ ok: false, state, message, fieldErrors });
  const refuseFields = (what: string, fieldErrors: Record<string, string>): ActionResult => {
    const n = Object.keys(fieldErrors).length;
    return refuse(`${what} not saved. Fix ${n} ${n === 1 ? 'field' : 'fields'}.`, fieldErrors);
  };

  if (action.type === 'posting_decision') {
    const target = analysis.cases.find((c) => c.caseId === action.caseId);
    if (!target || target.postingDecision === null) return refuse('This case has no posting decision to record.');
    const errors: Record<string, string> = {};
    if (!isChoice(action.choice)) errors.choice = 'Choose Hold or Proceed per remittance.';
    const reason = requiredText(errors, 'reason', action.reason, 'Add a reason for this posting decision.');
    if (Object.keys(errors).length > 0 || !isChoice(action.choice)) return refuseFields('Posting decision', errors);
    const previous = state.postingDecisions[action.caseId];
    const label = POSTING_CHOICE_LABEL[action.choice];
    return {
      ok: true,
      toast: `Posting decision saved: ${label}. The deposit exception stays open.`,
      state: {
        ...state,
        postingDecisions: { ...state.postingDecisions, [action.caseId]: { choice: action.choice, reason, at: clock.now } },
        history: appendHistory(state.history, {
          at: clock.now,
          caseId: action.caseId,
          findingId: null,
          subject: 'Posting decision',
          action: previous ? 'Changed posting decision' : 'Recorded posting decision',
          from: previous ? POSTING_CHOICE_LABEL[previous.choice] : 'No decision',
          to: label,
          note: reason,
        }),
      },
    };
  }

  const finding = findFinding(analysis, action.findingId);
  const review = state.findings[action.findingId];
  if (!finding || !review) return refuse('Finding not found.');
  const blockedBy = guard(action.type, finding, review);
  if (blockedBy !== null) return refuse(blockedBy);

  const commit = (next: FindingReview, verb: string, note: string, toast: string): ActionResult => ({
    ok: true,
    toast,
    state: {
      ...state,
      findings: { ...state.findings, [finding.id]: next },
      history: appendHistory(state.history, {
        at: clock.now,
        caseId: finding.caseId,
        findingId: finding.id,
        subject: finding.title,
        action: verb,
        from: STATUS_LABEL[review.status],
        to: STATUS_LABEL[next.status],
        note,
      }),
    },
  });
  const errors: Record<string, string> = {};

  switch (action.type) {
    case 'confirm':
      return commit({ ...review, status: 'confirmed' }, 'Confirmed finding', 'Reviewer agrees with the system finding.', `Confirmed: ${finding.title}.`);
    case 'challenge': {
      const reason = requiredText(errors, 'reason', action.reason, 'Add a reason for the challenge.');
      if (Object.keys(errors).length > 0) return refuseFields('Challenge', errors);
      return commit({ ...review, status: 'challenged', challengeReason: reason }, 'Challenged finding', reason, `Challenged: ${finding.title}.`);
    }
    case 'dismiss':
      return commit({ ...review, status: 'dismissed' }, 'Dismissed finding', review.challengeReason ?? '', `Dismissed: ${finding.title}. The source evidence stays visible.`);
    case 'reopen':
      return commit({ ...review, status: 'open', challengeReason: null }, 'Moved back to Open', 'Challenge withdrawn.', `Back to Open: ${finding.title}.`);
    case 'request_evidence': {
      const whatMissing = requiredText(errors, 'whatMissing', action.whatMissing, 'Say what evidence is missing.');
      if (!isOwner(action.fromOwner)) errors.fromOwner = 'Choose who to ask.';
      const due = dueDateError(action.dueDate, clock.today);
      if (due) errors.dueDate = due;
      if (Object.keys(errors).length > 0 || !isOwner(action.fromOwner)) return refuseFields('Evidence request', errors);
      const dueDate = action.dueDate.trim();
      return commit(
        { ...review, status: 'evidence_requested', evidenceRequest: { whatMissing, from: action.fromOwner, dueDate } },
        'Requested evidence',
        `Asked ${action.fromOwner} by ${dueDate}: ${whatMissing}`,
        `Evidence requested from ${action.fromOwner}, due ${dueDate}.`,
      );
    }
    case 'assign': {
      if (!isOwner(action.owner)) errors.owner = 'Choose an owner.';
      if (!isCategory(action.category)) errors.category = 'Choose a reason category.';
      const due = dueDateError(action.dueDate, clock.today);
      if (due) errors.dueDate = due;
      const note = requiredText(errors, 'note', action.note, 'Add a short note for the owner.');
      if (Object.keys(errors).length > 0 || !isOwner(action.owner) || !isCategory(action.category)) return refuseFields('Handoff', errors);
      const dueDate = action.dueDate.trim();
      return commit(
        { ...review, status: 'assigned', assignment: { owner: action.owner, category: action.category, dueDate, note } },
        'Assigned follow-up',
        `${action.owner}, due ${dueDate}. ${action.category}. ${note}`,
        `Assigned to ${action.owner}, due ${dueDate}.`,
      );
    }
    case 'mark_evidence_received':
      return commit({ ...review, evidenceReceived: true }, 'Marked evidence received (simulated)', 'Simulated. No source record changed.', `Evidence marked received (simulated): ${finding.title}.`);
    case 'resolve': {
      const note = requiredText(errors, 'note', action.note, 'Add a resolution note.');
      if (Object.keys(errors).length > 0) return refuseFields('Resolution', errors);
      return commit({ ...review, status: 'resolved', resolutionNote: note }, 'Resolved finding', note, `Resolved: ${finding.title}.`);
    }
  }
}

/**
 * Apply several actions as one step. If any one is refused, nothing changes:
 * the refusal carries the state that was passed in. Each action still writes its own history entry.
 */
export function applyActionSequence(state: ReviewState, analysis: Analysis, actions: Action[], clock: Clock): ActionResult {
  let current = state;
  let toast = '';
  for (const action of actions) {
    const result = applyAction(current, analysis, action, clock);
    if (!result.ok) return { ...result, state };
    current = result.state;
    toast = result.toast;
  }
  return { ok: true, state: current, toast };
}

export function openFindingCount(state: ReviewState): number {
  return Object.values(state.findings).filter((f) => !CLOSED.includes(f.status)).length;
}

export type CaseReviewState = 'needs_attention' | 'waiting' | 'closed_open_items' | 'complete';

export interface CaseReview {
  state: CaseReviewState;
  label: string;
  /** What the source records still do not prove, even after review. */
  openItems: string[];
}

/** Items the source data leaves open. Reviewer decisions never clear these. */
function sourceOpenItems(c: CaseAnalysis): string[] {
  const items: string[] = [];
  if (c.cash.status === 'unknown') items.push('No deposit found');
  if (c.cash.status === 'variance') {
    const diff = c.cash.differenceCents ?? 0;
    items.push(diff === 0 ? 'Deposit split does not match' : `Deposit ${diff < 0 ? 'short' : 'over'} by ${formatCents(Math.abs(diff))}`);
  }
  c.postings.forEach((p, i) => {
    const name = c.accountNames[i] ?? 'this account';
    if (p.status === 'unknown') items.push(`Posting unknown for ${name}`);
    if (p.status === 'not_posted_confirmed') items.push(`Not posted for ${name}`);
    if (p.status === 'amount_mismatch') items.push(`Posted amount differs for ${name}`);
  });
  return items;
}

const needsReviewer = (r: FindingReview) => NEEDS_REVIEWER.includes(r.status) || (HANDOFF.includes(r.status) && r.evidenceReceived);

/**
 * Roll-up for one case. "Complete" is only possible when the source records prove it:
 * cash matched and posting verified for every account, with no finding left open.
 */
export function caseReview(c: CaseAnalysis, state: ReviewState): CaseReview {
  const reviews = c.findings.flatMap((f) => state.findings[f.id] ?? []);
  const openItems = sourceOpenItems(c);
  const decisionMissing = c.postingDecision !== null && !state.postingDecisions[c.caseId];
  if (decisionMissing || reviews.some(needsReviewer)) return { state: 'needs_attention', label: 'Needs attention', openItems };
  if (reviews.some((r) => HANDOFF.includes(r.status))) return { state: 'waiting', label: 'Waiting on someone', openItems };
  if (openItems.length > 0) return { state: 'closed_open_items', label: 'Findings resolved, not complete', openItems };
  return { state: 'complete', label: 'Reconciled and posted', openItems };
}

export interface NextStep {
  who: string;
  what: string;
  due: string | null;
  /** Owners the system suggests for findings the reviewer has not handed off yet. */
  suggested: string[];
}

/** Who owns the next step on a case, for the worklist row. */
export function nextSteps(c: CaseAnalysis, state: ReviewState): NextStep[] {
  const steps: NextStep[] = [];
  const pairs = c.findings.flatMap((f) => {
    const review = state.findings[f.id];
    return review ? [{ finding: f, review }] : [];
  });
  const toReview = pairs.filter((p) => NEEDS_REVIEWER.includes(p.review.status));
  if (toReview.length > 0) {
    steps.push({
      who: 'You',
      what: `Review ${toReview.length} ${toReview.length === 1 ? 'finding' : 'findings'}`,
      due: null,
      suggested: [...new Set(toReview.map((p) => p.finding.suggestedOwner))],
    });
  }
  for (const { review } of pairs) {
    if (!HANDOFF.includes(review.status)) continue;
    if (review.evidenceReceived) steps.push({ who: 'You', what: 'Resolve finding', due: null, suggested: [] });
    else if (review.status === 'assigned' && review.assignment) steps.push({ who: review.assignment.owner, what: 'Follow up', due: review.assignment.dueDate, suggested: [] });
    else if (review.evidenceRequest) steps.push({ who: review.evidenceRequest.from, what: 'Send evidence', due: review.evidenceRequest.dueDate, suggested: [] });
  }
  if (c.postingDecision !== null && !state.postingDecisions[c.caseId]) {
    steps.push({ who: 'You', what: 'Record the posting decision', due: null, suggested: [] });
  }
  return steps;
}
