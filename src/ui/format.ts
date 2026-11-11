/**
 * Display helpers. Everything is shown in UTC on one timeline:
 * the data is fictional, and reviewer actions use the demo clock, which starts at the data snapshot.
 */
const DATA_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const ACTION_TIME = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const formatDataDate = (date: string) => DATA_DATE.format(new Date(`${date}T00:00:00Z`));
export const formatShortDate = (date: string) => SHORT_DATE.format(new Date(`${date}T00:00:00Z`));
export const formatActionTime = (iso: string) => `${ACTION_TIME.format(new Date(iso))} UTC`;

/** The demo's "today": the date of the data snapshot, as YYYY-MM-DD. */
export const demoToday = (snapshotAt: string) => snapshotAt.slice(0, 10);
