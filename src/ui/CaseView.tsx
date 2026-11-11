import { buildAccountEvidence, buildPaymentEvidence } from '../domain/evidence';
import type { Analysis, CaseAnalysis } from '../domain/findings';
import { facilityLabel } from '../domain/findings';
import { historyForCase } from '../domain/history';
import { formatCents } from '../domain/money';
import type { Dataset } from '../domain/types';
import { type Dispatch, POSTING_CHOICE_LABEL, type ReviewState, caseReview, nextSteps } from '../domain/workflow';
import { ActionPanel } from './ActionPanel';
import { DecisionHistory } from './DecisionHistory';
import { EvidenceTable } from './EvidenceTable';
import { FindingCard } from './FindingCard';
import { PostingDecisionPanel, PostingDecisionPrompt } from './PostingDecisionPanel';
import { CASH_PILL, POSTING_PILL, REVIEW_PILL, StatusPill } from './StatusPill';
import { demoToday, formatDataDate, formatShortDate } from './format';

const slug = (id: string) => id.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

function ZoneHeader({ id, title, note, tone }: { id: string; title: string; note: string; tone: 'source' | 'system' | 'reviewer' }) {
  const bar = { source: 'bg-muted', system: 'bg-primary', reviewer: 'bg-ink' }[tone];
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={`mt-1 h-9 w-1 rounded-full ${bar}`} />
      <div>
        <h2 id={id} className={`text-base font-semibold ${tone === 'system' ? 'text-primary' : 'text-ink'}`}>
          {title}
        </h2>
        <p className="text-xs text-muted">{note}</p>
      </div>
    </div>
  );
}

export function CaseView({
  ds,
  analysis,
  c,
  review,
  dispatch,
}: {
  ds: Dataset;
  analysis: Analysis;
  c: CaseAnalysis;
  review: ReviewState;
  dispatch: Dispatch;
}) {
  const roll = caseReview(c, review);
  const decision = review.postingDecisions[c.caseId];
  const history = historyForCase(review.history, c.caseId);
  const today = demoToday(analysis.snapshotAt);
  const steps = nextSteps(c, review);
  const mine = steps.filter((step) => step.who === 'You');
  const others = steps.filter((step) => step.who !== 'You');

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb">
        <a href="#/" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          Back to worklist
        </a>
      </nav>

      <header className="rounded-2xl border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
              {c.title}
            </h1>
            <p className="mt-0.5 text-xs font-medium text-muted">
              Case {c.caseId} · {c.paymentReference} · {c.payer ? c.payer.payer_name : c.payment.payerId} · Paid {formatDataDate(c.payment.paymentDate)}
            </p>
          </div>
          <span data-testid="case-review">
            <StatusPill tone={REVIEW_PILL[roll.state]}>{roll.label}</StatusPill>
          </span>
        </div>
        <p data-testid="case-summary" className="mt-3 text-lg font-medium">
          {c.summary}
        </p>
        {roll.state === 'closed_open_items' ? (
          <p data-testid="case-open-items" className="mt-1 text-sm text-warn-fg">
            Your findings are closed, but the records still show: {roll.openItems.join('. ')}. This case is not complete.
          </p>
        ) : null}

        <div data-testid="next-step" className="mt-4 rounded-lg border border-tint-border bg-tint px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{mine.length > 0 ? 'What you need to do' : others.length > 0 ? 'Nothing for you right now' : 'No step is owed on this case'}</h2>
          <ul className="mt-1 space-y-0.5 text-sm">
            {mine.map((step, index) => (
              <li key={index} className="font-medium">
                {step.what}
                {step.suggested.length > 0 ? <span className="font-normal text-muted"> · suggested owner: {step.suggested.join(', ')}</span> : null}
              </li>
            ))}
            {others.map((step, index) => (
              <li key={index} className="text-muted">
                Waiting on {step.who}: {step.what.charAt(0).toLowerCase() + step.what.slice(1)}
                {step.due ? `, due ${formatShortDate(step.due)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <section aria-label="Findings and decisions" className="rounded-2xl border border-line bg-white p-5">
        <div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
          <div data-testid="zone-system">
            <ZoneHeader id="zone-system" tone="system" title="System findings" note="Calculated from the records. Each one names the rule it came from." />
          </div>
          <div data-testid="zone-decisions" className="hidden lg:block">
            <ZoneHeader id="zone-decisions" tone="reviewer" title="Your decisions" note="What you record as Demo reviewer. The system never fills these in." />
          </div>
          {c.findings.length === 0 && !c.postingDecision ? <p className="text-sm text-muted lg:col-span-2">No findings. Cash is matched and posting is proven for every account.</p> : null}
          {c.findings.map((finding) => {
            const reviewOf = review.findings[finding.id];
            if (!reviewOf) return null;
            const headingId = `finding-${slug(finding.id)}`;
            return (
              <div key={finding.id} data-testid={`finding-${finding.id}`} className="contents">
                <FindingCard finding={finding} headingId={headingId} />
                <ActionPanel finding={finding} review={reviewOf} dispatch={dispatch} idBase={slug(finding.id)} labelledBy={headingId} today={today} />
              </div>
            );
          })}
          {c.postingDecision ? (
            <div className="contents">
              <PostingDecisionPrompt prompt={c.postingDecision} />
              <PostingDecisionPanel caseId={c.caseId} decision={decision} dispatch={dispatch} />
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="status-heading" className="rounded-2xl border border-line bg-white p-5">
        <h2 id="status-heading" className="text-base font-semibold">
          Status by account
        </h2>
        <p className="text-xs text-muted">Calculated from the records. Cash and posting are separate questions, answered per account and facility.</p>
        <div className="mt-2 overflow-x-auto">
          <table data-testid="tracks" className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Cash and posting status for each account</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Account · Facility</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Remitted</th>
                <th scope="col" className="py-2 pr-4 font-medium">Cash reconciliation</th>
                <th scope="col" className="py-2 pr-4 font-medium">Posting</th>
              </tr>
            </thead>
            <tbody>
              {c.cash.accounts.map((account, index) => {
                const posting = c.postings[index]!;
                return (
                  <tr key={account.accountId} data-testid={`track-${account.accountId}`} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2.5 pr-4 font-medium">
                      {c.accountNames[index]} <span className="text-xs font-normal text-muted">· {facilityLabel(analysis.accounts, account.facilityId)} · {account.accountId} / {account.facilityId}</span>
                    </th>
                    <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">{formatCents(account.remitCents)}</td>
                    <td className="py-2.5 pr-4" data-testid="track-cash">
                      <StatusPill tone={CASH_PILL[account.status].tone}>
                        {account.status === 'variance' && account.differenceCents !== null
                          ? `Variance: deposit ${account.differenceCents < 0 ? 'short' : 'over'} by ${formatCents(Math.abs(account.differenceCents))}`
                          : CASH_PILL[account.status].label}
                      </StatusPill>
                    </td>
                    <td className="py-2.5 pr-4" data-testid="track-posting">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={POSTING_PILL[posting.status].tone}>{POSTING_PILL[posting.status].label}</StatusPill>
                        {posting.status === 'verified_posted' ? <span className="text-xs text-muted">by {posting.transactions.map((t) => t.transaction_id).join(', ')}</span> : null}
                        {posting.status === 'unknown' ? <span className="text-xs text-muted">{posting.unknownReasons[0]}</span> : null}
                        {posting.status !== 'verified_posted' && posting.readiness === 'not_established' && posting.status !== 'unknown' ? (
                          <span className="text-xs text-muted">Ready to post: not established</span>
                        ) : null}
                        {decision ? (
                          <StatusPill tone="decision" title="Reviewer decision, not a system finding">
                            Your call: {POSTING_CHOICE_LABEL[decision.choice]}
                          </StatusPill>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {c.info.length > 0 ? (
          <ul data-testid="case-info" className="mt-3 space-y-1 text-xs text-muted">
            {c.info.map((line) => (
              <li key={line}>
                <span className="mr-1.5 font-semibold text-ink">Info</span>
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="zone-source" data-testid="zone-source" className="space-y-3 rounded-2xl border border-line bg-surface-2 p-5">
        <ZoneHeader id="zone-source" tone="source" title="Source facts" note="Straight from the records, with record ids. Only the tinted Difference column is calculated. Rows that agree stay quiet." />
        {c.payment.isSplit ? <EvidenceTable testId="evidence-payment" caption={`Whole payment ${c.paymentReference}`} rows={buildPaymentEvidence(ds, c)} /> : null}
        {c.cash.accounts.map((account, index) => (
          <EvidenceTable
            key={account.accountId}
            testId={`evidence-${account.accountId}`}
            caption={`${c.accountNames[index]} · ${facilityLabel(analysis.accounts, account.facilityId)} (${account.accountId} / ${account.facilityId})`}
            rows={buildAccountEvidence(ds, c, index)}
          />
        ))}
      </section>

      <DecisionHistory entries={history} />
    </div>
  );
}
