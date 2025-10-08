import moment from 'moment';

export interface BirthdayLike {
  month: number;
  day: number;
}

export function parseBirthdayToDate(bday: unknown, year: number): Date | null {
  if (!bday) return null;
  const s = String(bday).trim();
  const formats = ['DD-MM', 'D-M', 'DD/MM', 'D/M', 'D MMMM', 'D MMM'];
  for (const fmt of formats) {
    const m = moment(s, fmt, true);
    if (m.isValid()) return new Date(year, m.month(), m.date());
  }
  const loose = moment(s);
  if (loose.isValid()) return new Date(year, loose.month(), loose.date());
  const nums = s.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  let month: number | null = null;
  let day: number | null = null;
  if (nums.length >= 3) {
    const [n1, n2, n3] = nums.map(Number);
    if (n1 > 31) {
      month = n2;
      day = n3;
    } else if (n3 > 31) {
      month = n2;
      day = n1;
    } else {
      month = n1;
      day = n2;
    }
  } else if (nums.length === 2) {
    const [n1, n2] = nums.map(Number);
    month = n1;
    day = n2;
  }
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function startOfWeek(date: Date): Date {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = base.getDay();
  const diff = (day + 6) % 7; // Monday as the first day of the week
  return addDays(base, -diff);
}

export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getOccurrenceForYear(entry: BirthdayLike, year: number): Date {
  const candidate = new Date(year, entry.month, entry.day);
  if (candidate.getMonth() !== entry.month) {
    return new Date(year, entry.month + 1, 0);
  }
  return candidate;
}

export function generateCalendarWeeks(currentMonth: Date): Date[][] {
  const weeks: Date[][] = [];
  const start = startOfWeek(startOfMonth(currentMonth));
  const end = endOfWeek(endOfMonth(currentMonth));
  let cursor = start;
  while (cursor <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
