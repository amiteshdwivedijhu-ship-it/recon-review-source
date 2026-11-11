import type { CaseAnalysis } from './findings';
import { formatCents } from './money';
import type { Dataset } from './types';

/**
 * View model for the evidence table. Source cells hold facts copied from the records.
 * The difference cell is the only calculated value in a row.
 */
export interface SourceCell {
  /** value = a fact. unknown = null in the data. na = this source has no such field. */
  kind: 'value' | 'unknown' | 'na';
  text: string;
  note?: string;
}

export interface DifferenceCell {
  tone: 'ok' | 'warn' | 'bad' | 'unknown' | 'none';
  text: string;
}

export interface EvidenceRow {
  field: string;
  remittance: SourceCell;
  deposit: SourceCell;
  ledger: SourceCell;
  difference: DifferenceCell;
}

const value = (text: string, note?: string): SourceCell => ({ kind: 'value', text, ...(note ? { note } : {}) });
const unknown = (note: string): SourceCell => ({ kind: 'unknown', text: 'Unknown', note });
const NA: SourceCell = { kind: 'na', text: 'Not in this source' };
const NO_COMPARISON: DifferenceCell = { tone: 'none', text: 'No comparison' };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatTimestamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function sameOrConflict(values: (string | null)[]): DifferenceCell {
  const known = values.filter((v): v is string => v !== null);
  if (known.length < 2) return NO_COMPARISON;
  return new Set(known).size === 1 ? { tone: 'ok', text: 'Match' } : { tone: 'bad', text: 'Does not match' };
}

function amountDifference(remitCents: number, depositCents: number | null, expectedCents: number | null): DifferenceCell {
  if (depositCents === null) return { tone: 'unknown', text: 'Deposit unknown' };
  if (depositCents !== remitCents) {
    const diff = depositCents - remitCents;
    return { tone: 'bad', text: `Deposit ${diff < 0 ? 'short' : 'over'} by ${formatCents(Math.abs(diff))}` };
  }
  if (expectedCents === null) return { tone: 'unknown', text: 'Ledger amount unknown' };
  if (expectedCents !== remitCents) return { tone: 'bad', text: `Ledger differs by ${formatCents(Math.abs(expectedCents - remitCents))}` };
  return { tone: 'ok', text: 'Match' };
}

function gapText(c: CaseAnalysis): DifferenceCell {
  const days = c.cash.gapCalendarDays;
  if (days === null) return { tone: 'unknown', text: 'Deposit date unknown' };
  const text = days === 0 ? 'Deposit on the remittance date' : `Deposit ${plural(Math.abs(days), 'day')} ${days > 0 ? 'after' : 'before'} remittance`;
  return { tone: c.cash.gapWithinWindow ? 'ok' : 'warn', text };
}

/** Whole-payment comparison. For a split payment this is where the parent is counted, once. */
export function buildPaymentEvidence(ds: Dataset, c: CaseAnalysis): EvidenceRow[] {
  const { payment, cash } = c;
  const ledgerRows = c.postings.flatMap((p) => p.ledger ?? []);
  const allLedger = ledgerRows.length === c.postings.length;
  const expectedTotal = allLedger ? ledgerRows.reduce((total, l) => total + l.expected_amount_cents, 0) : null;
  const deposit = cash.depositCents === null ? unknown('No deposit found') : null;
  const payerName = c.payer ? `${payment.payerId} ${c.payer.payer_name}` : payment.payerId;
  const ledgerPayers = [...new Set(ledgerRows.map((l) => l.payer_id))];

  const rows: EvidenceRow[] = [
    {
      field: 'Record',
      remittance: value(payment.remitRecordId, payment.isSplit ? 'Parent payment' : 'Single payment'),
      deposit: deposit ?? value(cash.depositIds.join(', ')),
      ledger: ledgerRows.length > 0 ? value(ledgerRows.map((l) => l.record_id).join(', ')) : unknown('No ledger row found'),
      difference: NO_COMPARISON,
    },
    {
      field: 'Amount',
      remittance: value(formatCents(payment.totalCents), payment.isSplit ? 'Parent payment, counted once' : undefined),
      deposit: deposit ?? value(formatCents(cash.depositCents ?? 0)),
      ledger:
        expectedTotal === null
          ? unknown('Ledger row missing')
          : value(formatCents(expectedTotal), ledgerRows.length > 1 ? `Sum of ${ledgerRows.length} ledger rows` : 'Expected'),
      difference: amountDifference(payment.totalCents, cash.depositCents, expectedTotal),
    },
  ];
  if (payment.isSplit) {
    const depositParts = ds.cash_tracker.deposits.filter((d) => d.payment_reference === payment.paymentReference).flatMap((d) => d.allocations);
    rows.push({
      field: 'Split',
      remittance: value(payment.allocations.map((a) => formatCents(a.amountCents)).join(' + '), payment.allocations.map((a) => a.recordId).join(', ')),
      deposit: deposit ?? value(depositParts.map((a) => formatCents(a.amount_cents)).join(' + '), 'Deposit allocations'),
      ledger: ledgerRows.length > 0 ? value(ledgerRows.map((l) => formatCents(l.expected_amount_cents)).join(' + '), 'Expected per account') : unknown('No ledger row found'),
      difference: payment.splitSumsToParent
        ? { tone: 'ok', text: `Adds up to ${formatCents(payment.totalCents)}` }
        : { tone: 'bad', text: `Adds up to ${formatCents(payment.allocationSumCents)}, not ${formatCents(payment.totalCents)}` },
    });
  }
  rows.push(
    {
      field: 'Date',
      remittance: value(payment.paymentDate, 'Payment date'),
      deposit: cash.depositDate === null ? unknown('No deposit found') : value(cash.depositDate, 'Deposit date'),
      ledger: NA,
      difference: gapText(c),
    },
    {
      field: 'Payer',
      remittance: value(payerName),
      deposit: NA,
      ledger: ledgerPayers.length > 0 ? value(ledgerPayers.join(', ')) : unknown('No ledger row found'),
      difference: ledgerPayers.length === 0 ? NO_COMPARISON : sameOrConflict([payment.payerId, ...ledgerPayers]),
    },
  );
  return rows;
}

/** Side by side evidence for one account and facility. */
export function buildAccountEvidence(ds: Dataset, c: CaseAnalysis, index: number): EvidenceRow[] {
  const account = c.cash.accounts[index];
  const posting = c.postings[index];
  if (!account || !posting) return [];
  const { payment, cash } = c;
  const ledger = posting.ledger;
  const noLedger = unknown('No ledger row found');
  const noDeposit = unknown(cash.depositCents === null ? 'No deposit found' : 'No allocation for this account');
  const hasDeposit = account.depositCents !== null;
  const depositAllocation = ds.cash_tracker.deposits
    .filter((d) => d.payment_reference === payment.paymentReference)
    .flatMap((d) => d.allocations)
    .find((a) => a.account_id === account.accountId && a.facility_id === account.facilityId);
  const payerName = c.payer ? `${payment.payerId} ${c.payer.payer_name}` : payment.payerId;
  const firstTxn = posting.transactions[0];

  let transactionCell: SourceCell;
  let transactionDiff: DifferenceCell;
  if (posting.transactions.length > 0) {
    transactionCell = value(
      posting.transactions.map((t) => t.transaction_id).join(', '),
      posting.transactions.map((t) => `Saved, ${formatCents(t.amount_cents)}, by ${t.posted_by}, ${formatTimestamp(t.posted_at)}`).join('; '),
    );
    transactionDiff =
      posting.status === 'verified_posted'
        ? { tone: 'ok', text: 'Proves posting for this account' }
        : { tone: 'bad', text: `Posted ${formatCents(posting.provenCents ?? 0)}, not ${formatCents(posting.remitCents)}` };
  } else if (posting.status === 'not_posted_confirmed') {
    transactionCell = value('None', 'History complete');
    transactionDiff = { tone: 'warn', text: 'Confirmed not posted' };
  } else {
    transactionCell = unknown(ledger === null ? 'No ledger row found' : ledger.posting_transaction_ids === null ? 'History unavailable' : posting.unknownReasons.join('. '));
    transactionDiff = { tone: 'unknown', text: 'Cannot verify posting' };
  }

  let postedAmountDiff: DifferenceCell;
  if (posting.postedAmountCents === null) postedAmountDiff = { tone: 'unknown', text: 'Cannot compare' };
  else if (posting.provenCents === null) postedAmountDiff = { tone: 'unknown', text: 'No transaction to compare' };
  else if (posting.postedAmountCents === posting.provenCents) postedAmountDiff = { tone: 'ok', text: 'Agrees with transactions' };
  else postedAmountDiff = { tone: 'bad', text: 'Differs from transactions' };

  return [
    {
      field: 'Record',
      remittance: value(account.remitRecordId, payment.isSplit ? `Allocation of ${payment.remitRecordId}` : 'Single payment'),
      deposit: hasDeposit ? value(cash.depositIds.join(', '), payment.isSplit ? 'Allocation for this account' : undefined) : noDeposit,
      ledger: ledger ? value(ledger.record_id) : noLedger,
      difference: NO_COMPARISON,
    },
    {
      field: 'Amount',
      remittance: value(formatCents(account.remitCents)),
      deposit: account.depositCents === null ? noDeposit : value(formatCents(account.depositCents)),
      ledger: account.expectedCents === null ? noLedger : value(formatCents(account.expectedCents), 'Expected'),
      difference: amountDifference(account.remitCents, account.depositCents, account.expectedCents),
    },
    {
      field: 'Date',
      remittance: value(payment.paymentDate, 'Payment date'),
      deposit: cash.depositDate === null ? noDeposit : value(cash.depositDate, 'Deposit date'),
      ledger: firstTxn
        ? value(formatTimestamp(firstTxn.posted_at), 'Posted at')
        : posting.status === 'not_posted_confirmed'
          ? value('Not posted', 'No posting date')
          : unknown('No posting date supplied'),
      difference: gapText(c),
    },
    {
      field: 'Account',
      remittance: account.accountId === null ? unknown('Not supplied') : value(account.accountId),
      deposit: depositAllocation ? value(depositAllocation.account_id) : noDeposit,
      ledger: ledger ? value(ledger.account_id) : noLedger,
      difference: sameOrConflict([account.accountId, depositAllocation?.account_id ?? null, ledger?.account_id ?? null]),
    },
    {
      field: 'Facility',
      remittance: account.facilityId === null ? unknown('Not supplied') : value(account.facilityId),
      deposit: depositAllocation ? value(depositAllocation.facility_id) : noDeposit,
      ledger: ledger ? value(ledger.facility_id) : noLedger,
      difference: sameOrConflict([account.facilityId, depositAllocation?.facility_id ?? null, ledger?.facility_id ?? null]),
    },
    {
      field: 'Payer',
      remittance: value(payerName),
      deposit: NA,
      ledger: ledger ? value(ledger.payer_id) : noLedger,
      difference: sameOrConflict([payment.payerId, ledger?.payer_id ?? null]),
    },
    {
      field: 'Status',
      remittance: NA,
      deposit: NA,
      ledger: ledger ? value(`Detail: ${ledger.posting_status}`, `Summary label: ${ledger.summary_status} (label only, not proof)`) : noLedger,
      difference:
        posting.conflicts.length > 0
          ? { tone: 'warn', text: posting.conflicts.every((x) => x.kind === 'summary_label') ? 'Label conflicts with transaction' : 'Status conflicts with transaction' }
          : posting.status === 'unknown'
            ? { tone: 'unknown', text: 'Nothing to check the label against' }
            : { tone: 'ok', text: 'Agrees with transactions' },
    },
    {
      field: 'Posted amount',
      remittance: NA,
      deposit: NA,
      ledger:
        ledger === null
          ? noLedger
          : posting.postedAmountCents === null
            ? unknown('Not supplied')
            : value(formatCents(posting.postedAmountCents), posting.postedAmountCents === 0 ? 'Known zero' : 'Reported by ledger'),
      difference: postedAmountDiff,
    },
    { field: 'Transaction', remittance: NA, deposit: NA, ledger: transactionCell, difference: transactionDiff },
    {
      field: 'Claim review',
      remittance: NA,
      deposit: NA,
      ledger: ledger === null ? noLedger : posting.claimReviewStatus === null ? unknown('Not supplied') : value(posting.claimReviewStatus),
      difference:
        posting.status === 'verified_posted'
          ? NO_COMPARISON
          : posting.claimReviewStatus === null
            ? { tone: 'unknown', text: 'Ready to post not established' }
            : { tone: 'none', text: 'Supplied. Readiness is a human call' },
    },
  ];
}
