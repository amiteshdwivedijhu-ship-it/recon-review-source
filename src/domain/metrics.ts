/**
 * Dates and the north star metric.
 * Business days are Monday to Friday. No holidays. A weekend date rolls forward to Monday.
 */
const DAY_MS = 86_400_000;
const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export const WINDOW_BUSINESS_DAYS = 3;

export function isWeekend(date: string): boolean {
  const day = toUtc(date).getUTCDay();
  return day === 0 || day === 6;
}

export function rollToBusinessDay(date: string): string {
  let d = toUtc(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + DAY_MS);
  return toIso(d);
}

/** The date n business days after the given date. */
export function addBusinessDays(date: string, n: number): string {
  let d = toUtc(rollToBusinessDay(date));
  for (let left = n; left > 0; ) {
    d = new Date(d.getTime() + DAY_MS);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left -= 1;
  }
  return toIso(d);
}

export function calendarDaysBetween(start: string, end: string): number {
  return Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / DAY_MS);
}

/** Business days from start to end. Both dates roll forward off a weekend first. */
export function businessDaysBetween(start: string, end: string): number {
  const from = rollToBusinessDay(start);
  const to = rollToBusinessDay(end);
  if (from === to) return 0;
  if (from > to) return -businessDaysBetween(to, from);
  let count = 0;
  for (let d = toUtc(from).getTime() + DAY_MS; d <= toUtc(to).getTime(); d += DAY_MS) {
    const day = new Date(d).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export interface MetricLine {
  caseId: string;
  accountId: string | null;
  amountCents: number;
  counted: boolean;
  reason: string;
}

export interface VerifiedInWindow {
  verifiedCents: number;
  receivedCents: number;
  windowBusinessDays: number;
  lines: MetricLine[];
}

/** The slice of a case this metric needs. Kept structural so this file imports no other domain module. */
interface MetricCase {
  caseId: string;
  cash: { depositDate: string | null; accounts: { accountId: string | null; remitCents: number; status: string }[] };
  postings: { accountId: string | null; status: string; transactions: { posted_at: string }[] }[];
}

/**
 * North star. A received dollar counts only when, for its account and facility,
 * cash is matched and a saved transaction proves posting within the window after deposit.
 */
export function verifiedInWindow(cases: MetricCase[], receivedCents: number): VerifiedInWindow {
  const lines: MetricLine[] = [];
  for (const c of cases) {
    c.cash.accounts.forEach((account, index) => {
      const posting = c.postings[index];
      const line = (counted: boolean, reason: string) =>
        lines.push({ caseId: c.caseId, accountId: account.accountId, amountCents: account.remitCents, counted, reason });
      if (account.status !== 'matched' || c.cash.depositDate === null) return line(false, 'Cash not matched.');
      if (!posting || posting.status === 'unknown') return line(false, 'Posting unknown.');
      if (posting.status === 'not_posted_confirmed') return line(false, 'Not posted.');
      if (posting.status !== 'verified_posted') return line(false, 'Posted amount differs.');
      const lastPosted = posting.transactions.map((t) => t.posted_at.slice(0, 10)).sort().at(-1)!;
      const days = businessDaysBetween(c.cash.depositDate, lastPosted);
      const span = `${days} business ${days === 1 ? 'day' : 'days'} after deposit`;
      if (days > WINDOW_BUSINESS_DAYS) return line(false, `Posting proven ${span}, outside the window.`);
      return line(true, `Cash matched and posting proven ${span}.`);
    });
  }
  return {
    verifiedCents: lines.filter((l) => l.counted).reduce((total, l) => total + l.amountCents, 0),
    receivedCents,
    windowBusinessDays: WINDOW_BUSINESS_DAYS,
    lines,
  };
}
