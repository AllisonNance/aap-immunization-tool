import { describe, expect, it } from 'vitest';
import { addAge, ageBetween, checkDateInput, isValidISODate, isoToDateInput } from '@/lib/dates';

describe('addAge (calendar math)', () => {
  it('adds days and weeks', () => {
    expect(addAge('2026-01-30', { value: 3, unit: 'days' })).toBe('2026-02-02');
    expect(addAge('2026-01-01', { value: 4, unit: 'weeks' })).toBe('2026-01-29');
  });

  it('clamps months to the end of shorter months', () => {
    expect(addAge('2026-01-31', { value: 1, unit: 'months' })).toBe('2026-02-28');
    expect(addAge('2024-01-31', { value: 1, unit: 'months' })).toBe('2024-02-29');
    expect(addAge('2026-03-31', { value: -1, unit: 'months' })).toBe('2026-02-28');
  });

  it('adds years, including from Feb 29', () => {
    expect(addAge('2024-02-29', { value: 1, unit: 'years' })).toBe('2025-02-28');
    expect(addAge('2026-11-23', { value: 5, unit: 'years' }, -1)).toBe('2021-11-23');
  });
});

describe('ageBetween', () => {
  it('counts whole months', () => {
    expect(ageBetween('2026-05-23', '2026-11-22').months).toBe(5);
    expect(ageBetween('2026-05-23', '2026-11-23').months).toBe(6);
  });
});

describe('checkDateInput (month-name picker)', () => {
  const d = (year: string, month: string, day: string) => ({ year, month, day });

  it('builds an ISO date from parts', () => {
    expect(checkDateInput(d('2027', '3', '4'))).toEqual({ kind: 'valid', iso: '2027-03-04' });
    expect(checkDateInput(d(' 2027 ', '12', '31'))).toEqual({ kind: 'valid', iso: '2027-12-31' });
  });

  it('tells empty from incomplete from invalid', () => {
    expect(checkDateInput(d('', '', ''))).toEqual({ kind: 'empty' });
    expect(checkDateInput(d('2027', '3', ''))).toEqual({ kind: 'incomplete' });
    expect(checkDateInput(d('2027', '', '4'))).toEqual({ kind: 'incomplete' });
    expect(checkDateInput(d('2026', '2', '30'))).toEqual({ kind: 'invalid' });
    expect(checkDateInput(d('27', '3', '4'))).toEqual({ kind: 'invalid' });
    expect(checkDateInput(d('2027', '3', 'x'))).toEqual({ kind: 'invalid' });
  });

  it('allows month and year only when the day is optional', () => {
    expect(checkDateInput(d('2014', '2', ''), { requireDay: false })).toEqual({ kind: 'valid', iso: '2014-02-01' });
  });

  it('round-trips ISO dates', () => {
    expect(isoToDateInput('2025-03-20')).toEqual(d('2025', '3', '20'));
    expect(isoToDateInput(undefined)).toEqual(d('', '', ''));
  });
});

describe('isValidISODate', () => {
  it('rejects impossible dates', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('03/04/2026')).toBe(false);
    expect(isValidISODate('2026-02-28')).toBe(true);
  });
});
