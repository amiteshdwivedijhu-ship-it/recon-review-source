import { isCents } from './money';
import type { Dataset } from './types';

export type LoadResult = { ok: true; dataset: Dataset } | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;
type FieldCheck = (value: unknown) => string | null;

const isObject = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

const str: FieldCheck = (v) => (typeof v === 'string' && v.trim() !== '' ? null : 'must be text');
const bool: FieldCheck = (v) => (typeof v === 'boolean' ? null : 'must be true or false');
const cents: FieldCheck = (v) => (isCents(v) ? null : 'must be whole cents');
const date: FieldCheck = (v) => (typeof v === 'string' && isIsoDate(v) ? null : 'must be a YYYY-MM-DD date');
const timestamp: FieldCheck = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)) ? null : 'must be a UTC timestamp';
/** Missing data must be an explicit null. An absent field is a load error. */
const nullable =
  (inner: FieldCheck): FieldCheck =>
  (v) =>
    v === null ? null : v === undefined ? 'is missing (use null for unknown)' : inner(v);
const oneOf =
  (...allowed: string[]): FieldCheck =>
  (v) =>
    typeof v === 'string' && allowed.includes(v) ? null : `must be one of: ${allowed.join(', ')}`;
const listOf =
  (inner: FieldCheck): FieldCheck =>
  (v) =>
    Array.isArray(v) && v.every((item) => inner(item) === null) ? null : 'must be a list';
const anyList: FieldCheck = (v) => (Array.isArray(v) ? null : 'must be a list');

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const SCHEMAS = {
  accounts: { account_id: str, account_name: str, facility_id: str, facility_name: str },
  payers: { payer_id: str, payer_name: str },
  case_index: { case_id: str, title: str, payment_reference: nullable(str), credit_id: nullable(str) },
  remittance: {
    record_id: str,
    record_type: oneOf('parent_payment', 'account_allocation', 'single_payment'),
    payment_reference: str,
    payer_id: str,
    payment_date: date,
    amount_cents: cents,
    account_id: nullable(str),
    facility_id: nullable(str),
    parent_record_id: nullable(str),
  },
  deposit: { deposit_id: str, payment_reference: str, deposit_date: date, amount_cents: cents, allocations: anyList },
  depositAllocation: { account_id: str, facility_id: str, amount_cents: cents },
  ledger: {
    record_id: str,
    payment_reference: str,
    account_id: str,
    facility_id: str,
    payer_id: str,
    expected_amount_cents: cents,
    posted_amount_cents: nullable(cents),
    posting_status: str,
    summary_status: str,
    posting_transaction_ids: nullable(listOf(str)),
    posting_history_complete: bool,
    claim_review_status: nullable(str),
  },
  transaction: {
    transaction_id: str,
    payment_reference: str,
    account_id: str,
    facility_id: str,
    payer_id: str,
    amount_cents: cents,
    transaction_status: str,
    posted_by: str,
    posted_at: timestamp,
  },
  credit: {
    credit_id: str,
    claim_id: str,
    account_id: str,
    facility_id: str,
    payer_id: str,
    balance_cents: cents,
    detected_date: date,
    payment_reference: nullable(str),
    transaction_history: nullable(anyList),
    remittance_details: nullable(anyList),
    refund_history: nullable(anyList),
    payer_recovery_history: nullable(anyList),
  },
} satisfies Record<string, Record<string, FieldCheck>>;

function checkRows(
  errors: string[],
  rows: unknown,
  path: string,
  idField: string,
  schema: Record<string, FieldCheck>,
): Rec[] {
  if (!Array.isArray(rows)) {
    errors.push(`${path} is missing or is not a list.`);
    return [];
  }
  rows.forEach((row, index) => {
    if (!isObject(row)) {
      errors.push(`${path}[${index}] is not a record.`);
      return;
    }
    const label = typeof row[idField] === 'string' ? String(row[idField]) : `${path}[${index}]`;
    for (const [field, check] of Object.entries(schema)) {
      const problem = check(row[field]);
      if (problem) errors.push(`${label}: ${field} ${problem}.`);
    }
  });
  return rows.filter(isObject);
}

/**
 * Check the shape of the raw file and return it typed.
 * Nothing is defaulted or coerced: null stays null and zero stays zero.
 */
export function loadDataset(raw: unknown): LoadResult {
  if (!isObject(raw)) return { ok: false, errors: ['The data file is not a JSON object.'] };
  const errors: string[] = [];
  const section = (key: string): Rec => {
    const value = raw[key];
    return isObject(value) ? value : {};
  };

  if (!isObject(raw.metadata) || typeof raw.metadata.snapshot_at !== 'string') {
    errors.push('metadata is missing or has no snapshot_at.');
  }
  checkRows(errors, raw.accounts, 'accounts', 'account_id', SCHEMAS.accounts);
  checkRows(errors, raw.payers, 'payers', 'payer_id', SCHEMAS.payers);
  checkRows(errors, raw.case_index, 'case_index', 'case_id', SCHEMAS.case_index);
  checkRows(
    errors,
    section('clearinghouse').remittance_records,
    'clearinghouse.remittance_records',
    'record_id',
    SCHEMAS.remittance,
  );
  const deposits = checkRows(errors, section('cash_tracker').deposits, 'cash_tracker.deposits', 'deposit_id', SCHEMAS.deposit);
  for (const deposit of deposits) {
    if (Array.isArray(deposit.allocations)) {
      checkRows(errors, deposit.allocations, `${String(deposit.deposit_id)} allocations`, 'none', SCHEMAS.depositAllocation);
    }
  }
  const ledger = section('billing_ledger');
  checkRows(errors, ledger.payment_records, 'billing_ledger.payment_records', 'record_id', SCHEMAS.ledger);
  checkRows(errors, ledger.posting_transactions, 'billing_ledger.posting_transactions', 'transaction_id', SCHEMAS.transaction);
  checkRows(errors, ledger.credit_balances, 'billing_ledger.credit_balances', 'credit_id', SCHEMAS.credit);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, dataset: raw as unknown as Dataset };
}
