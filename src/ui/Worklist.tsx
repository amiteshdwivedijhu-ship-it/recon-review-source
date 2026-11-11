import { useState } from 'react';
import type { Analysis, CaseAnalysis, CreditCase, Finding } from '../domain/findings';
import { accountLabel, facilityLabel } from '../domain/findings';
import { lastAction } from '../domain/history';
import { formatCents, formatPercent } from '../domain/money';
import { type CaseReview, type CaseReviewState, type ReviewState, STATUS_LABEL, caseReview, nextSteps, openFindingCount } from '../domain/workflow';
import { CASH_PILL, POSTING_PILL, REVIEW_PILL, StatusPill } from './StatusPill';
import { formatActionTime, formatShortDate } from './format';

type Filter = 'all' | 'needs_attention' | 'waiting' | 'resolved';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'waiting', label: 'Waiting on someone' },
  { id: 'resolved', label: 'Findings resolved' },
];
const ORDER: Record<CaseReviewState, number> = { needs_attention: 0, waiting: 1, closed_open_items: 2, complete: 3 };
const bucket = (state: CaseReviewState): Filter => (state === 'needs_attention' || state === 'waiting' ? state : 'resolved');

function Tile({ label, value, note, tag, testId }: { label: string; value: string; note: string; tag?: string; testId: string }) {
  return (
    <div data-testid={testId} className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {tag ? <span className="rounded-full border border-tint-border bg-tint px-2 py-0.5 text-[11px] font-semibold text-primary">{tag}</span> : null}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function SummaryStrip({ analysis, review }: { analysis: Analysis; review: ReviewState }) {
  const { totals, metric } = analysis;
  const gap = totals.differenceCents;
  return (
    <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Tile
        testId="tile-received"
        label="Received (remittances)"
        value={formatCents(totals.receivedCents)}
        note={`${totals.paymentCount} payments from ${totals.remittanceRowCount} remittance rows. Split parts are counted once.`}
      />
      <Tile testId="tile-deposited" label="Deposited" value={formatCents(totals.depositedCents)} note={`${totals.depositCount} deposits in the cash tracker.`} />
      <Tile
        testId="tile-difference"
        label="Difference"
        value={gap === 0 ? formatCents(0) : formatCents(Math.abs(gap))}
        note={gap === 0 ? 'Deposits equal remittances.' : `Deposits are ${gap < 0 ? 'less' : 'more'} than remittances. See the variance below.`}
      />
      <Tile testId="tile-open" label="Open findings" value={String(openFindingCount(review))} note="Findings not yet resolved or dismissed." />
      <Tile
        testId="tile-north-star"
        label="Verified in window"
        tag="Demo calculation"
        value={`${formatCents(metric.verifiedCents)} of ${formatCents(metric.receivedCents)} (${formatPercent(metric.verifiedCents, metric.receivedCents)})`}
        note={`Cash matched and posting proven within ${metric.windowBusinessDays} business days of deposit.`}
      />
    </section>
  );
}

function DataChecks({ analysis }: { analysis: Analysis }) {
  const passed = analysis.checks.filter((c) => c.passed).length;
  const allPassed = passed === analysis.checks.length;
  return (
    <details data-testid="data-checks" open={!allPassed} className="rounded-lg border border-line bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        <span className="mr-2 inline-block align-middle">
          <StatusPill tone={allPassed ? 'ok' : 'bad'}>
            Data checks: {passed} of {analysis.checks.length} passed
          </StatusPill>
        </span>
        <span className="text-xs font-normal text-muted">Run on load, before any matching. Select to see each check.</span>
      </summary>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {analysis.checks.map((check) => (
          <li key={check.id} className="text-sm">
            <span className={`mr-2 font-semibold ${check.passed ? 'text-ok-fg' : 'text-bad-fg'}`}>{check.passed ? 'Pass' : 'Fail'}</span>
            {check.label}
            {check.issues.map((issue) => (
              <span key={issue.message} className="block pl-10 text-xs text-bad-fg">
                {issue.message}
              </span>
            ))}
          </li>
        ))}
      </ul>
      {analysis.generalDataIssues.length > 0 ? (
        <p className="mt-2 text-xs text-muted">Issues that name no live case are listed here only. Issues tied to a case also show as findings on that case.</p>
      ) : null}
    </details>
  );
}

/**
 * Dollars still in question on a case. Two findings on one account are about the same dollars,
 * so each account counts once, at its largest open finding. Never more than the payment.
 */
function atIssueCents(c: CaseAnalysis, open: Finding[]): number {
  const byScope = new Map<string, number>();
  for (const f of open) {
    const scope = f.accountId ?? 'whole payment';
    byScope.set(scope, Math.max(byScope.get(scope) ?? 0, f.amountCents));
  }
  const total = [...byScope.values()].reduce((sum, v) => sum + v, 0);
  return Math.min(total, c.payment.totalCents);
}

const openFindings = (c: CaseAnalysis, review: ReviewState): Finding[] =>
  c.findings.filter((f) => {
    const r = review.findings[f.id];
    return r && r.status !== 'resolved' && r.status !== 'dismissed';
  });

/**
 * The top of the page: what the reviewer has to do now, one line and one button per case.
 * Everything below it is supporting detail.
 */
function ActionQueue({ cases, review }: { cases: { c: CaseAnalysis; roll: CaseReview }[]; review: ReviewState }) {
  const mine = cases.filter((row) => row.roll.state === 'needs_attention');
  const waiting = cases.filter((row) => row.roll.state === 'waiting').length;
  const total = mine.reduce((sum, row) => sum + atIssueCents(row.c, openFindings(row.c, review)), 0);
  return (
    <section aria-labelledby="queue-heading" data-testid="action-queue" className="overflow-hidden rounded-2xl border border-ink bg-white shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 pb-3 pt-4">
        <h2 id="queue-heading" className="text-lg font-semibold tracking-tight">
          {mine.length === 0 ? 'Nothing needs you right now' : `${mine.length} ${mine.length === 1 ? 'case needs' : 'cases need'} you`}
        </h2>
        <p className="text-sm text-muted">
          {mine.length > 0 ? `${formatCents(total)} at issue. ` : ''}
          {waiting === 0 ? 'Nothing is waiting on someone else.' : `${waiting} ${waiting === 1 ? 'case is' : 'cases are'} waiting on someone else.`}
        </p>
      </div>
      {mine.length > 0 ? (
        <ol className="divide-y divide-line border-t border-line">
          {mine.map(({ c }) => {
            const steps = nextSteps(c, review)
              .filter((step) => step.who === 'You')
              .map((step) => step.what);
            const todo = steps.map((what, index) => (index === 0 ? what : what.charAt(0).toLowerCase() + what.slice(1))).join(', then ');
            return (
              <li key={c.caseId} data-testid={`queue-${c.caseId}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="font-semibold">
                    Case {c.caseId}: {todo}
                  </p>
                  <p className="text-xs text-muted">{c.summary}</p>
                </div>
                <p className="whitespace-nowrap text-right tabular-nums">
                  <span className="font-semibold">{formatCents(atIssueCents(c, openFindings(c, review)))}</span>
                  <span className="block text-xs text-muted">at issue</span>
                </p>
                <a href={`#/case/${c.caseId}`} className="whitespace-nowrap rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
                  Review Case {c.caseId}
                </a>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

/** One line per account, at a fixed height, so the account, cash, and posting columns line up. */
const LINE = 'flex h-10 items-center';

function CaseRow({ analysis, c, review, onOpen }: { analysis: Analysis; c: CaseAnalysis; review: ReviewState; onOpen: (caseId: string) => void }) {
  const roll = caseReview(c, review);
  const steps = nextSteps(c, review);
  const last = lastAction(review.history, c.caseId);
  const active = c.findings.flatMap((f) => {
    const r = review.findings[f.id];
    return r && r.status !== 'resolved' && r.status !== 'dismissed' ? [{ finding: f, status: r.status }] : [];
  });
  const decision = review.postingDecisions[c.caseId];
  const atIssue = atIssueCents(c, active.map((a) => a.finding));
  return (
    <tr
      data-testid={`row-${c.caseId}`}
      onClick={() => onOpen(c.caseId)}
      className="cursor-pointer border-b border-line align-top hover:bg-tint"
    >
      <td className="px-4 py-3">
        <a
          href={`#/case/${c.caseId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-primary underline-offset-2 hover:underline"
          aria-label={`Open case ${c.caseId}, ${c.paymentReference}`}
        >
          Case {c.caseId}
        </a>
        <div className="whitespace-nowrap tabular-nums">{c.paymentReference}</div>
        <div className="whitespace-nowrap text-xs text-muted">{c.payer ? c.payer.payer_name : c.payment.payerId}</div>
        <div className="mt-1 max-w-[11rem] text-xs text-muted">{c.title}</div>
      </td>
      <td className="px-2.5 py-3">
        {c.cash.accounts.map((a) => (
          <div key={a.accountId} className={LINE}>
            <span className="whitespace-nowrap leading-tight">
              {accountLabel(analysis.accounts, a.accountId)}
              <span className="block text-xs text-muted">{facilityLabel(analysis.accounts, a.facilityId)}</span>
            </span>
          </div>
        ))}
      </td>
      <td className="px-2.5 py-3" data-testid="cell-cash">
        {c.cash.accounts.map((a) => (
          <div key={a.accountId} className={LINE}>
            <StatusPill tone={CASH_PILL[a.status].tone}>
              {a.status === 'variance' && a.differenceCents !== null ? (
                <>
                  {/* Below 1280 pixels the column header already says Cash, so the pill keeps only the amount on screen. */}
                  <span className="max-xl:sr-only">Variance: </span>
                  <span className="inline-block max-xl:first-letter:uppercase">
                    {a.differenceCents < 0 ? 'short' : 'over'} {formatCents(Math.abs(a.differenceCents))}
                  </span>
                </>
              ) : (
                CASH_PILL[a.status].label
              )}
            </StatusPill>
          </div>
        ))}
      </td>
      <td className="px-2.5 py-3" data-testid="cell-posting">
        {c.postings.map((p) => (
          <div key={p.accountId} className={LINE}>
            <StatusPill tone={POSTING_PILL[p.status].tone}>{POSTING_PILL[p.status].label}</StatusPill>
          </div>
        ))}
        {decision ? (
          <div className={LINE}>
            <StatusPill tone="decision" title="Reviewer decision, not a system finding">
              Your call: {decision.choice === 'hold' ? 'Hold' : 'Proceed per remittance'}
            </StatusPill>
          </div>
        ) : null}
      </td>
      <td className="px-2.5 py-3" data-testid="cell-attention">
        <StatusPill tone={REVIEW_PILL[roll.state]}>{roll.label}</StatusPill>
        <ul className="mt-1.5 space-y-0.5">
          {active.map(({ finding, status }) => (
            <li key={finding.id} className="font-medium">
              {finding.title}
              <span className="block text-xs font-normal text-muted">{formatCents(finding.amountCents)} at issue · {STATUS_LABEL[status]}</span>
            </li>
          ))}
          {c.postingDecision && !decision ? <li className="font-medium">Posting decision needed</li> : null}
          {active.length === 0 && roll.openItems.length > 0 ? <li className="text-muted">Still open in the records: {roll.openItems.join('. ')}.</li> : null}
        </ul>
        <p className="mt-1 text-xs text-muted">
          <span className="font-semibold">Why:</span> {c.summary}
        </p>
      </td>
      <td className="whitespace-nowrap px-2.5 py-3 text-right tabular-nums" data-testid="cell-amount">
        {atIssue > 0 ? <span className="font-semibold">{formatCents(atIssue)}</span> : <span className="font-medium text-muted">None open</span>}
        <span className="block text-xs text-muted">of {formatCents(c.payment.totalCents)} paid</span>
      </td>
      <td className="px-2.5 py-3" data-testid="cell-owner">
        {steps.length === 0 ? <span className="text-muted">No one. Nothing is assigned.</span> : null}
        {steps.map((step, index) => (
          <div key={index} className="mb-1 last:mb-0">
            <span className="font-medium">{step.who}</span>
            <span className="text-muted">: {step.what}</span>
            {step.due ? <span className="block text-xs text-muted">Due {formatShortDate(step.due)}</span> : null}
            {step.suggested.length > 0 ? <span className="block text-xs text-muted">Suggested owner: {step.suggested.join(', ')}</span> : null}
          </div>
        ))}
        <div data-testid="cell-last-action" className="mt-2 border-t border-line pt-1.5 text-xs text-muted">
          {last ? (
            <>
              Last: <span className="font-medium text-ink">{last.action}</span>
              <span className="block">{formatActionTime(last.at)}</span>
            </>
          ) : (
            'No action yet'
          )}
        </div>
      </td>
    </tr>
  );
}

function CreditRow({ analysis, credit }: { analysis: Analysis; credit: CreditCase }) {
  return (
    <tr data-testid={`row-${credit.caseId}`} className="border-b border-line bg-surface-2 align-top text-muted last:border-0">
      <td className="px-4 py-3">
        <span className="font-semibold text-ink">Case {credit.caseId}</span>
        <div className="whitespace-nowrap tabular-nums">{credit.creditId}</div>
        <div className="whitespace-nowrap text-xs">{credit.payer ? credit.payer.payer_name : 'Unknown payer'}</div>
        <div className="mt-1 max-w-[11rem] text-xs">{credit.title}</div>
      </td>
      <td className="px-2.5 py-3">
        <div className={LINE}>
          <span className="whitespace-nowrap leading-tight">
            {accountLabel(analysis.accounts, credit.accountId)}
            <span className="block text-xs">{facilityLabel(analysis.accounts, credit.facilityId)}</span>
          </span>
        </div>
      </td>
      <td className="px-2.5 py-3 text-xs" colSpan={2}>
        <div className={LINE}>No payment reference. Not reconciled here.</div>
      </td>
      <td className="px-2.5 py-3">
        <StatusPill tone="neutral">Read only</StatusPill>
        <span className="ml-2 inline-block whitespace-nowrap text-xs">Covered in spec</span>
        <p className="mt-1.5 font-medium text-ink">{credit.status}</p>
        <p className="mt-1 text-xs">
          <span className="font-semibold">Why:</span> Credit on claim {credit.claimId}, found {formatShortDate(credit.detectedDate)}. Unknown: {credit.unknown.join(', ').toLowerCase()}. A credit alone does not show a refund is owed.
        </p>
      </td>
      <td className="whitespace-nowrap px-2.5 py-3 text-right font-semibold tabular-nums text-ink">
        {formatCents(credit.balanceCents)}
        <span className="block text-xs font-normal text-muted">credit balance</span>
      </td>
      <td className="px-2.5 py-3">
        <span className="font-medium text-ink">{credit.owner}</span>
        <span className="block text-xs">Per the spec. Not assigned or worked in this prototype.</span>
      </td>
    </tr>
  );
}

export function Worklist({ analysis, review, onOpen }: { analysis: Analysis; review: ReviewState; onOpen: (caseId: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = analysis.cases
    .map((c) => ({ c, roll: caseReview(c, review) }))
    .sort((a, b) => ORDER[a.roll.state] - ORDER[b.roll.state] || a.c.caseId.localeCompare(b.c.caseId));
  const counts: Record<Filter, number> = { all: rows.length + analysis.credits.length, needs_attention: 0, waiting: 0, resolved: 0 };
  for (const row of rows) counts[bucket(row.roll.state)] += 1;
  const visible = rows.filter((row) => filter === 'all' || bucket(row.roll.state) === filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          Worklist
        </h1>
        <p className="mt-1 text-muted">Your next steps come first. The totals and every case are below.</p>
      </div>
      <ActionQueue cases={rows} review={review} />
      <SummaryStrip analysis={analysis} review={review} />
      <DataChecks analysis={analysis} />

      <section aria-labelledby="cases-heading" className="rounded-2xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" role="group" aria-label="Filter cases">
          <h2 id="cases-heading" className="mr-2 text-base font-semibold">
            All cases
          </h2>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === f.id ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink hover:bg-surface-2'}`}
            >
              {f.label} <span className="tabular-nums opacity-80">({counts[f.id]})</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table data-testid="worklist" className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Case, reference, payer</th>
                <th scope="col" className="px-2.5 py-2 font-medium">Account · Facility</th>
                <th scope="col" className="px-2.5 py-2 font-medium">Cash</th>
                <th scope="col" className="px-2.5 py-2 font-medium">Posting</th>
                <th scope="col" className="w-[30%] px-2.5 py-2 font-medium">What needs attention, and why</th>
                <th scope="col" className="px-2.5 py-2 text-right font-medium">At issue</th>
                <th scope="col" className="w-[19%] px-2.5 py-2 pr-4 font-medium">Next step owner, last action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ c }) => (
                <CaseRow key={c.caseId} analysis={analysis} c={c} review={review} onOpen={onOpen} />
              ))}
              {filter === 'all' ? analysis.credits.map((credit) => <CreditRow key={credit.creditId} analysis={analysis} credit={credit} />) : null}
              {visible.length === 0 && filter !== 'all' ? (
                <tr>
                  <td colSpan={7} data-testid="worklist-empty" className="px-4 py-10 text-center text-muted">
                    No cases here right now. Choose All to see every case.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
