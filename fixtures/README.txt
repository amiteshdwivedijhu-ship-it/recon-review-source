EMBER PAYMENT RECONCILIATION SAMPLE DATA

Use this starter dataset with the three-hour take-home brief. All entities,
identifiers, dates, operators, and amounts are fictional. No patient names,
demographics, bank account details, screenshots, or production records are
included. The format is generic and requires no commercial system access.

FILES AND QUICK START

sample_data.json contains the full dataset. Load it directly into your
prototype. Your AI coding tool can help you inspect or reshape it. No server,
API key, external download, database, or data generator is needed. Include the
fixtures you use with your submission. Extra examples are optional.

There are four cases: three payments and one credit. Case A has two account
allocations, so the five remittance rows do not represent five deposits.
The packet includes three deposit records, four ledger payment records,
one saved posting transaction, and one credit record.

TOP-LEVEL SECTIONS

metadata: currency, units, fictional snapshot date, and schema version.
accounts: the one-to-one mapping between demo accounts and facilities.
payers: fictional payer IDs and display names.
case_index: links brief cases A through D to their records.
clearinghouse.remittance_records: source payment and allocation records.
cash_tracker.deposits: money received and its account allocation.
billing_ledger.payment_records: payment-level posting evidence per account.
billing_ledger.posting_transactions: saved transactions referenced by a ledger row.
billing_ledger.credit_balances: the separate credit investigation case.

MONEY AND MISSING DATA

All amounts use integer USD cents: 18000 = $180.00. Currency applies to every
record. Dates use YYYY-MM-DD; timestamps use UTC ISO 8601. The 2030 dates are
part of the fictional scenario, not current activity.

Null means unknown or not supplied. Zero means a known zero. An empty
posting_transaction_ids array means the supplied complete history has no
posting transactions. A null array means that history is unavailable.
posting_history_complete is scoped to that payment, account, and facility.

balance_cents uses the ledger convention: a negative value is a credit.
It does not by itself establish a refund amount, recipient, or cause.

RECORD LINKS AND FIELD MEANINGS

payment_reference connects remittance, deposit, ledger, and posting records.
Use account_id and facility_id for an individual allocation. The payer IDs
on remittance and ledger records refer to the payers section.

Remittance record_type is parent_payment, account_allocation, or single_payment.
For a parent_payment, amount_cents is the total payment. For account_allocation,
it is the component allocated to an account; parent_record_id identifies the
parent record. For single_payment, it is the unsplit payment amount. A parent
record has null account and facility IDs because it spans multiple accounts;
its children identify the destinations. These nulls mean not applicable.

Each deposit's allocations contain the parts of that deposit attributed to
each account. A deposit record's payment_reference identifies its remittance.

In payment_records, expected_amount_cents is the mock ledger's expected payment
for that reference and account, not a billed charge, contract rate, or bank
receipt. posted_amount_cents is its reported posted total. posting_status is
the source detail status; summary_status is a separate summary label that may
be stale. Preserve contradictory source evidence for the reviewer to inspect.

posting_transaction_ids links to transaction_id in posting_transactions.
Saved transactions supply the posting amount, actor, timestamp, and destination.
claim_review_status = null means that claim-level review has not been supplied.

Case D has no identified payment reference. Its missing histories are unknown,
not evidence that no refund or payer recovery exists. No matching remittance
or deposit is supplied for that credit.

CASE MAP

A: SYN-PAY-001, split payment with account-specific posting evidence.
B: SYN-PAY-002, matched source amounts with no saved posting transaction.
C: SYN-PAY-003, remittance and deposit amounts that differ.
D: SYN-CREDIT-004 / SYN-CLAIM-004, credit with missing supporting evidence.

Build the interactions for A through C. Address D in the specification only,
as described in the brief. Calculate comparisons from source values and
document any assumptions or additional fixtures you introduce.
