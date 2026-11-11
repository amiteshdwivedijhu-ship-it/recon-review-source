import { WINDOW_BUSINESS_DAYS, businessDaysBetween, calendarDaysBetween } from './metrics';
import type { Cents, Dataset } from './types';

export interface PaymentAllocation {
  /** The remittance row that carries this account's share. */
  recordId: string;
  accountId: string | null;
  facilityId: string | null;
  amountCents: Cents;
}

/** One payment received. A split payment is one payment with several allocations. */
export interface Payment {
  paymentReference: string;
  remitRecordId: string;
  payerId: string;
  paymentDate: string;
  totalCents: Cents;
  isSplit: boolean;
  allocations: PaymentAllocation[];
  allocationSumCents: Cents;
  splitSumsToParent: boolean;
}

export type CashStatus = 'matched' | 'variance' | 'unknown';

export interface AccountCash {
  accountId: string | null;
  facilityId: string | null;
  remitRecordId: string;
  remitCents: Cents;
  /** Null = no deposit allocation found for this account. */
  depositCents: Cents | null;
  /** Null = no ledger row found. */
  expectedCents: Cents | null;
  /** Deposit minus remittance. Null when the deposit is unknown. */
  differenceCents: Cents | null;
  status: CashStatus;
}

export interface CashResult {
  paymentReference: string;
  remitCents: Cents;
  depositIds: string[];
  depositDate: string | null;
  depositCents: Cents | null;
  differenceCents: Cents | null;
  status: CashStatus;
  gapCalendarDays: number | null;
  gapBusinessDays: number | null;
  gapWithinWindow: boolean | null;
  accounts: AccountCash[];
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/**
 * Payments received. Parents and single payments are receipts.
 * Allocation rows are parts of a parent, so they are never counted again.
 */
export function listPayments(ds: Dataset): Payment[] {
  const rows = ds.clearinghouse.remittance_records;
  return rows
    .filter((r) => r.record_type !== 'account_allocation')
    .map((r) => {
      const isSplit = r.record_type === 'parent_payment';
      const allocations: PaymentAllocation[] = isSplit
        ? rows
            .filter((c) => c.parent_record_id === r.record_id)
            .map((c) => ({ recordId: c.record_id, accountId: c.account_id, facilityId: c.facility_id, amountCents: c.amount_cents }))
        : [{ recordId: r.record_id, accountId: r.account_id, facilityId: r.facility_id, amountCents: r.amount_cents }];
      const allocationSumCents = sum(allocations.map((a) => a.amountCents));
      return {
        paymentReference: r.payment_reference,
        remitRecordId: r.record_id,
        payerId: r.payer_id,
        paymentDate: r.payment_date,
        totalCents: r.amount_cents,
        isSplit,
        allocations,
        allocationSumCents,
        splitSumsToParent: allocationSumCents === r.amount_cents,
      };
    });
}

export interface ReceiptTotals {
  remittanceRowCount: number;
  paymentCount: number;
  receivedCents: Cents;
  /** Sum of every remittance row. Wrong on purpose: kept only to test against. */
  naiveRowSumCents: Cents;
  depositCount: number;
  depositedCents: Cents;
  /** Deposited minus received. */
  differenceCents: Cents;
}

export function receiptTotals(ds: Dataset): ReceiptTotals {
  const payments = listPayments(ds);
  const receivedCents = sum(payments.map((p) => p.totalCents));
  const depositedCents = sum(ds.cash_tracker.deposits.map((d) => d.amount_cents));
  return {
    remittanceRowCount: ds.clearinghouse.remittance_records.length,
    paymentCount: payments.length,
    receivedCents,
    naiveRowSumCents: sum(ds.clearinghouse.remittance_records.map((r) => r.amount_cents)),
    depositCount: ds.cash_tracker.deposits.length,
    depositedCents,
    differenceCents: depositedCents - receivedCents,
  };
}

/** Compare the remittance to the deposit, in total and per account and facility. */
export function reconcileCash(ds: Dataset, payment: Payment): CashResult {
  const deposits = ds.cash_tracker.deposits.filter((d) => d.payment_reference === payment.paymentReference);
  const hasDeposit = deposits.length > 0;
  const depositCents = hasDeposit ? sum(deposits.map((d) => d.amount_cents)) : null;
  const differenceCents = depositCents === null ? null : depositCents - payment.totalCents;

  const accounts: AccountCash[] = payment.allocations.map((allocation) => {
    const parts = deposits.flatMap((d) =>
      d.allocations.filter((a) => a.account_id === allocation.accountId && a.facility_id === allocation.facilityId),
    );
    const accountDeposit = parts.length > 0 ? sum(parts.map((p) => p.amount_cents)) : null;
    const ledgerRow = ds.billing_ledger.payment_records.find(
      (l) =>
        l.payment_reference === payment.paymentReference &&
        l.account_id === allocation.accountId &&
        l.facility_id === allocation.facilityId,
    );
    const diff = accountDeposit === null ? null : accountDeposit - allocation.amountCents;
    return {
      accountId: allocation.accountId,
      facilityId: allocation.facilityId,
      remitRecordId: allocation.recordId,
      remitCents: allocation.amountCents,
      depositCents: accountDeposit,
      expectedCents: ledgerRow ? ledgerRow.expected_amount_cents : null,
      differenceCents: diff,
      status: diff === null ? 'unknown' : diff === 0 ? 'matched' : 'variance',
    };
  });

  let status: CashStatus;
  if (!hasDeposit) status = 'unknown';
  else if (differenceCents !== 0 || accounts.some((a) => a.status === 'variance')) status = 'variance';
  else if (accounts.some((a) => a.status === 'unknown')) status = 'unknown';
  else status = 'matched';

  const depositDate = hasDeposit ? deposits.map((d) => d.deposit_date).sort()[0]! : null;
  const gapBusinessDays = depositDate === null ? null : businessDaysBetween(payment.paymentDate, depositDate);
  return {
    paymentReference: payment.paymentReference,
    remitCents: payment.totalCents,
    depositIds: deposits.map((d) => d.deposit_id),
    depositDate,
    depositCents,
    differenceCents,
    status,
    gapCalendarDays: depositDate === null ? null : calendarDaysBetween(payment.paymentDate, depositDate),
    gapBusinessDays,
    gapWithinWindow: gapBusinessDays === null ? null : Math.abs(gapBusinessDays) <= WINDOW_BUSINESS_DAYS,
    accounts,
  };
}
