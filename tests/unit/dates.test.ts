import { describe, expect, it } from 'vitest';
import { addBusinessDays, businessDaysBetween, calendarDaysBetween, isWeekend, rollToBusinessDay } from '../../src/domain/metrics';

describe('business day counter (Monday to Friday, no holidays)', () => {
  it('knows the fictional 2030 calendar', () => {
    expect(isWeekend('2030-04-03')).toBe(false); // Wednesday
    expect(isWeekend('2030-04-06')).toBe(true); // Saturday
    expect(isWeekend('2030-04-07')).toBe(true); // Sunday
  });
  it('rolls a weekend date forward to Monday and leaves weekdays alone', () => {
    expect(rollToBusinessDay('2030-04-06')).toBe('2030-04-08');
    expect(rollToBusinessDay('2030-04-07')).toBe('2030-04-08');
    expect(rollToBusinessDay('2030-04-05')).toBe('2030-04-05');
  });
  it('counts Wednesday to Thursday as 1 business day', () => {
    expect(businessDaysBetween('2030-04-03', '2030-04-04')).toBe(1);
  });
  it('counts the same day as 0', () => {
    expect(businessDaysBetween('2030-04-03', '2030-04-03')).toBe(0);
  });
  it('skips the weekend: Friday to Monday is 1', () => {
    expect(businessDaysBetween('2030-04-05', '2030-04-08')).toBe(1);
  });
  it('treats a Saturday start as the next Monday', () => {
    expect(businessDaysBetween('2030-04-06', '2030-04-08')).toBe(0);
    expect(businessDaysBetween('2030-04-06', '2030-04-09')).toBe(1);
  });
  it('counts a full week as 5', () => {
    expect(businessDaysBetween('2030-04-01', '2030-04-08')).toBe(5);
  });
  it('returns a negative count when the end is before the start', () => {
    expect(businessDaysBetween('2030-04-04', '2030-04-03')).toBe(-1);
  });
  it('counts calendar days', () => {
    expect(calendarDaysBetween('2030-04-02', '2030-04-03')).toBe(1);
    expect(calendarDaysBetween('2030-03-31', '2030-04-02')).toBe(2);
  });
});

describe('suggested due date', () => {
  it('is three business days after the snapshot date, skipping the weekend', () => {
    expect(addBusinessDays('2030-04-10', 3)).toBe('2030-04-15'); // Wednesday to Monday
    expect(addBusinessDays('2030-04-06', 1)).toBe('2030-04-09'); // Saturday rolls to Monday first
    expect(addBusinessDays('2030-04-10', 0)).toBe('2030-04-10');
  });
});
