import { describe, expect, it } from 'vitest';
import { generateCalendarWeeks, getOccurrenceForYear, parseBirthdayToDate, startOfWeek } from '../utils';

describe('birthday calendar utils', () => {
  it('parses a variety of birthday formats', () => {
    const year = 2025;
    const hyphen = parseBirthdayToDate('15-04', year);
    const slash = parseBirthdayToDate('3/11', year);
    const text = parseBirthdayToDate('7 May', year);

    expect(hyphen).not.toBeNull();
    expect(hyphen?.getMonth()).toBe(3);
    expect(hyphen?.getDate()).toBe(15);

    expect(slash).not.toBeNull();
    expect(slash?.getMonth()).toBe(10);
    expect(slash?.getDate()).toBe(3);

    expect(text).not.toBeNull();
    expect(text?.getMonth()).toBe(4);
    expect(text?.getDate()).toBe(7);
  });

  it('returns null for unparseable birthday values', () => {
    expect(parseBirthdayToDate('not a date', 2025)).toBeNull();
    expect(parseBirthdayToDate(null, 2025)).toBeNull();
  });

  it('starts weeks on Monday', () => {
    const sunday = new Date(2024, 8, 1); // Sunday, September 1, 2024
    const weekStart = startOfWeek(sunday);

    expect(weekStart.getDay()).toBe(1);
    expect(weekStart.getDate()).toBe(26);
    expect(weekStart.getMonth()).toBe(7); // August

    const monday = new Date(2024, 8, 2); // Monday
    const sameMonday = startOfWeek(monday);
    expect(sameMonday.getDate()).toBe(2);
    expect(sameMonday.getMonth()).toBe(8);
  });

  it('generates calendar weeks covering the entire month', () => {
    const month = new Date(2025, 0, 1); // January 2025
    const weeks = generateCalendarWeeks(month);
    const flattened = weeks.flat();

    expect(weeks[0][0].getDay()).toBe(1); // Monday
    expect(weeks.at(-1)?.at(-1)?.getDay()).toBe(0); // Sunday
    expect(flattened.some((d) => d.getDate() === 1 && d.getMonth() === 0)).toBe(true);
    expect(flattened.some((d) => d.getDate() === 31 && d.getMonth() === 0)).toBe(true);
  });

  it('handles leap-day birthdays gracefully across years', () => {
    const entry = { month: 1, day: 29 };
    const leap = getOccurrenceForYear(entry, 2024);
    const nonLeap = getOccurrenceForYear(entry, 2025);

    expect(leap.getMonth()).toBe(1);
    expect(leap.getDate()).toBe(29);
    expect(nonLeap.getMonth()).toBe(1);
    expect(nonLeap.getDate()).toBe(28);
  });
});
