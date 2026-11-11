import type { DifferenceCell, EvidenceRow, SourceCell } from '../domain/evidence';
import { StatusPill, UnknownValue } from './StatusPill';

function Source({ cell }: { cell: SourceCell }) {
  if (cell.kind === 'unknown') return <UnknownValue note={cell.note} />;
  if (cell.kind === 'na') return <span className="text-xs text-muted/80">{cell.text}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium tabular-nums text-ink">{cell.text}</span>
      {cell.note ? <span className="text-xs text-muted">{cell.note}</span> : null}
    </span>
  );
}

/** Agreement is the quiet case. Only a difference, a conflict, or a gap gets a pill. */
function Difference({ cell }: { cell: DifferenceCell }) {
  if (cell.tone === 'none') return <span className="text-xs text-muted">{cell.text}</span>;
  if (cell.tone === 'ok') {
    return (
      <span data-tone="ok" className="inline-flex items-baseline gap-1.5 text-xs font-medium text-ok-fg">
        <span aria-hidden="true" className="font-bold">✓</span>
        {cell.text}
      </span>
    );
  }
  return (
    <span className="inline-block max-w-full whitespace-normal">
      <StatusPill tone={cell.tone} wrap>
        {cell.text}
      </StatusPill>
    </span>
  );
}

const needsAttention = (row: EvidenceRow) => row.difference.tone === 'bad' || row.difference.tone === 'warn' || row.difference.tone === 'unknown';
/** A field that only the billing ledger carries. It gets one wide cell, not two empty ones. */
const ledgerOnly = (row: EvidenceRow) => row.remittance.kind === 'na' && row.deposit.kind === 'na';

function Row({ row }: { row: EvidenceRow }) {
  const flagged = needsAttention(row);
  const cell = 'px-4 py-2';
  return (
    <tr data-field={row.field} data-flagged={flagged} className="border-b border-line align-top last:border-0">
      <th scope="row" className={`${cell} text-xs ${flagged ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
        {row.field}
      </th>
      {ledgerOnly(row) ? (
        <td colSpan={3} className={cell}>
          <Source cell={row.ledger} />
        </td>
      ) : (
        <>
          <td className={cell}><Source cell={row.remittance} /></td>
          <td className={cell}><Source cell={row.deposit} /></td>
          <td className={cell}><Source cell={row.ledger} /></td>
        </>
      )}
      <td className={`${cell} border-l border-tint-border bg-tint`}><Difference cell={row.difference} /></td>
    </tr>
  );
}

/**
 * Three sources side by side, one field per row.
 * The last column is the only calculated one, and it is tinted to say so.
 * Fields that exist only in the billing ledger sit in their own group below.
 */
export function EvidenceTable({ caption, rows, testId }: { caption: string; rows: EvidenceRow[]; testId: string }) {
  const compared = rows.filter((row) => !ledgerOnly(row));
  const ledgerRows = rows.filter(ledgerOnly);
  const flagged = rows.filter(needsAttention).length;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table data-testid={testId} className="w-full min-w-[760px] table-fixed text-left text-sm">
        <caption className="border-b border-line bg-surface-2 px-4 py-2 text-left text-sm font-semibold text-ink">
          <span className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span>{caption}</span>
            <span data-testid="evidence-count" className={`text-xs font-medium ${flagged > 0 ? 'text-warn-fg' : 'text-muted'}`}>
              {flagged === 0 ? 'Every row agrees' : `${flagged} of ${rows.length} rows need a look`}
            </span>
          </span>
        </caption>
        <colgroup>
          <col className="w-[14%]" />
          <col className="w-[21%]" />
          <col className="w-[19%]" />
          <col className="w-[23%]" />
          <col className="w-[23%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-xs">
            <th scope="col" className="px-4 py-2 font-medium text-muted">Field</th>
            <th scope="col" className="px-4 py-2 font-semibold text-ink">Remittance</th>
            <th scope="col" className="px-4 py-2 font-semibold text-ink">Deposit</th>
            <th scope="col" className="px-4 py-2 font-semibold text-ink">Billing ledger</th>
            <th scope="col" className="border-l border-tint-border bg-tint px-4 py-2 font-semibold text-primary">
              Difference <span className="font-normal">(system calculated)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {compared.map((row) => (
            <Row key={row.field} row={row} />
          ))}
        </tbody>
        {ledgerRows.length > 0 ? (
          <tbody data-testid="ledger-only">
            <tr className="border-y border-line bg-surface-2 text-xs">
              <th scope="colgroup" colSpan={5} className="px-4 py-1.5 font-semibold text-ink">
                Billing ledger only <span className="font-normal text-muted">· posting evidence. The remittance and deposit carry no such fields.</span>
              </th>
            </tr>
            {ledgerRows.map((row) => (
              <Row key={row.field} row={row} />
            ))}
          </tbody>
        ) : null}
      </table>
    </div>
  );
}
