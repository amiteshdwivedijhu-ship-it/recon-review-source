import { describe, expect, it } from 'vitest';
import { buildAccountEvidence, buildPaymentEvidence } from '../../src/domain/evidence';
import { analyze } from '../../src/domain/findings';
import { fixture } from './helpers';

const ds = fixture();
const analysis = analyze(ds);
const caseOf = (id: string) => analysis.cases.find((c) => c.caseId === id)!;
const row = (rows: ReturnType<typeof buildAccountEvidence>, field: string) => rows.find((r) => r.field === field)!;

describe('evidence table rows', () => {
  it('never leaves a cell blank and never shows a null as $0.00', () => {
    for (const c of analysis.cases) {
      const tables = [buildPaymentEvidence(ds, c), ...c.postings.map((_, i) => buildAccountEvidence(ds, c, i))];
      for (const rows of tables) {
        for (const r of rows) {
          for (const cell of [r.remittance, r.deposit, r.ledger, r.difference]) {
            expect(cell.text.trim(), `${c.caseId} ${r.field}`).not.toBe('');
          }
        }
      }
    }
  });

  it('Account B: posted amount and transactions are Unknown, with the reason', () => {
    const rows = buildAccountEvidence(ds, caseOf('A'), 1);
    expect(row(rows, 'Posted amount').ledger).toMatchObject({ kind: 'unknown', text: 'Unknown', note: 'Not supplied' });
    expect(row(rows, 'Transaction').ledger).toMatchObject({ kind: 'unknown', text: 'Unknown', note: 'History unavailable' });
    expect(row(rows, 'Transaction').difference).toMatchObject({ tone: 'unknown', text: 'Cannot verify posting' });
    expect(row(rows, 'Claim review').ledger).toMatchObject({ kind: 'unknown', note: 'Not supplied' });
  });

  it('Case B: a known zero shows as $0.00, and an empty complete history as confirmed none', () => {
    const rows = buildAccountEvidence(ds, caseOf('B'), 0);
    expect(row(rows, 'Posted amount').ledger).toMatchObject({ kind: 'value', text: '$0.00', note: 'Known zero' });
    expect(row(rows, 'Transaction').ledger).toMatchObject({ kind: 'value', text: 'None', note: 'History complete' });
    expect(row(rows, 'Transaction').difference.text).toBe('Confirmed not posted');
  });

  it('Account A: shows the saved transaction and the label conflict', () => {
    const rows = buildAccountEvidence(ds, caseOf('A'), 0);
    expect(row(rows, 'Amount')).toMatchObject({
      remittance: { text: '$180.00' },
      deposit: { text: '$180.00' },
      ledger: { text: '$180.00', note: 'Expected' },
      difference: { text: 'Match', tone: 'ok' },
    });
    expect(row(rows, 'Transaction').ledger).toMatchObject({ text: 'POST-001', note: 'Saved, $180.00, by DEMO-OPERATOR-01, 2030-04-04 09:00 UTC' });
    expect(row(rows, 'Status').ledger).toMatchObject({ text: 'Detail: posted', note: 'Summary label: unposted (label only, not proof)' });
    expect(row(rows, 'Status').difference).toMatchObject({ tone: 'warn', text: 'Label conflicts with transaction' });
    expect(row(rows, 'Payer').deposit).toMatchObject({ kind: 'na', text: 'Not in this source' });
  });

  it('Case C: the amount row shows the $25.00 shortfall', () => {
    const rows = buildAccountEvidence(ds, caseOf('C'), 0);
    expect(row(rows, 'Amount').difference).toMatchObject({ tone: 'bad', text: 'Deposit short by $25.00' });
  });

  it('whole payment table counts the split once', () => {
    const rows = buildPaymentEvidence(ds, caseOf('A'));
    expect(row(rows, 'Amount')).toMatchObject({
      remittance: { text: '$480.00', note: 'Parent payment, counted once' },
      deposit: { text: '$480.00' },
      ledger: { text: '$480.00', note: 'Sum of 2 ledger rows' },
      difference: { text: 'Match', tone: 'ok' },
    });
    expect(row(rows, 'Split').remittance.text).toBe('$180.00 + $300.00');
    expect(row(rows, 'Split').difference).toMatchObject({ text: 'Adds up to $480.00', tone: 'ok' });
    expect(row(rows, 'Date').difference.text).toBe('Deposit 1 day after remittance');
  });
});
