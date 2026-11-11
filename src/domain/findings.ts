import { type CashResult, type Payment, type ReceiptTotals, listPayments, receiptTotals, reconcileCash } from './cash';
import { type VerifiedInWindow, WINDOW_BUSINESS_DAYS, isWeekend, rollToBusinessDay, verifiedInWindow } from './metrics';
import { formatCents } from './money';
import { type PostingResult, assessPosting } from './posting';
import { OWNERS, type Account, type Cents, type Dataset, type Owner, type Payer, type ReasonCategory } from './types';
import { type DataCheck, type DataIssue, runDataChecks } from './validate';

export type FindingKind =
  | 'data_quality'
  | 'deposit_mismatch'
  | 'deposit_missing'
  | 'expected_amount_mismatch'
  | 'conflicting_status'
  | 'posting_amount_mismatch'
  | 'missing_posting_evidence'
  | 'claim_review_needed';

export type Track = 'cash' | 'posting' | 'data';

/** Something the system calculated from the records and wants a person to review. */
export interface Finding {
  id: string;
  caseId: string;
  kind: FindingKind;
  track: Track;
  accountId: string | null;
  facilityId: string | null;
  title: string;
  why: string;
  amountCents: Cents;
  /** The rule from the brief that this finding comes from. */
  rule: string;
  evidenceIds: string[];
  nextStep: string;
  suggestedOwner: Owner;
  suggestedCategory: ReasonCategory;
  /** True when outside evidence must arrive before this can be resolved. */
  requiresEvidence: boolean;
  /** Plain sentence shown when Resolve is blocked. Null when nothing is awaited. */
  waitingOn: string | null;
  /** Suggested text for an evidence request. */
  missingEvidence: string | null;
}

export interface PostingDecisionPrompt {
  prompt: string;
  remitCents: Cents;
  depositCents: Cents;
}

export interface CaseAnalysis {
  caseId: string;
  title: string;
  paymentReference: string;
  payer: Payer | null;
  payment: Payment;
  cash: CashResult;
  postings: PostingResult[];
  /** Display names, in the same order as postings and cash.accounts. */
  accountNames: string[];
  findings: Finding[];
  summary: string;
  info: string[];
  /** Set when the posting call must be made by a person. The tool suggests nothing. */
  postingDecision: PostingDecisionPrompt | null;
}

export interface CreditCase {
  caseId: string;
  title: string;
  creditId: string;
  claimId: string;
  accountId: string;
  facilityId: string;
  payer: Payer | null;
  balanceCents: Cents;
  detectedDate: string;
  status: string;
  unknown: string[];
  evidenceNeeded: string[];
  owner: Owner;
}

export interface Analysis {
  snapshotAt: string;
  accounts: Account[];
  checks: DataCheck[];
  totals: ReceiptTotals;
  cases: CaseAnalysis[];
  credits: CreditCase[];
  metric: VerifiedInWindow;
  /** Data issues that could not be tied to a live case. */
  generalDataIssues: DataIssue[];
}

/** "Demo Account A" reads as "Account A" on screen. */
export function accountLabel(accounts: Account[], accountId: string | null): string {
  if (accountId === null) return 'Unknown account';
  const account = accounts.find((a) => a.account_id === accountId);
  return account ? account.account_name.replace(/^Demo /, '') : accountId;
}

export function facilityLabel(accounts: Account[], facilityId: string | null): string {
  if (facilityId === null) return 'Unknown facility';
  const account = accounts.find((a) => a.facility_id === facilityId);
  return account ? account.facility_name.replace(/^Demo /, '') : facilityId;
}

function postingOwner(accounts: Account[], facilityId: string | null): Owner {
  const candidate = `Posting team (${facilityLabel(accounts, facilityId)})`;
  return (OWNERS as readonly string[]).includes(candidate) ? (candidate as Owner) : 'Posting team (Facility A)';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function analyzeCase(ds: Dataset, caseId: string, title: string, payment: Payment, checks: DataCheck[]): CaseAnalysis {
  const accounts = ds.accounts;
  const cash = reconcileCash(ds, payment);
  const postings = payment.allocations.map((allocation) => assessPosting(ds, payment, allocation));
  const findings: Finding[] = [];
  const info: string[] = [];
  const ref = payment.paymentReference;
  const allLedgerIds = postings.flatMap((p) => p.ledgerRecordId ?? []);

  // Data quality findings for this payment.
  const dataIssues = checks.flatMap((check) => check.issues.filter((i) => i.paymentReference === ref).map((issue) => ({ check, issue })));
  dataIssues.forEach(({ check, issue }, index) => {
    findings.push({
      id: `${caseId}:data_quality:${check.id}:${index + 1}`,
      caseId,
      kind: 'data_quality',
      track: 'data',
      accountId: null,
      facilityId: null,
      title: `Data check failed: ${check.label}`,
      why: issue.message,
      amountCents: payment.totalCents,
      rule: check.rule,
      evidenceIds: issue.recordIds,
      nextStep: 'Ask the billing system owner to correct or explain the source records.',
      suggestedOwner: 'Billing system admin',
      suggestedCategory: check.id === 'posting_transaction_match' ? 'Conflicting status' : 'Missing remittance detail',
      requiresEvidence: true,
      waitingOn: 'Corrected source records are still missing.',
      missingEvidence: 'Corrected source records',
    });
  });

  // Cash track.
  if (cash.status === 'unknown') {
    findings.push({
      id: `${caseId}:deposit_missing`,
      caseId,
      kind: 'deposit_missing',
      track: 'cash',
      accountId: null,
      facilityId: null,
      title: 'No deposit found for this payment',
      why: `Remittance ${payment.remitRecordId} is ${formatCents(payment.totalCents)}. The cash tracker has no matching deposit or allocation.`,
      amountCents: payment.totalCents,
      rule: 'Unknown evidence must stay visible. A missing deposit is not a $0.00 deposit.',
      evidenceIds: [payment.remitRecordId, ...cash.depositIds],
      nextStep: 'Ask Cash reconciliation to find the deposit.',
      suggestedOwner: 'Cash reconciliation',
      suggestedCategory: 'Deposit mismatch',
      requiresEvidence: true,
      waitingOn: 'The deposit record is still missing.',
      missingEvidence: `Deposit record for ${ref}`,
    });
  } else if (cash.status === 'variance') {
    const diff = cash.differenceCents ?? 0;
    const splitOnly = diff === 0;
    const amount = splitOnly
      ? cash.accounts.reduce((max, a) => Math.max(max, Math.abs(a.differenceCents ?? 0)), 0)
      : Math.abs(diff);
    findings.push({
      id: `${caseId}:deposit_mismatch`,
      caseId,
      kind: 'deposit_mismatch',
      track: 'cash',
      accountId: null,
      facilityId: null,
      title: splitOnly
        ? 'Deposit split does not match the remittance'
        : `Deposit ${diff < 0 ? 'short' : 'over'} by ${formatCents(amount)}, reason unknown`,
      why: `Remittance ${payment.remitRecordId} is ${formatCents(cash.remitCents)}. Deposit ${cash.depositIds.join(', ')} is ${formatCents(cash.depositCents ?? 0)}.`,
      amountCents: amount,
      rule: 'Reconcile deposit and remittance amounts. Matching must be exact, and a gap is never adjusted away.',
      evidenceIds: [payment.remitRecordId, ...cash.depositIds, ...allLedgerIds],
      nextStep: 'Assign to Cash reconciliation to find the reason. Do not adjust the amount to make it balance.',
      suggestedOwner: 'Cash reconciliation',
      suggestedCategory: 'Deposit mismatch',
      requiresEvidence: true,
      waitingOn: `The reason for the ${formatCents(amount)} difference is still unknown.`,
      missingEvidence: `Reason for the ${formatCents(amount)} difference between ${payment.remitRecordId} and ${cash.depositIds.join(', ')}`,
    });
  }

  // Posting track, one account and facility at a time.
  postings.forEach((posting, index) => {
    const accountCash = cash.accounts[index];
    const name = accountLabel(accounts, posting.accountId);
    const scope = `${posting.accountId ?? 'Unknown'} / ${posting.facilityId ?? 'Unknown'}`;
    const key = posting.accountId ?? `row${index + 1}`;
    const common = { caseId, accountId: posting.accountId, facilityId: posting.facilityId, track: 'posting' as const };
    const ledgerIds = posting.ledgerRecordId ? [posting.ledgerRecordId] : [];

    if (posting.ledger && posting.ledger.expected_amount_cents !== posting.remitCents) {
      findings.push({
        ...common,
        id: `${caseId}:expected_amount_mismatch:${key}`,
        kind: 'expected_amount_mismatch',
        title: `Ledger expects a different amount for ${name}`,
        why: `Remittance shows ${formatCents(posting.remitCents)}. Ledger row ${posting.ledger.record_id} expects ${formatCents(posting.ledger.expected_amount_cents)}.`,
        amountCents: Math.abs(posting.ledger.expected_amount_cents - posting.remitCents),
        rule: 'Match source records by payment reference, payer, account, and facility, then compare amounts.',
        evidenceIds: [accountCash?.remitRecordId ?? payment.remitRecordId, ...ledgerIds],
        nextStep: 'Ask the posting team which amount is right before anything is posted.',
        suggestedOwner: postingOwner(accounts, posting.facilityId),
        suggestedCategory: 'Conflicting status',
        requiresEvidence: true,
        waitingOn: 'The reason the ledger expects a different amount is still unknown.',
        missingEvidence: `Reason the ledger expected amount differs for ${scope}`,
      });
    }

    if (posting.conflicts.length > 0) {
      findings.push({
        ...common,
        id: `${caseId}:conflicting_status:${key}`,
        kind: 'conflicting_status',
        title: posting.conflicts.every((c) => c.kind === 'summary_label')
          ? 'Summary label conflicts with posting evidence'
          : 'Ledger status conflicts with posting evidence',
        why: posting.conflicts.map((c) => c.message).join(' '),
        amountCents: posting.remitCents,
        rule: 'A summary label alone does not prove posting. Saved transactions are the evidence.',
        evidenceIds: [...ledgerIds, ...posting.transactions.map((t) => t.transaction_id)],
        nextStep: 'Confirm, then send a label fix to the billing system owner.',
        suggestedOwner: 'Billing system admin',
        suggestedCategory: 'Conflicting status',
        requiresEvidence: false,
        waitingOn: null,
        missingEvidence: null,
      });
    }

    if (posting.status === 'amount_mismatch') {
      findings.push({
        ...common,
        id: `${caseId}:posting_amount_mismatch:${key}`,
        kind: 'posting_amount_mismatch',
        title: `Posted amount differs for ${name}`,
        why: `Saved transactions add up to ${formatCents(posting.provenCents ?? 0)}. The remittance shows ${formatCents(posting.remitCents)}.`,
        amountCents: Math.abs((posting.provenCents ?? 0) - posting.remitCents),
        rule: 'Verify posting per account and facility, including the amount.',
        evidenceIds: [...ledgerIds, ...posting.transactions.map((t) => t.transaction_id)],
        nextStep: 'Ask the posting team to explain the posted amount.',
        suggestedOwner: postingOwner(accounts, posting.facilityId),
        suggestedCategory: 'Conflicting status',
        requiresEvidence: true,
        waitingOn: 'The reason for the posted amount is still unknown.',
        missingEvidence: `Reason the posted amount differs for ${scope}`,
      });
    }

    if (posting.status === 'unknown') {
      findings.push({
        ...common,
        id: `${caseId}:missing_posting_evidence:${key}`,
        kind: 'missing_posting_evidence',
        title: `Posting evidence missing for ${name}`,
        why: `${posting.unknownReasons.join('. ')}.`,
        amountCents: posting.remitCents,
        rule: 'Verify posting per account and facility. Unknown evidence must stay visible.',
        evidenceIds: ledgerIds,
        nextStep: `Request posting history for ${scope}.`,
        suggestedOwner: postingOwner(accounts, posting.facilityId),
        suggestedCategory: 'Missing posting evidence',
        requiresEvidence: true,
        waitingOn: `Posting history for ${name} is still missing.`,
        missingEvidence: `Posting history for ${scope}`,
      });
    }

    // Cash matches, nothing is posted, and nobody has said the claim is ready.
    if (posting.status === 'not_posted_confirmed' && posting.readiness === 'not_established' && accountCash?.status === 'matched') {
      findings.push({
        ...common,
        id: `${caseId}:claim_review_needed:${key}`,
        kind: 'claim_review_needed',
        title: 'Not posted. Ready to post is not established',
        why: `Cash matches at ${formatCents(posting.remitCents)} and the complete history has no saved transaction. Claim-level review was not supplied.`,
        amountCents: posting.remitCents,
        rule: 'Matching cash alone does not prove posting or readiness to post.',
        evidenceIds: [accountCash.remitRecordId, ...cash.depositIds, ...ledgerIds],
        nextStep: 'Request claim-level review.',
        suggestedOwner: postingOwner(accounts, posting.facilityId),
        suggestedCategory: 'Claim review needed',
        requiresEvidence: true,
        waitingOn: 'Claim-level review is still missing.',
        missingEvidence: `Claim-level review for ${ref}, ${scope}`,
      });
    }
  });

  // A cash gap with unposted money: the posting call belongs to a person.
  const postingDecision: PostingDecisionPrompt | null =
    cash.status === 'variance' && cash.depositCents !== null && postings.some((p) => p.status !== 'verified_posted')
      ? {
          prompt: `Remit supports ${formatCents(cash.remitCents)}. Deposit shows ${formatCents(cash.depositCents)}. This posting call needs a person.`,
          remitCents: cash.remitCents,
          depositCents: cash.depositCents,
        }
      : null;

  // Information lines. These are not findings.
  if (cash.gapCalendarDays !== null && cash.depositDate !== null) {
    const days = cash.gapCalendarDays;
    const when = days === 0 ? 'on the remittance date' : `${plural(Math.abs(days), 'day')} ${days > 0 ? 'after' : 'before'} the remittance date`;
    info.push(
      `Deposit arrived ${when}. ${cash.gapWithinWindow ? `Up to ${WINDOW_BUSINESS_DAYS} business days is normal.` : `That is more than the usual ${WINDOW_BUSINESS_DAYS} business days.`}`,
    );
    if (isWeekend(cash.depositDate)) {
      info.push(`Deposit date ${cash.depositDate} falls on a weekend. Business days are counted from ${rollToBusinessDay(cash.depositDate)}.`);
    }
  }
  if (payment.isSplit && payment.splitSumsToParent) {
    info.push(
      `Split check passed: ${payment.allocations.map((a) => formatCents(a.amountCents)).join(' + ')} = ${formatCents(payment.totalCents)}, the parent payment.`,
    );
  }

  return {
    caseId,
    title,
    paymentReference: ref,
    payer: ds.payers.find((p) => p.payer_id === payment.payerId) ?? null,
    payment,
    cash,
    postings,
    accountNames: payment.allocations.map((a) => accountLabel(accounts, a.accountId)),
    findings,
    summary: summarize(accounts, cash, postings, postingDecision !== null, dataIssues.length > 0),
    info,
    postingDecision,
  };
}

function summarize(accounts: Account[], cash: CashResult, postings: PostingResult[], needsDecision: boolean, dataFailed: boolean): string {
  const parts: string[] = [];
  if (dataFailed) parts.push('Data check failed.');

  if (cash.status === 'matched') parts.push('Cash matched.');
  else if (cash.status === 'unknown') parts.push('No deposit found.');
  else if (cash.differenceCents === 0) parts.push('Deposit split does not match the remittance.');
  else parts.push(`Deposit ${(cash.differenceCents ?? 0) < 0 ? 'short' : 'over'} by ${formatCents(Math.abs(cash.differenceCents ?? 0))}, reason unknown.`);

  if (postings.length > 1) {
    const proven = postings.filter((p) => p.status === 'verified_posted').map((p) => accountLabel(accounts, p.accountId));
    if (proven.length === postings.length) parts.push('Posting proven for all accounts.');
    else if (proven.length === 0) parts.push('Posting not proven for any account.');
    else parts.push(`Posting proven for ${joinNames(proven)} only.`);
  } else {
    const only = postings[0];
    if (!only || only.status === 'unknown') parts.push('Posting unknown.');
    else if (only.status === 'verified_posted') parts.push('Posting proven.');
    else if (only.status === 'amount_mismatch') parts.push('Posted amount differs.');
    else parts.push('Not posted (confirmed).');
    if (only && only.status === 'not_posted_confirmed' && only.readiness === 'not_established' && cash.status === 'matched') {
      parts.push('Ready to post is not established.');
    }
  }
  if (needsDecision) parts.push('The posting call needs a person.');
  return parts.join(' ');
}

const CREDIT_HISTORIES = [
  ['transaction_history', 'Transaction history', "The claim's full transaction history"],
  ['remittance_details', 'Remittance details', 'The remittance detail for the claim'],
  ['refund_history', 'Refund history', 'Refund history'],
  ['payer_recovery_history', 'Payer recovery history', 'Payer recovery or recoupment history'],
] as const;

/** Run every check and build the full picture the screens read from. Pure: same data in, same result out. */
export function analyze(ds: Dataset): Analysis {
  const checks = runDataChecks(ds);
  const payments = listPayments(ds);
  const totals = receiptTotals(ds);

  const cases: CaseAnalysis[] = [];
  const credits: CreditCase[] = [];
  for (const entry of ds.case_index) {
    const payment = entry.payment_reference === null ? undefined : payments.find((p) => p.paymentReference === entry.payment_reference);
    if (payment) cases.push(analyzeCase(ds, entry.case_id, entry.title, payment, checks));
    const credit = entry.credit_id === null ? undefined : ds.billing_ledger.credit_balances.find((c) => c.credit_id === entry.credit_id);
    if (credit) {
      const missing = CREDIT_HISTORIES.filter(([field]) => credit[field] === null);
      credits.push({
        caseId: entry.case_id,
        title: entry.title,
        creditId: credit.credit_id,
        claimId: credit.claim_id,
        accountId: credit.account_id,
        facilityId: credit.facility_id,
        payer: ds.payers.find((p) => p.payer_id === credit.payer_id) ?? null,
        balanceCents: credit.balance_cents,
        detectedDate: credit.detected_date,
        status: 'Investigation needed. Refund not established.',
        unknown: missing.map(([, label]) => label),
        evidenceNeeded: missing.map(([, , needed]) => needed),
        owner: 'Credit investigation',
      });
    }
  }

  const caseRefs = new Set(cases.map((c) => c.paymentReference));
  const generalDataIssues = checks.flatMap((c) => c.issues).filter((i) => i.paymentReference === null || !caseRefs.has(i.paymentReference));

  return {
    snapshotAt: ds.metadata.snapshot_at,
    accounts: ds.accounts,
    checks,
    totals,
    cases,
    credits,
    metric: verifiedInWindow(cases, totals.receivedCents),
    generalDataIssues,
  };
}
