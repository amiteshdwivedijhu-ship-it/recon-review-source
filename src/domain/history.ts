export const ACTOR = 'Demo reviewer';

/** One line in the decision history. Written once, never edited. */
export interface HistoryEntry {
  id: number;
  at: string;
  actor: string;
  caseId: string;
  findingId: string | null;
  /** What the action was about: a finding title or "Posting decision". */
  subject: string;
  action: string;
  from: string;
  to: string;
  note: string;
}

export function appendHistory(history: HistoryEntry[], entry: Omit<HistoryEntry, 'id' | 'actor'>): HistoryEntry[] {
  return [...history, { ...entry, id: history.length + 1, actor: ACTOR }];
}

/** Newest first. */
export function historyForCase(history: HistoryEntry[], caseId: string): HistoryEntry[] {
  return history.filter((h) => h.caseId === caseId).sort((a, b) => b.id - a.id);
}

export function lastAction(history: HistoryEntry[], caseId: string): HistoryEntry | null {
  return historyForCase(history, caseId)[0] ?? null;
}
