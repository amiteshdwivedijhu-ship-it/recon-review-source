/**
 * Source record types. They mirror fixtures/sample_data.json.
 * Null always means unknown or not supplied. Zero is a known zero.
 */
export type Cents = number;

export interface Account {
  account_id: string;
  account_name: string;
  facility_id: string;
  facility_name: string;
}

export interface Payer {
  payer_id: string;
  payer_name: string;
}

export interface CaseIndexEntry {
  case_id: string;
  title: string;
  payment_reference: string | null;
  credit_id: string | null;
}

export type RemittanceRecordType = 'parent_payment' | 'account_allocation' | 'single_payment';

export interface RemittanceRecord {
  record_id: string;
  record_type: RemittanceRecordType;
  payment_reference: string;
  payer_id: string;
  payment_date: string;
  amount_cents: Cents;
  /** Null on a parent payment means not applicable: the parent spans accounts. */
  account_id: string | null;
  facility_id: string | null;
  parent_record_id: string | null;
}

export interface DepositAllocation {
  account_id: string;
  facility_id: string;
  amount_cents: Cents;
}

export interface Deposit {
  deposit_id: string;
  payment_reference: string;
  deposit_date: string;
  amount_cents: Cents;
  allocations: DepositAllocation[];
}

export interface LedgerPaymentRecord {
  record_id: string;
  payment_reference: string;
  account_id: string;
  facility_id: string;
  payer_id: string;
  expected_amount_cents: Cents;
  /** Null = not supplied. 0 = known zero. */
  posted_amount_cents: Cents | null;
  posting_status: string;
  /** A summary label that may be stale. Never proof on its own. */
  summary_status: string;
  /** Null = history unavailable. [] = complete history has no transactions. */
  posting_transaction_ids: string[] | null;
  posting_history_complete: boolean;
  /** Null = claim-level review not supplied. */
  claim_review_status: string | null;
}

export interface PostingTransaction {
  transaction_id: string;
  payment_reference: string;
  account_id: string;
  facility_id: string;
  payer_id: string;
  amount_cents: Cents;
  transaction_status: string;
  posted_by: string;
  posted_at: string;
}

export interface CreditBalance {
  credit_id: string;
  claim_id: string;
  account_id: string;
  facility_id: string;
  payer_id: string;
  balance_cents: Cents;
  detected_date: string;
  payment_reference: string | null;
  transaction_history: unknown[] | null;
  remittance_details: unknown[] | null;
  refund_history: unknown[] | null;
  payer_recovery_history: unknown[] | null;
}

export interface Metadata {
  dataset_name: string;
  schema_version: string;
  synthetic: boolean;
  currency: string;
  amount_unit: string;
  snapshot_at: string;
  notice: string;
}

export interface Dataset {
  metadata: Metadata;
  accounts: Account[];
  payers: Payer[];
  case_index: CaseIndexEntry[];
  clearinghouse: { remittance_records: RemittanceRecord[] };
  cash_tracker: { deposits: Deposit[] };
  billing_ledger: {
    payment_records: LedgerPaymentRecord[];
    posting_transactions: PostingTransaction[];
    credit_balances: CreditBalance[];
  };
}

/** Fixed lists used in handoffs. Demo roles, not people. */
export const OWNERS = [
  'Posting team (Facility A)',
  'Posting team (Facility B)',
  'Cash reconciliation',
  'Billing system admin',
  'Credit investigation',
] as const;
export type Owner = (typeof OWNERS)[number];

export const REASON_CATEGORIES = [
  'Deposit mismatch',
  'Missing posting evidence',
  'Conflicting status',
  'Missing remittance detail',
  'Claim review needed',
  'Credit investigation',
] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];
