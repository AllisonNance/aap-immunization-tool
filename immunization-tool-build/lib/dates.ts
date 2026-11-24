// Calendar math on ISO dates (YYYY-MM-DD). Pure, UTC-based, no time zones.
// Ages in the schedule data are { value, unit } and are added to the DOB by
// calendar math (SPEC.md §5b): months/years clamp to the last day of the month.

export type AgeUnit = 'days' | 'weeks' | 'months' | 'years';
export interface Age {
  value: number;
  unit: AgeUnit;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISODate(iso: string): Date {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== iso) throw new Error(`Invalid date: ${iso}`);
  return d;
}

export function isValidISODate(iso: string): boolean {
  try {
    parseISODate(iso);
    return true;
  } catch {
    return false;
  }
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(now: Date = new Date()): string {
  // The caregiver's local calendar day, not UTC.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsClamped(d: Date, months: number): Date {
  const total = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day));
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Adds (or with sign = -1, subtracts) an age to a date. */
export function addAge(iso: string, age: Age, sign: 1 | -1 = 1): string {
  const v = age.value * sign;
  switch (age.unit) {
    case 'days':
      return addDays(iso, v);
    case 'weeks':
      return addDays(iso, v * 7);
    case 'months':
      return toISODate(addMonthsClamped(parseISODate(iso), v));
    case 'years':
      return toISODate(addMonthsClamped(parseISODate(iso), v * 12));
  }
}

/**
 * A date as typed in the month-name picker: month chosen by name, day and year
 * typed. Strings, because they're raw form input ('' when empty). Picking the
 * month by name means day-first and month-first dates can't be confused.
 */
export interface DateInput {
  year: string;
  month: string; // '1'–'12', or ''
  day: string;
}

export const emptyDateInput: DateInput = { year: '', month: '', day: '' };

export type DateInputCheck =
  | { kind: 'empty' }
  | { kind: 'incomplete' }
  | { kind: 'invalid' }
  | { kind: 'valid'; iso: string };

/** Turns picker input into an ISO date. `requireDay: false` allows month + year only (custom vaccines). */
export function checkDateInput(input: DateInput, opts: { requireDay?: boolean } = {}): DateInputCheck {
  const requireDay = opts.requireDay ?? true;
  const year = input.year.trim();
  const month = input.month.trim();
  const day = input.day.trim();
  if (!year && !month && !day) return { kind: 'empty' };
  if (!year || !month || (requireDay && !day)) return { kind: 'incomplete' };
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || (day && !/^\d{1,2}$/.test(day))) return { kind: 'invalid' };
  const iso = `${year}-${month.padStart(2, '0')}-${(day || '1').padStart(2, '0')}`;
  return isValidISODate(iso) ? { kind: 'valid', iso } : { kind: 'invalid' };
}

export function isoToDateInput(iso: string | undefined): DateInput {
  if (!iso || !isValidISODate(iso)) return emptyDateInput;
  const [y, m, d] = iso.split('-');
  return { year: y, month: String(Number(m)), day: String(Number(d)) };
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole calendar months and days from `from` to `to` (to >= from). */
export function ageBetween(from: string, to: string): { years: number; months: number; days: number } {
  const a = parseISODate(from);
  const b = parseISODate(to);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (toISODate(addMonthsClamped(a, months)) > to) months -= 1;
  const anchor = addMonthsClamped(a, months);
  const days = Math.round((b.getTime() - anchor.getTime()) / 86_400_000);
  return { years: Math.floor(months / 12), months, days };
}
