import { describe, expect, it } from 'vitest';
import { formatCents, formatPercent, isCents } from '../../src/domain/money';

describe('money', () => {
  it('formats integer cents as dollars with thousands separators', () => {
    expect(formatCents(107000)).toBe('$1,070.00');
    expect(formatCents(18000)).toBe('$180.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });
  it('formats a known zero as $0.00', () => {
    expect(formatCents(0)).toBe('$0.00');
  });
  it('formats a negative amount with a plain hyphen', () => {
    expect(formatCents(-9000)).toBe('-$90.00');
  });
  it('refuses non-integer or non-finite cents', () => {
    expect(() => formatCents(10.5)).toThrow();
    expect(() => formatCents(Number.NaN)).toThrow();
    expect(isCents(10.5)).toBe(false);
    expect(isCents('100')).toBe(false);
    expect(isCents(null)).toBe(false);
    expect(isCents(100)).toBe(true);
  });
  it('formats a share to one decimal place using integer math', () => {
    expect(formatPercent(18000, 107000)).toBe('16.8%');
    expect(formatPercent(0, 107000)).toBe('0.0%');
    expect(formatPercent(107000, 107000)).toBe('100.0%');
    expect(formatPercent(1, 0)).toBe('Not available');
  });
});
