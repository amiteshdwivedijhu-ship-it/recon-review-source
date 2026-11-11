import { type FormEvent, useState } from 'react';
import type { Finding } from '../domain/findings';
import { WINDOW_BUSINESS_DAYS, addBusinessDays } from '../domain/metrics';
import { OWNERS, REASON_CATEGORIES } from '../domain/types';
import type { Dispatch } from '../domain/workflow';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Field, FormAlert, SimulatedNote } from './fields';
import { formatShortDate } from './format';

/**
 * One form for both handoffs.
 * request_evidence asks: what is missing, who from, due date.
 * assign asks: owner, reason category, due date, note.
 * The form opens with the system's suggestion filled in and labeled as a suggestion.
 * Nothing is saved until the reviewer sends it, and one press clears the suggestion.
 */
export function HandoffForm({
  mode,
  finding,
  idBase,
  today,
  confirmFirst,
  dispatch,
  onDone,
}: {
  mode: 'request_evidence' | 'assign';
  finding: Finding;
  idBase: string;
  /** The demo's today, YYYY-MM-DD. Due dates start here. */
  today: string;
  /** True when the finding is still Open: sending also confirms it, as one step. */
  confirmFirst: boolean;
  dispatch: Dispatch;
  onDone: () => void;
}) {
  const isRequest = mode === 'request_evidence';
  const suggestion = {
    owner: finding.suggestedOwner as string,
    category: finding.suggestedCategory as string,
    dueDate: addBusinessDays(today, WINDOW_BUSINESS_DAYS),
    text: isRequest ? (finding.missingEvidence ?? '') : '',
  };
  const [owner, setOwner] = useState(suggestion.owner);
  const [category, setCategory] = useState(suggestion.category);
  const [dueDate, setDueDate] = useState(suggestion.dueDate);
  const [text, setText] = useState(suggestion.text);
  const [suggested, setSuggested] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);

  const fill = (next: typeof suggestion, isSuggested: boolean) => {
    setOwner(next.owner);
    setCategory(next.category);
    setDueDate(next.dueDate);
    setText(next.text);
    setSuggested(isSuggested);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = dispatch(
      isRequest
        ? { type: 'request_evidence', findingId: finding.id, whatMissing: text, fromOwner: owner, dueDate }
        : { type: 'assign', findingId: finding.id, owner, category, dueDate, note: text },
      { confirmFirst },
    );
    if (result.ok) return onDone();
    setErrors(result.fieldErrors);
    setAlert(result.message);
  };

  const ownerKey = isRequest ? 'fromOwner' : 'owner';

  return (
    <form onSubmit={submit} noValidate data-testid={`${mode}-form`} className="mt-3 space-y-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{isRequest ? 'Request missing evidence' : 'Assign follow-up'}</h4>
        {suggested ? (
          <button type="button" onClick={() => fill({ owner: '', category: '', dueDate: '', text: '' }, false)} className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-2">
            Clear suggestion
          </button>
        ) : (
          <button type="button" onClick={() => fill(suggestion, true)} className="rounded-lg border border-tint-border bg-tint px-2.5 py-1 text-xs font-semibold text-primary hover:bg-white">
            Use system suggestion: {finding.suggestedOwner}
          </button>
        )}
      </div>
      {suggested ? (
        <p data-testid="suggestion-note" className="rounded-lg border border-tint-border bg-tint px-3 py-2 text-xs text-ink">
          <span className="font-semibold text-primary">Filled in from the system suggestion.</span> Check it and change anything. Nothing is saved until you send it.
        </p>
      ) : null}
      <FormAlert message={alert} />
      {isRequest ? (
        <Field id={`${idBase}-what`} label="What is missing" error={errors.whatMissing}>
          {(props) => <input {...props} type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: posting history for this account" />}
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${idBase}-owner`} label={isRequest ? 'Who to ask' : 'Owner'} error={errors[ownerKey]}>
          {(props) => (
            <select {...props} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Select an owner</option>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </Field>
        {isRequest ? null : (
          <Field id={`${idBase}-category`} label="Reason category" error={errors.category}>
            {(props) => (
              <select {...props} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select a category</option>
                {REASON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field
          id={`${idBase}-due`}
          label="Due date"
          hint={`${formatShortDate(today)} or later. The suggestion is ${WINDOW_BUSINESS_DAYS} business days out.`}
          error={errors.dueDate}
        >
          {(props) => <input {...props} type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
        </Field>
      </div>
      {isRequest ? null : (
        <Field id={`${idBase}-note`} label="Note for the owner" hint="Yours to write. The system does not draft this." error={errors.note}>
          {(props) => <textarea {...props} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What you need them to do or find out" />}
        </Field>
      )}
      {confirmFirst ? (
        <p data-testid="confirm-first-note" className="text-xs text-ink">
          <span className="font-semibold">This also confirms the finding.</span> Both steps are logged in the history.
        </p>
      ) : null}
      <SimulatedNote>No message is sent. The handoff is saved in this demo only.</SimulatedNote>
      <div className="flex gap-2">
        <button type="submit" className={BUTTON_PRIMARY}>
          {isRequest ? (confirmFirst ? 'Confirm and send request' : 'Send request') : confirmFirst ? 'Confirm and assign' : 'Assign'}
        </button>
        <button type="button" onClick={onDone} className={BUTTON_SECONDARY}>
          Cancel
        </button>
      </div>
    </form>
  );
}
