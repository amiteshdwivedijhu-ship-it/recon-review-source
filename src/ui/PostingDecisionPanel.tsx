import { type FormEvent, useState } from 'react';
import type { PostingDecisionPrompt } from '../domain/findings';
import { type Dispatch, POSTING_CHOICE_LABEL, type PostingChoice, type PostingDecision } from '../domain/workflow';
import { StatusPill } from './StatusPill';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Field, FormAlert, SimulatedNote } from './fields';
import { formatActionTime } from './format';

const CHOICES: { value: PostingChoice; help: string }[] = [
  { value: 'hold', help: 'Do not post until the difference is explained.' },
  { value: 'proceed_per_remittance', help: 'Post the remittance amount. The deposit gap is worked as its own exception.' },
];

/** The system side of the posting call: it shows both amounts and suggests nothing. */
export function PostingDecisionPrompt({ prompt }: { prompt: PostingDecisionPrompt }) {
  return (
    <article aria-labelledby="posting-call-heading" className="h-full rounded-lg border border-tint-border bg-tint p-4">
      <h3 id="posting-call-heading" className="text-base font-semibold">
        No system suggestion for posting
      </h3>
      <p className="text-xs font-medium text-primary">System note · Posting</p>
      <p data-testid="posting-prompt" className="mt-1 text-sm">
        {prompt.prompt}
      </p>
      <p className="mt-2 text-sm text-muted">
        Matching cash alone does not prove a payment is ready to post, and here the cash does not match. The deposit exception stays open whichever way you decide.
      </p>
    </article>
  );
}

/** The reviewer side: Hold or Proceed per remittance, always with a reason. */
export function PostingDecisionPanel({
  caseId,
  decision,
  dispatch,
}: {
  caseId: string;
  decision: PostingDecision | undefined;
  dispatch: Dispatch;
}) {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const showForm = !decision || editing;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = dispatch({ type: 'posting_decision', caseId, choice, reason });
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setAlert(result.message);
      return;
    }
    setEditing(false);
    setChoice('');
    setReason('');
    setErrors({});
    setAlert(null);
  };

  return (
    <section aria-label="Your posting decision" data-testid="posting-decision" className="h-full rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">Your posting decision</span>
        <span data-testid="posting-decision-status">
          {decision ? <StatusPill tone="decision">{POSTING_CHOICE_LABEL[decision.choice]}</StatusPill> : <StatusPill tone="warn">Decision needed</StatusPill>}
        </span>
      </div>
      {decision ? (
        <dl className="mt-3 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-xs font-medium text-muted">Reason</dt>
          <dd>{decision.reason}</dd>
          <dt className="text-xs font-medium text-muted">Recorded</dt>
          <dd>{formatActionTime(decision.at)} by Demo reviewer</dd>
        </dl>
      ) : null}
      {showForm ? (
        <form onSubmit={submit} noValidate className="mt-3 space-y-3">
          <FormAlert message={alert} />
          <fieldset aria-describedby={errors.choice ? 'posting-choice-error' : undefined}>
            <legend className="mb-1 text-xs font-semibold">Posting call</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHOICES.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${choice === option.value ? 'border-primary bg-tint' : 'border-line bg-white'}`}
                >
                  <input type="radio" name={`posting-choice-${caseId}`} value={option.value} checked={choice === option.value} onChange={() => setChoice(option.value)} className="mt-0.5 accent-[var(--color-primary)]" />
                  <span>
                    <span className="block text-sm font-semibold">{POSTING_CHOICE_LABEL[option.value]}</span>
                    <span className="block text-xs text-muted">{option.help}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.choice ? (
              <p id="posting-choice-error" data-testid="error-posting-choice" className="mt-1 text-xs font-medium text-bad-fg">
                {errors.choice}
              </p>
            ) : null}
          </fieldset>
          <Field id="posting-reason" label="Reason (required)" error={errors.reason}>
            {(props) => <textarea {...props} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this is the right call" />}
          </Field>
          <SimulatedNote>Nothing is posted. This records your decision in the demo only.</SimulatedNote>
          <div className="flex gap-2">
            <button type="submit" className={BUTTON_PRIMARY}>
              {decision ? 'Save changed decision' : 'Save posting decision'}
            </button>
            {decision ? (
              <button type="button" className={BUTTON_SECONDARY} onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <button type="button" className={`mt-3 ${BUTTON_SECONDARY}`} onClick={() => setEditing(true)}>
          Change decision
        </button>
      )}
    </section>
  );
}
