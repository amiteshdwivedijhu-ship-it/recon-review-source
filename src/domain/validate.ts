import { formatCents } from './money';
import type { Dataset } from './types';

export type DataCheckId =
  | 'split_sum'
  | 'deposit_allocation_sum'
  | 'account_facility_pair'
  | 'payer_exists'
  | 'posting_transaction_match'
  | 'links_resolve';

export interface DataIssue {
  checkId: DataCheckId;
  message: string;
  recordIds: string[];
  /** Used to attach the issue to a case. Null when no payment can be named. */
  paymentReference: string | null;
}

export interface DataCheck {
  id: DataCheckId;
  label: string;
  rule: string;
  passed: boolean;
  issues: DataIssue[];
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/** Run every data check. A failure is reported, never thrown. */
export function runDataChecks(ds: Dataset): DataCheck[] {
  const remits = ds.clearinghouse.remittance_records;
  const deposits = ds.cash_tracker.deposits;
  const ledgerRows = ds.billing_ledger.payment_records;
  const transactions = ds.billing_ledger.posting_transactions;
  const credits = ds.billing_ledger.credit_balances;

  const checks: DataCheck[] = [];
  const add = (id: DataCheckId, label: string, rule: string, issues: Omit<DataIssue, 'checkId'>[]) =>
    checks.push({ id, label, rule, passed: issues.length === 0, issues: issues.map((i) => ({ ...i, checkId: id })) });

  // 1. Split allocations sum to their parent.
  const splitIssues: Omit<DataIssue, 'checkId'>[] = [];
  for (const parent of remits.filter((r) => r.record_type === 'parent_payment')) {
    const children = remits.filter((r) => r.parent_record_id === parent.record_id);
    const childSum = sum(children.map((c) => c.amount_cents));
    if (children.length === 0) {
      splitIssues.push({
        message: `Parent payment ${parent.record_id} has no allocations.`,
        recordIds: [parent.record_id],
        paymentReference: parent.payment_reference,
      });
    } else if (childSum !== parent.amount_cents) {
      splitIssues.push({
        message: `Allocations under ${parent.record_id} add up to ${formatCents(childSum)}, but the parent payment is ${formatCents(parent.amount_cents)}.`,
        recordIds: [parent.record_id, ...children.map((c) => c.record_id)],
        paymentReference: parent.payment_reference,
      });
    }
  }
  add('split_sum', 'Split allocations add up to the parent payment', 'Split allocations must sum to the parent.', splitIssues);

  // 2. Deposit allocations sum to the deposit amount.
  const depositIssues: Omit<DataIssue, 'checkId'>[] = [];
  for (const deposit of deposits) {
    const allocated = sum(deposit.allocations.map((a) => a.amount_cents));
    if (allocated !== deposit.amount_cents) {
      depositIssues.push({
        message: `Allocations in ${deposit.deposit_id} add up to ${formatCents(allocated)}, but the deposit is ${formatCents(deposit.amount_cents)}.`,
        recordIds: [deposit.deposit_id],
        paymentReference: deposit.payment_reference,
      });
    }
  }
  add('deposit_allocation_sum', 'Deposit allocations add up to the deposit', 'Deposit allocations must sum to the deposit amount.', depositIssues);

  // 3. Every account and facility pair is in the accounts table.
  const pairs = new Set(ds.accounts.map((a) => `${a.account_id}|${a.facility_id}`));
  const pairIssues: Omit<DataIssue, 'checkId'>[] = [];
  const checkPair = (recordId: string, accountId: string | null, facilityId: string | null, ref: string | null) => {
    if (!pairs.has(`${accountId}|${facilityId}`)) {
      pairIssues.push({
        message: `${recordId} uses account ${accountId ?? 'Unknown'} with facility ${facilityId ?? 'Unknown'}. That pair is not in the accounts table.`,
        recordIds: [recordId],
        paymentReference: ref,
      });
    }
  };
  for (const r of remits) {
    // A parent payment spans accounts, so null there means not applicable.
    if (r.record_type !== 'parent_payment') checkPair(r.record_id, r.account_id, r.facility_id, r.payment_reference);
  }
  for (const d of deposits) for (const a of d.allocations) checkPair(d.deposit_id, a.account_id, a.facility_id, d.payment_reference);
  for (const l of ledgerRows) checkPair(l.record_id, l.account_id, l.facility_id, l.payment_reference);
  for (const t of transactions) checkPair(t.transaction_id, t.account_id, t.facility_id, t.payment_reference);
  for (const c of credits) checkPair(c.credit_id, c.account_id, c.facility_id, c.payment_reference);
  add('account_facility_pair', 'Account and facility pairs match the accounts table', 'Verify per account and facility.', pairIssues);

  // 4. Every payer id exists.
  const payerIds = new Set(ds.payers.map((p) => p.payer_id));
  const payerIssues: Omit<DataIssue, 'checkId'>[] = [];
  const checkPayer = (recordId: string, payerId: string, ref: string | null) => {
    if (!payerIds.has(payerId)) {
      payerIssues.push({ message: `${recordId} names payer ${payerId}, which is not in the payers table.`, recordIds: [recordId], paymentReference: ref });
    }
  };
  for (const r of remits) checkPayer(r.record_id, r.payer_id, r.payment_reference);
  for (const l of ledgerRows) checkPayer(l.record_id, l.payer_id, l.payment_reference);
  for (const t of transactions) checkPayer(t.transaction_id, t.payer_id, t.payment_reference);
  for (const c of credits) checkPayer(c.credit_id, c.payer_id, c.payment_reference);
  add('payer_exists', 'Payer ids exist', 'Match by payer.', payerIssues);

  // 5. Posting transactions match their ledger row, and their total equals the posted amount.
  const txnById = new Map(transactions.map((t) => [t.transaction_id, t]));
  const txnIssues: Omit<DataIssue, 'checkId'>[] = [];
  for (const row of ledgerRows) {
    if (row.posting_transaction_ids === null) continue;
    const linked = row.posting_transaction_ids.flatMap((id) => txnById.get(id) ?? []);
    for (const t of linked) {
      const mismatched = (
        [
          ['payment reference', t.payment_reference, row.payment_reference],
          ['account', t.account_id, row.account_id],
          ['facility', t.facility_id, row.facility_id],
          ['payer', t.payer_id, row.payer_id],
        ] as const
      ).filter(([, a, b]) => a !== b);
      if (mismatched.length > 0) {
        txnIssues.push({
          message: `${t.transaction_id} does not match ${row.record_id} on ${mismatched.map(([name]) => name).join(', ')}.`,
          recordIds: [row.record_id, t.transaction_id],
          paymentReference: row.payment_reference,
        });
      }
    }
    const linkedTotal = sum(linked.map((t) => t.amount_cents));
    if (linked.length > 0 && row.posted_amount_cents !== null && linkedTotal !== row.posted_amount_cents) {
      txnIssues.push({
        message: `Transactions on ${row.record_id} add up to ${formatCents(linkedTotal)}, but the ledger reports ${formatCents(row.posted_amount_cents)} posted.`,
        recordIds: [row.record_id, ...linked.map((t) => t.transaction_id)],
        paymentReference: row.payment_reference,
      });
    }
  }
  add('posting_transaction_match', 'Posting transactions match their ledger row', 'Verify posting per account and facility.', txnIssues);

  // 6. Every record link resolves.
  const remitRefs = new Set(remits.map((r) => r.payment_reference));
  const parentIds = new Set(remits.filter((r) => r.record_type === 'parent_payment').map((r) => r.record_id));
  const creditIds = new Set(credits.map((c) => c.credit_id));
  const linkedTxnIds = new Set(ledgerRows.flatMap((l) => l.posting_transaction_ids ?? []));
  const linkIssues: Omit<DataIssue, 'checkId'>[] = [];
  const broken = (message: string, recordIds: string[], ref: string | null) => linkIssues.push({ message, recordIds, paymentReference: ref });
  for (const r of remits) {
    if (r.record_type === 'account_allocation' && (r.parent_record_id === null || !parentIds.has(r.parent_record_id))) {
      broken(`Allocation ${r.record_id} points to parent ${r.parent_record_id ?? 'Unknown'}, which is not a parent payment.`, [r.record_id], r.payment_reference);
    }
  }
  for (const d of deposits) {
    if (!remitRefs.has(d.payment_reference)) broken(`Deposit ${d.deposit_id} names ${d.payment_reference}, which has no remittance.`, [d.deposit_id], d.payment_reference);
  }
  for (const l of ledgerRows) {
    if (!remitRefs.has(l.payment_reference)) broken(`Ledger row ${l.record_id} names ${l.payment_reference}, which has no remittance.`, [l.record_id], l.payment_reference);
    for (const id of l.posting_transaction_ids ?? []) {
      if (!txnById.has(id)) broken(`Ledger row ${l.record_id} lists transaction ${id}, which was not supplied.`, [l.record_id], l.payment_reference);
    }
  }
  for (const t of transactions) {
    if (!linkedTxnIds.has(t.transaction_id)) broken(`Transaction ${t.transaction_id} is not listed on any ledger row.`, [t.transaction_id], t.payment_reference);
  }
  for (const c of ds.case_index) {
    if (c.payment_reference !== null && !remitRefs.has(c.payment_reference)) broken(`Case ${c.case_id} names ${c.payment_reference}, which has no remittance.`, [], c.payment_reference);
    if (c.credit_id !== null && !creditIds.has(c.credit_id)) broken(`Case ${c.case_id} names credit ${c.credit_id}, which was not supplied.`, [], null);
  }
  for (const c of credits) {
    if (c.payment_reference !== null && !remitRefs.has(c.payment_reference)) broken(`Credit ${c.credit_id} names ${c.payment_reference}, which has no remittance.`, [c.credit_id], c.payment_reference);
  }
  add('links_resolve', 'Record links resolve', 'Match records by payment reference and record id.', linkIssues);

  return checks;
}
