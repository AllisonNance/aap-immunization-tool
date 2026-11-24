import { describe, expect, it } from 'vitest';
import { schedule } from '@/lib/data';
import { emptyDateInput, isoToDateInput } from '@/lib/dates';
import { validateCustomVaccine, validateDoseForm, type DoseFormValues } from '@/lib/validation/dose';

const dob = '2026-01-10';
const today = '2026-11-23';
const doseData = (v: string, n: number) => schedule.series.find((s) => s.vaccineId === v)!.doses.find((d) => d.dose === n)!;
const form = (over: Partial<DoseFormValues>): DoseFormValues => ({
  status: 'received',
  dateGiven: emptyDateInput,
  postponedUntil: emptyDateInput,
  applyToRest: true,
  reactionNotes: '',
  doctorNote: '',
  ...over,
});

describe('Dose Edit validation (SPEC.md §6.4)', () => {
  it('requires a real date for a received dose', () => {
    expect(validateDoseForm(form({}), { dob, today }).errors).toEqual({ dateGiven: 'dateRequired' });
    expect(validateDoseForm(form({ dateGiven: { year: '2026', month: '2', day: '30' } }), { dob, today }).errors).toEqual({
      dateGiven: 'dateInvalid',
    });
  });

  it('blocks a date before birth or in the future', () => {
    const ctx = { dob, today, dose: doseData('hepb', 1) };
    expect(validateDoseForm(form({ dateGiven: isoToDateInput('2026-01-09') }), ctx).errors.dateGiven).toBe('beforeBirth');
    expect(validateDoseForm(form({ dateGiven: isoToDateInput('2026-11-24') }), ctx).errors.dateGiven).toBe('inFuture');
  });

  it('warns, without blocking, on a date before the minimum age or too soon after the previous dose', () => {
    const early = validateDoseForm(form({ dateGiven: isoToDateInput('2026-02-10') }), { dob, today, dose: doseData('rotavirus', 1) });
    expect(early).toMatchObject({ valid: true, warnings: ['beforeMinimumAge'], dates: { dateGiven: '2026-02-10' } });
    const close = validateDoseForm(form({ dateGiven: isoToDateInput('2026-04-01') }), {
      dob,
      today,
      dose: doseData('dtap', 2),
      previousDate: '2026-03-20',
    });
    expect(close).toMatchObject({ valid: true, warnings: ['intervalTooShort'] });
  });

  it('checks dates for vaccines outside the dose series (flu) against birth and today only', () => {
    expect(validateDoseForm(form({ dateGiven: isoToDateInput('2026-10-01') }), { dob, today })).toMatchObject({ valid: true, warnings: [] });
    expect(validateDoseForm(form({ dateGiven: isoToDateInput('2025-10-01') }), { dob, today }).errors.dateGiven).toBe('beforeBirth');
  });

  it('needs a new date, today or later, when delayed (postponed)', () => {
    expect(validateDoseForm(form({ status: 'postponed' }), { dob, today }).errors).toEqual({ postponedUntil: 'dateRequired' });
    expect(validateDoseForm(form({ status: 'postponed', postponedUntil: isoToDateInput('2026-11-22') }), { dob, today }).errors).toEqual({
      postponedUntil: 'inPast',
    });
    expect(validateDoseForm(form({ status: 'postponed', postponedUntil: isoToDateInput(today) }), { dob, today })).toMatchObject({
      valid: true,
      dates: { postponedUntil: today },
    });
  });

  it('needs no date for not sure, not given or exemption', () => {
    for (const status of ['notSure', 'notGiven', 'declined', 'exemption'] as const) {
      expect(validateDoseForm(form({ status }), { dob, today }).valid).toBe(true);
    }
  });
});

describe('Custom Vaccine validation (SPEC.md §6.4d)', () => {
  const ctx = { dob: '2014-09-24', today: '2026-11-23' };
  it('needs the name as written and a month and year; the day is optional', () => {
    expect(validateCustomVaccine({ nameAsWritten: '', dateGiven: emptyDateInput }, ctx).errors).toEqual({
      nameAsWritten: 'nameRequired',
      dateGiven: 'dateRequired',
    });
    expect(validateCustomVaccine({ nameAsWritten: 'BCG', dateGiven: { year: '2014', month: '9', day: '' } }, ctx)).toMatchObject({
      valid: true,
      parts: { year: 2014, month: 9 },
    });
    expect(validateCustomVaccine({ nameAsWritten: 'BCG', dateGiven: { year: '2014', month: '9', day: '26' } }, ctx).parts).toEqual({
      year: 2014,
      month: 9,
      day: 26,
    });
  });

  it('rejects dates before birth or in the future', () => {
    expect(validateCustomVaccine({ nameAsWritten: 'BCG', dateGiven: { year: '2014', month: '8', day: '' } }, ctx).errors.dateGiven).toBe('beforeBirth');
    expect(validateCustomVaccine({ nameAsWritten: 'BCG', dateGiven: { year: '2014', month: '9', day: '20' } }, ctx).errors.dateGiven).toBe('beforeBirth');
    expect(validateCustomVaccine({ nameAsWritten: 'BCG', dateGiven: { year: '2027', month: '1', day: '' } }, ctx).errors.dateGiven).toBe('inFuture');
  });
});
