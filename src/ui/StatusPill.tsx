import type { ReactNode } from 'react';
import type { CashStatus } from '../domain/cash';
import type { PostingStatus } from '../domain/posting';
import type { CaseReviewState, FindingStatus } from '../domain/workflow';
import { STATUS_LABEL } from '../domain/workflow';

export type Tone = 'ok' | 'warn' | 'bad' | 'unknown' | 'info' | 'neutral' | 'decision';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'border-ok-line bg-ok-bg text-ok-fg',
  warn: 'border-warn-line bg-warn-bg text-warn-fg',
  bad: 'border-bad-line bg-bad-bg text-bad-fg',
  unknown: 'border-dashed border-unknown-line bg-unknown-bg text-unknown-fg',
  info: 'border-tint-border bg-tint text-primary',
  neutral: 'border-line bg-surface-2 text-muted',
  decision: 'border-ink bg-white text-ink',
};

/** Each tone has its own mark, so status never depends on color alone. */
const TONE_MARK: Record<Tone, string> = { ok: '✓', warn: '!', bad: '×', unknown: '?', info: 'i', neutral: '•', decision: '✎' };

export function StatusPill({ tone, children, title, wrap = false }: { tone: Tone; children: ReactNode; title?: string; wrap?: boolean }) {
  return (
    <span
      title={title}
      data-tone={tone}
      className={`inline-flex max-w-full items-center gap-1.5 border px-2.5 py-0.5 text-xs font-medium leading-5 ${wrap ? 'rounded-xl' : 'whitespace-nowrap rounded-full'} ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden="true" className="inline-block w-2.5 text-center text-[11px] font-bold leading-none">
        {TONE_MARK[tone]}
      </span>
      <span className={wrap ? '' : 'truncate'}>{children}</span>
    </span>
  );
}

export const CASH_PILL: Record<CashStatus, { tone: Tone; label: string }> = {
  matched: { tone: 'ok', label: 'Matched' },
  variance: { tone: 'bad', label: 'Variance' },
  unknown: { tone: 'unknown', label: 'Unknown' },
};

export const POSTING_PILL: Record<PostingStatus, { tone: Tone; label: string }> = {
  verified_posted: { tone: 'ok', label: 'Verified posted' },
  not_posted_confirmed: { tone: 'warn', label: 'Not posted (confirmed)' },
  amount_mismatch: { tone: 'bad', label: 'Posted amount differs' },
  unknown: { tone: 'unknown', label: 'Unknown' },
};

export const REVIEW_PILL: Record<CaseReviewState, Tone> = {
  needs_attention: 'warn',
  waiting: 'info',
  closed_open_items: 'neutral',
  complete: 'ok',
};

const FINDING_TONE: Record<FindingStatus, Tone> = {
  open: 'warn',
  confirmed: 'decision',
  challenged: 'decision',
  dismissed: 'neutral',
  evidence_requested: 'info',
  assigned: 'info',
  resolved: 'neutral',
};

export function FindingStatusPill({ status }: { status: FindingStatus }) {
  return <StatusPill tone={FINDING_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>;
}

/** Unknown is a first class value: dashed, labeled, and never blank. */
export function UnknownValue({ note }: { note?: string }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span data-unknown="true" className="rounded border border-dashed border-unknown-line bg-unknown-bg px-1.5 py-0.5 text-xs font-medium text-unknown-fg">
        Unknown
      </span>
      {note ? <span className="text-xs text-muted">{note}</span> : null}
    </span>
  );
}
