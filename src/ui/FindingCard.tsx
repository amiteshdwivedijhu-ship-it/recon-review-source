import type { Finding } from '../domain/findings';
import { formatCents } from '../domain/money';

const TRACK_LABEL = { cash: 'Cash reconciliation', posting: 'Posting', data: 'Data quality' } as const;

/** What the system calculated. Read only: the reviewer acts in the panel beside it. */
export function FindingCard({ finding, headingId }: { finding: Finding; headingId: string }) {
  return (
    <article aria-labelledby={headingId} className="h-full rounded-lg border border-tint-border bg-tint p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 id={headingId} className="text-base font-semibold text-ink">
          {finding.title}
        </h3>
        <span className="whitespace-nowrap text-right text-base font-semibold tabular-nums">
          {formatCents(finding.amountCents)}
          <span className="block text-xs font-medium text-muted">at issue</span>
        </span>
      </div>
      <p className="text-xs font-medium text-primary">System finding · {TRACK_LABEL[finding.track]}</p>
      <p className="mt-2 text-sm text-ink">{finding.why}</p>
      <dl className="mt-3 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-xs font-medium text-muted">Rule</dt>
        <dd>{finding.rule}</dd>
        <dt className="text-xs font-medium text-muted">Evidence</dt>
        <dd className="flex flex-wrap gap-1.5">
          {finding.evidenceIds.length === 0 ? (
            <span className="text-muted">No record ids</span>
          ) : (
            finding.evidenceIds.map((id) => (
              <span key={id} className="rounded border border-tint-border bg-white px-1.5 py-0.5 text-xs font-medium tabular-nums">
                {id}
              </span>
            ))
          )}
        </dd>
        <dt className="text-xs font-medium text-muted">Suggested next step</dt>
        <dd>{finding.nextStep}</dd>
        <dt className="text-xs font-medium text-muted">Suggested owner</dt>
        <dd>{finding.suggestedOwner}</dd>
      </dl>
    </article>
  );
}
