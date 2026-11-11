import type { Cents } from './types';

/** True only for whole-number cents. Text, floats, null, and NaN are refused. */
export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Format integer cents as dollars. Only call this at render time. */
export function formatCents(cents: Cents): string {
  if (!isCents(cents)) throw new Error(`Not integer cents: ${String(cents)}`);
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${cents < 0 ? '-' : ''}$${dollars}.${rest}`;
}

/** Share of a total, to one decimal place, using integer math only. */
export function formatPercent(part: Cents, whole: Cents): string {
  if (!isCents(part) || !isCents(whole) || whole <= 0) return 'Not available';
  const tenths = Math.round((part * 1000) / whole);
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}
