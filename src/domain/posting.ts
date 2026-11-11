import type { Payment, PaymentAllocation } from './cash';
import { formatCents } from './money';
import type { Cents, Dataset, LedgerPaymentRecord, PostingTransaction } from './types';

export type PostingStatus = 'verified_posted' | 'not_posted_confirmed' | 'amount_mismatch' | 'unknown';
export type Readiness = 'not_applicable' | 'not_established' | 'review_supplied';

export interface PostingConflict {
  kind: 'summary_label' | 'detail_status' | 'posted_amount';
  message: string;
}

export interface PostingResult {
  paymentReference: string;
  accountId: string | null;
  facilityId: string | null;
  ledgerRecordId: string | null;
  ledger: LedgerPaymentRecord | null;
  status: PostingStatus;
  /** Amount to prove: this account's share of the remittance. */
  remitCents: Cents;
  /** Total of saved, in-scope transactions. 0 = confirmed none. Null = unknown. */
  provenCents: Cents | null;
  /** The ledger's own reported total. Null = not supplied. */
  postedAmountCents: Cents | null;
  /** Saved transactions that match this payment, account, facility, and payer. */
  transactions: PostingTransaction[];
  outOfScopeTransactionIds: string[];
  conflicts: PostingConflict[];
  unknownReasons: string[];
  readiness: Readiness;
  claimReviewStatus: string | null;
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/**
 * Decide posting status for one account and facility.
 * Only a saved transaction that matches scope proves posting. Labels never do.
 */
export function assessPosting(ds: Dataset, payment: Payment, allocation: PaymentAllocation): PostingResult {
  const row =
    ds.billing_ledger.payment_records.find(
      (l) =>
        l.payment_reference === payment.paymentReference &&
        l.account_id === allocation.accountId &&
        l.facility_id === allocation.facilityId,
    ) ?? null;

  const base = {
    paymentReference: payment.paymentReference,
    accountId: allocation.accountId,
    facilityId: allocation.facilityId,
    remitCents: allocation.amountCents,
  };

  if (row === null) {
    return {
      ...base,
      ledgerRecordId: null,
      ledger: null,
      status: 'unknown',
      provenCents: null,
      postedAmountCents: null,
      transactions: [],
      outOfScopeTransactionIds: [],
      conflicts: [],
      unknownReasons: ['No ledger row for this account and facility'],
      readiness: 'not_established',
      claimReviewStatus: null,
    };
  }

  const ids = row.posting_transaction_ids;
  const linked = (ids ?? []).flatMap((id) => ds.billing_ledger.posting_transactions.find((t) => t.transaction_id === id) ?? []);
  const inScope = (t: PostingTransaction) =>
    t.payment_reference === row.payment_reference &&
    t.account_id === row.account_id &&
    t.facility_id === row.facility_id &&
    t.payer_id === row.payer_id;
  const transactions = linked.filter((t) => inScope(t) && t.transaction_status === 'saved');
  const outOfScopeTransactionIds = linked.filter((t) => !inScope(t)).map((t) => t.transaction_id);
  const unsaved = linked.filter((t) => inScope(t) && t.transaction_status !== 'saved');
  const unresolved = (ids ?? []).length - linked.length;

  let status: PostingStatus;
  let provenCents: Cents | null;
  const unknownReasons: string[] = [];

  if (transactions.length > 0) {
    provenCents = sum(transactions.map((t) => t.amount_cents));
    status = provenCents === allocation.amountCents ? 'verified_posted' : 'amount_mismatch';
  } else if (ids !== null && ids.length === 0 && row.posting_history_complete) {
    status = 'not_posted_confirmed';
    provenCents = 0;
  } else {
    status = 'unknown';
    provenCents = null;
    if (row.posted_amount_cents === null) unknownReasons.push('Posted amount not supplied');
    if (!row.posting_history_complete) unknownReasons.push('Posting history is incomplete');
    if (ids === null) unknownReasons.push('Transaction list unavailable');
    if (outOfScopeTransactionIds.length > 0) unknownReasons.push('Listed transaction does not match this account and facility');
    if (unsaved.length > 0) unknownReasons.push('Listed transaction is not saved');
    if (unresolved > 0) unknownReasons.push('Listed transaction was not supplied');
  }

  const conflicts: PostingConflict[] = [];
  const txnNames = transactions.map((t) => t.transaction_id).join(', ');
  if (status === 'verified_posted' || status === 'amount_mismatch') {
    const proven = formatCents(provenCents ?? 0);
    if (row.summary_status !== 'posted') {
      conflicts.push({ kind: 'summary_label', message: `Summary label says "${row.summary_status}" but saved transaction ${txnNames} shows ${proven} posted.` });
    }
    if (row.posting_status !== 'posted') {
      conflicts.push({ kind: 'detail_status', message: `Detail status says "${row.posting_status}" but saved transaction ${txnNames} shows ${proven} posted.` });
    }
    if (row.posted_amount_cents !== null && row.posted_amount_cents !== provenCents) {
      conflicts.push({ kind: 'posted_amount', message: `Ledger reports ${formatCents(row.posted_amount_cents)} posted but saved transactions add up to ${proven}.` });
    }
  } else if (status === 'not_posted_confirmed') {
    if (row.summary_status === 'posted') {
      conflicts.push({ kind: 'summary_label', message: 'Summary label says "posted" but the complete history has no saved transaction.' });
    }
    if (row.posting_status === 'posted') {
      conflicts.push({ kind: 'detail_status', message: 'Detail status says "posted" but the complete history has no saved transaction.' });
    }
    if (row.posted_amount_cents !== null && row.posted_amount_cents !== 0) {
      conflicts.push({ kind: 'posted_amount', message: `Ledger reports ${formatCents(row.posted_amount_cents)} posted but the complete history has no saved transaction.` });
    }
  }

  const readiness: Readiness =
    status === 'verified_posted' ? 'not_applicable' : row.claim_review_status === null ? 'not_established' : 'review_supplied';

  return {
    ...base,
    ledgerRecordId: row.record_id,
    ledger: row,
    status,
    provenCents,
    postedAmountCents: row.posted_amount_cents,
    transactions,
    outOfScopeTransactionIds,
    conflicts,
    unknownReasons,
    readiness,
    claimReviewStatus: row.claim_review_status,
  };
}
