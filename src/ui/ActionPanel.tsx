import { type FormEvent, useState } from 'react';
import type { Finding } from '../domain/findings';
import type { Dispatch, FindingActionType, FindingReview } from '../domain/workflow';
import { actionAvailability } from '../domain/workflow';
import { HandoffForm } from './HandoffForm';
import { FindingStatusPill } from './StatusPill';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Field, FormAlert, SimulatedNote } from './fields';
import { formatShortDate } from './format';

type FormKind = 'challenge' | 'request_evidence' | 'assign' | 'resolve';

const MAIN_ACTIONS: { type: FindingActionType; label: string; form: FormKind | null }[] = [
  { type: 'confirm', label: 'Confirm', form: null },
  { type: 'challenge', label: 'Challenge', form: 'challenge' },
  { type: 'request_evidence', label: 'Request evidence', form: 'request_evidence' },
  { type: 'assign', label: 'Assign follow-up', form: 'assign' },
  { type: 'resolve', label: 'Resolve', form: 'resolve' },
];

/** A small one-field form for a challenge reason or a resolution note. */
function NoteForm({
  idBase,
  kind,
  findingId,
  dispatch,
  onDone,
}: {
  idBase: string;
  kind: 'challenge' | 'resolve';
  findingId: string;
  dispatch: Dispatch;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [alert, setAlert] = useState<string | null>(null);
  const isChallenge = kind === 'challenge';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = dispatch(isChallenge ? { type: 'challenge', findingId, reason: text } : { type: 'resolve', findingId, note: text });
    if (result.ok) return onDone();
    setError(result.fieldErrors.reason ?? result.fieldErrors.note);
    setAlert(result.message);
  };
  return (
    <form onSubmit={submit} noValidate data-testid={`${kind}-form`} className="mt-3 space-y-3 rounded-lg border border-line bg-surface p-3">
      <h4 className="text-sm font-semibold">{isChallenge ? 'Challenge this finding' : 'Resolve this finding'}</h4>
      <FormAlert message={alert} />
      <Field
        id={`${idBase}-${kind}-text`}
        label={isChallenge ? 'Reason for the challenge' : 'Resolution note'}
        hint={isChallenge ? 'Say why you think the system finding is wrong.' : 'Say what closed this out.'}
        error={error}
      >
        {(props) => <textarea {...props} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={BUTTON_PRIMARY}>
          {isChallenge ? 'Save challenge' : 'Save resolution'}
        </button>
        <button type="button" onClick={onDone} className={BUTTON_SECONDARY}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Recorded({ review }: { review: FindingReview }) {
  const lines: [string, string][] = [];
  if (review.challengeReason) lines.push(['Challenge reason', review.challengeReason]);
  if (review.evidenceRequest) {
    lines.push(['Evidence requested', review.evidenceRequest.whatMissing]);
    lines.push(['Asked', `${review.evidenceRequest.from}, due ${formatShortDate(review.evidenceRequest.dueDate)}`]);
  }
  if (review.assignment) {
    lines.push(['Assigned to', `${review.assignment.owner}, due ${formatShortDate(review.assignment.dueDate)}`]);
    lines.push(['Reason category', review.assignment.category]);
    lines.push(['Note', review.assignment.note]);
  }
  if (review.evidenceReceived) lines.push(['Evidence', 'Marked received (simulated)']);
  if (review.resolutionNote) lines.push(['Resolution note', review.resolutionNote]);
  if (lines.length === 0) return null;
  return (
    <dl className="mt-3 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-sm">
      {lines.map(([term, text]) => (
        <div key={term} className="contents">
          <dt className="text-xs font-medium text-muted">{term}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Where the reviewer acts on one finding. Blocked actions stay visible and say why. */
export function ActionPanel({
  finding,
  review,
  dispatch,
  idBase,
  labelledBy,
  today,
}: {
  finding: Finding;
  review: FindingReview;
  dispatch: Dispatch;
  idBase: string;
  labelledBy: string;
  today: string;
}) {
  const [form, setForm] = useState<FormKind | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const rules = actionAvailability(finding, review);
  // From Open, a handoff is one step: sending it confirms the finding too. The rules still run both moves.
  const oneStep = review.status === 'open';
  const availability = oneStep ? { ...rules, request_evidence: { allowed: true as const }, assign: { allowed: true as const } } : rules;
  const closed = review.status === 'resolved' || review.status === 'dismissed';

  const run = (type: FindingActionType, opensForm: FormKind | null) => {
    const state = availability[type];
    if (!state.allowed) {
      setForm(null);
      setBlocked(state.reason);
      return;
    }
    setBlocked(null);
    if (opensForm) return setForm(opensForm);
    setForm(null);
    const result = dispatch({ type, findingId: finding.id } as Parameters<Dispatch>[0]);
    if (!result.ok) setBlocked(result.message);
  };

  // A move that is already behind the reviewer is not offered again: Confirm and Challenge only
  // apply to an open finding, and a handoff can only be made once. Resolve always stays, and says why it waits.
  const handedOff = review.status === 'evidence_requested' || review.status === 'assigned';
  const visibleActions = MAIN_ACTIONS.filter((action) => {
    if (action.type === 'confirm' || action.type === 'challenge') return review.status === 'open';
    if (action.type === 'request_evidence' || action.type === 'assign') return !handedOff;
    return true;
  });

  // Group the reasons so each one is written once, next to the actions it blocks.
  const reasons = new Map<string, string[]>();
  for (const action of visibleActions) {
    const state = availability[action.type];
    if (!state.allowed) reasons.set(state.reason, [...(reasons.get(state.reason) ?? []), action.label]);
  }

  const button = (type: FindingActionType, label: string, opensForm: FormKind | null, primary: boolean) => {
    const state = availability[type];
    const base = primary ? BUTTON_PRIMARY : BUTTON_SECONDARY;
    return (
      <button
        key={type}
        type="button"
        aria-disabled={!state.allowed}
        title={state.allowed ? undefined : state.reason}
        onClick={() => run(type, opensForm)}
        className={state.allowed ? base : 'cursor-not-allowed rounded-lg border border-dashed border-line bg-surface-2 px-3.5 py-2 text-sm font-semibold text-muted'}
      >
        {label}
      </button>
    );
  };

  return (
    <section aria-label={`Your decision`} aria-describedby={labelledBy} data-testid={`panel-${finding.id}`} className="h-full rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">Your decision</span>
        <span data-testid="finding-status">
          <FindingStatusPill status={review.status} />
        </span>
      </div>
      <Recorded review={review} />

      {closed ? (
        <p className="mt-3 text-sm text-muted">
          {review.status === 'resolved' ? 'You resolved this finding.' : 'You dismissed this finding.'} The source evidence stays visible above. Use Reset demo to start over.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleActions.map((action) => button(action.type, action.label, action.form, action.type === 'confirm'))}
          </div>
          {review.status === 'challenged' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {button('dismiss', 'Dismiss finding', null, true)}
              {button('reopen', 'Move back to Open', null, false)}
            </div>
          ) : null}
          {availability.mark_evidence_received.allowed ? (
            <div className="mt-2 space-y-1.5">
              {button('mark_evidence_received', 'Mark evidence received', null, true)}
              <SimulatedNote>This marks the evidence as received in the demo. No source record changes.</SimulatedNote>
            </div>
          ) : null}
          {blocked ? (
            <p role="alert" data-testid="blocked-message" className="mt-3 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm font-medium text-warn-fg">
              {blocked}
            </p>
          ) : null}
          {reasons.size > 0 ? (
            <ul data-testid="blocked-reasons" className="mt-3 space-y-1 text-xs text-muted">
              {[...reasons.entries()].map(([reason, labels]) => (
                <li key={reason}>
                  <span className="font-semibold text-ink">{labels.join(', ')}:</span> {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {form === 'challenge' || form === 'resolve' ? (
        <NoteForm idBase={idBase} kind={form} findingId={finding.id} dispatch={dispatch} onDone={() => setForm(null)} />
      ) : null}
      {form === 'request_evidence' || form === 'assign' ? (
        <HandoffForm key={form} mode={form} finding={finding} idBase={idBase} today={today} confirmFirst={oneStep} dispatch={dispatch} onDone={() => setForm(null)} />
      ) : null}
    </section>
  );
}
