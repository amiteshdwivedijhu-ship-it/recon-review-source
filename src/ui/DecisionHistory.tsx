import type { HistoryEntry } from '../domain/history';
import { formatActionTime } from './format';

export function DecisionHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <section aria-labelledby="history-heading" className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="history-heading" className="text-base font-semibold">
          Decision history
        </h2>
        <p className="text-xs text-muted">Newest first. Kept in memory only, so it resets on refresh.</p>
      </div>
      {entries.length === 0 ? (
        <p data-testid="history-empty" className="mt-3 rounded-lg border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          No decisions yet. Each action you take on this case is logged here.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table data-testid="history" className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Time</th>
                <th scope="col" className="py-2 pr-4 font-medium">Who</th>
                <th scope="col" className="py-2 pr-4 font-medium">Action</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status change</th>
                <th scope="col" className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap py-2.5 pr-4 text-muted">{formatActionTime(entry.at)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4">{entry.actor}</td>
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">{entry.action}</div>
                    <div className="text-xs text-muted">{entry.subject}</div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    {entry.from === entry.to ? entry.to : `${entry.from} to ${entry.to}`}
                  </td>
                  <td className="py-2.5 text-muted">{entry.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
