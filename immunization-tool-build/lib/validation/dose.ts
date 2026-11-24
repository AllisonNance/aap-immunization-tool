// Dose Edit (screen 4) validation, SPEC.md §6.4 and §7 rule 3. Received dates
// are checked against the DOB, the minimum age and the minimum interval from
// the previous received dose: impossible dates block, unusual ones warn.
import type { DoseStatus } from '@/lib/api/schemas';
import type { ScheduleDose } from '@/lib/data/schemas';
import { checkDateInput, compareISO, type DateInput } from '@/lib/dates';
import { blockingIssues, checkDoseDate, type DoseIssue } from '@/lib/schedule';

export interface DoseFormValues {
  status: DoseStatus;
  dateGiven: DateInput; // received
  postponedUntil: DateInput; // postponed
  applyToRest: boolean; // exemption
  reactionNotes: string;
  doctorNote: string;
}

export type DoseDateError = 'dateRequired' | 'dateInvalid' | 'beforeBirth' | 'inFuture' | 'inPast';

export interface DoseFormResult {
  errors: { dateGiven?: DoseDateError; postponedUntil?: DoseDateError };
  /** Unusual but possible (save is allowed). */
  warnings: DoseIssue[];
  valid: boolean;
  dates: { dateGiven?: string; postponedUntil?: string };
}

function fullDate(input: DateInput): { iso?: string; error?: DoseDateError } {
  const c = checkDateInput(input);
  if (c.kind === 'empty' || c.kind === 'incomplete') return { error: 'dateRequired' };
  if (c.kind === 'invalid') return { error: 'dateInvalid' };
  return { iso: c.iso };
}

/** A target date (postponed / planned): a real date, today or later. */
function futureDate(input: DateInput, today: string): { iso?: string; error?: DoseDateError } {
  const r = fullDate(input);
  if (r.iso && compareISO(r.iso, today) < 0) return { error: 'inPast' };
  return r;
}

export function validateDoseForm(
  values: DoseFormValues,
  ctx: { dob: string; today: string; dose?: ScheduleDose; previousDate?: string },
): DoseFormResult {
  const errors: DoseFormResult['errors'] = {};
  const dates: DoseFormResult['dates'] = {};
  let warnings: DoseIssue[] = [];

  if (values.status === 'received') {
    const r = fullDate(values.dateGiven);
    if (r.error) errors.dateGiven = r.error;
    else {
      const issues = ctx.dose
        ? checkDoseDate({ dateGiven: r.iso!, dob: ctx.dob, today: ctx.today, dose: ctx.dose, previousDate: ctx.previousDate })
        : ([compareISO(r.iso!, ctx.dob) < 0 && 'beforeBirth', compareISO(r.iso!, ctx.today) > 0 && 'inFuture'].filter(Boolean) as DoseIssue[]);
      const blocking = issues.find((i) => blockingIssues.has(i));
      if (blocking) errors.dateGiven = blocking as DoseDateError;
      warnings = issues.filter((i) => !blockingIssues.has(i));
      dates.dateGiven = r.iso;
    }
  }
  if (values.status === 'postponed') {
    const r = futureDate(values.postponedUntil, ctx.today);
    if (r.error) errors.postponedUntil = r.error;
    dates.postponedUntil = r.iso;
  }
  return { errors, warnings, valid: Object.keys(errors).length === 0, dates };
}

// ---------- Custom Vaccine (4d) ----------

export type CustomError = 'nameRequired' | 'dateRequired' | 'dateInvalid' | 'beforeBirth' | 'inFuture';

/** Name as written required; date given: month + year required, day optional; not before birth or in the future. */
export function validateCustomVaccine(values: { nameAsWritten: string; dateGiven: DateInput }, ctx: { dob: string; today: string }) {
  const errors: { nameAsWritten?: CustomError; dateGiven?: CustomError } = {};
  if (!values.nameAsWritten.trim()) errors.nameAsWritten = 'nameRequired';
  const c = checkDateInput(values.dateGiven, { requireDay: false });
  let parts: { year: number; month: number; day?: number } | undefined;
  if (c.kind === 'empty' || c.kind === 'incomplete') errors.dateGiven = 'dateRequired';
  else if (c.kind === 'invalid') errors.dateGiven = 'dateInvalid';
  else {
    const hasDay = !!values.dateGiven.day.trim();
    // Without a day, compare by month so "same month as birth" isn't "before birth".
    const cmp = (a: string, b: string) => (hasDay ? compareISO(a, b) : compareISO(a.slice(0, 7), b.slice(0, 7)));
    if (cmp(c.iso, ctx.dob) < 0) errors.dateGiven = 'beforeBirth';
    else if (cmp(c.iso, ctx.today) > 0) errors.dateGiven = 'inFuture';
    const [y, m, d] = c.iso.split('-').map(Number);
    parts = { year: y, month: m, ...(hasDay ? { day: d } : {}) };
  }
  return { errors, valid: Object.keys(errors).length === 0, parts };
}
