// Scan (4b/4c): reading printed dates, the mock OCR fitted to a child, and
// the Review Scan rules (SPEC.md §6.4c).
import { describe, expect, it } from 'vitest';
import scanFixtureJson from '@/data/fixtures/scan-extraction.json';
import type { DoseRecord, ExtractedDose } from '@/lib/api/schemas';
import { schedule } from '@/lib/data';
import { scanFixtureSchema } from '@/lib/data/schemas';
import { addAge } from '@/lib/dates';
import { readRawDate } from '@/lib/scan/rawDate';
import { assignDoseNumbers, initReview, itemBlockers, itemFlags, reviewSummary, toCommit, type ReviewContext, type ReviewItem } from '@/lib/scan/review';
import { fitScanToBirthDate } from '@/mocks/services';

const fixture = scanFixtureSchema.parse(scanFixtureJson).extracted;

describe('printed dates', () => {
  it('reads both orders when the first two parts could each be a month', () => {
    expect(readRawDate('03/04/2015')).toEqual({ ambiguous: true, options: ['2015-03-04', '2015-04-03'] });
  });
  it('reads one date when only one order is possible', () => {
    expect(readRawDate('15/02/2014')).toEqual({ ambiguous: false, options: ['2014-02-15'] });
    expect(readRawDate('05/05/2014')).toEqual({ ambiguous: false, options: ['2014-05-05'] });
  });
  it('rejects text that is not a date', () => {
    expect(readRawDate('n/a')).toEqual({ ambiguous: false, options: [] });
  });
});

describe('mock OCR fitted to the scanned child', () => {
  // Every birth month across two years: the card always shows one of each flag.
  const dobs = Array.from({ length: 24 }, (_, i) => addAge('2013-01-20', { value: i, unit: 'months' }));
  it.each(dobs)('keeps one of each flag for a child born %s', (dob) => {
    const out = fitScanToBirthDate(fixture, dob);
    const flags = new Set(out.flatMap((e) => e.flags));
    expect([...flags].sort()).toEqual(['ambiguousDate', 'beforeBirth', 'duplicate', 'intervalTooShort', 'unrecognized']);
    // BCG (unrecognized) lands a couple of days to a month after birth, not before it.
    const bcg = out.find((e) => e.rawName === 'BCG')!;
    expect(bcg.parsedDate! >= dob).toBe(true);
  });
});

describe('Review Scan rules', () => {
  const dob = '2014-09-24';
  const ctx = (doses: DoseRecord[] = []): ReviewContext => ({ dob, today: '2026-11-23', doses, schedule });
  const extracted = fitScanToBirthDate(fixture, dob);
  const byName = (items: ReviewItem[], name: string) => items.find((i) => i.rawName === name)!;

  it('starts with duplicates removed and ambiguous dates unresolved', () => {
    const items = initReview(extracted, ctx());
    expect(byName(items, 'Polio').decision).toBe('remove');
    expect(byName(items, 'DPT')).toMatchObject({ decision: 'confirm', date: undefined, dateOptions: expect.any(Array) });
    expect(itemFlags(byName(items, 'DPT'), ctx())).toContain('ambiguousDate');
    expect(itemFlags(byName(items, 'BCG'), ctx())).toContain('unrecognized');
  });

  it('blocks Save while a kept dose has an unresolved ambiguous date or is before birth', () => {
    let items = initReview(extracted, ctx());
    expect(reviewSummary(items, ctx()).canSave).toBe(false);
    expect(itemBlockers(byName(items, 'DPT'), ctx())).toEqual(['ambiguousDate']);
    expect(itemBlockers(byName(items, 'Hep B'), ctx())).toEqual(['ambiguousDate', 'beforeBirth']);
    expect(itemBlockers(byName(items, 'BCG'), ctx())).toEqual(['needsVaccine']);

    const dpt = byName(items, 'DPT');
    items = items.map((i) => {
      if (i.rawName === 'DPT') return { ...i, date: dpt.dateOptions![1] };
      if (i.rawName === 'Hep B') return { ...i, decision: 'remove' as const };
      if (i.rawName === 'BCG') return { ...i, decision: 'custom' as const };
      return i;
    });
    expect(reviewSummary(items, ctx())).toMatchObject({ canSave: true, doses: 3, custom: 1, blocked: 0 });
  });

  it('a removed item never blocks', () => {
    const items = initReview(extracted, ctx()).map((i) => ({ ...i, decision: 'remove' as const }));
    expect(items.every((i) => itemBlockers(i, ctx()).length === 0)).toBe(true);
    expect(reviewSummary(items, ctx()).canSave).toBe(false); // nothing to add
  });

  it('rechecks date flags after an edit', () => {
    const items = initReview(extracted, ctx());
    const hepb = byName(items, 'Hep B');
    const fixed = { ...hepb, date: '2014-09-25', edited: true };
    expect(itemFlags(fixed, ctx())).toEqual([]);
    expect(itemBlockers(fixed, ctx())).toEqual([]);
    const recorded: DoseRecord = {
      id: 'r',
      childId: 'c',
      vaccineId: 'hepb',
      doseNumber: fixed.doseNumber!,
      status: 'received',
      dateGiven: '2014-09-25',
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(itemFlags(fixed, ctx([recorded]))).toContain('duplicate');
  });

  it('numbers doses by date among the recorded ones, within the series length', () => {
    const items = initReview(extracted, ctx());
    expect(byName(items, 'Triple viral (SRP)').doseNumber).toBe(1);
    const recorded = (n: number, date: string): DoseRecord => ({
      id: `r${n}`,
      childId: 'c',
      vaccineId: 'dtap',
      doseNumber: n,
      status: 'received',
      dateGiven: date,
      source: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const withDtap = ctx([recorded(1, '2014-11-24'), recorded(2, '2015-01-24'), recorded(3, '2015-03-24'), recorded(4, '2016-03-24'), recorded(5, '2018-09-24')]);
    const dpt = { ...byName(initReview(extracted, withDtap), 'DPT'), date: '2015-12-03', doseNumber: undefined };
    // Three DTaP doses were given before Dec 3, 2015, so this is dose 4.
    expect(assignDoseNumbers([dpt], withDtap)[0].doseNumber).toBe(4);
    // After every recorded dose: capped at the 5-dose series.
    expect(assignDoseNumbers([{ ...dpt, date: '2026-01-01' }], withDtap)[0].doseNumber).toBe(5);
  });

  it('commits decisions with the chosen date and dose number', () => {
    const items = initReview(extracted, ctx());
    const out: ExtractedDose[] = toCommit(items);
    expect(out.find((e) => e.rawName === 'Polio')!.decision).toBe('remove');
    expect(out.find((e) => e.rawName === 'Triple viral (SRP)')).toMatchObject({ decision: 'confirm', matchedVaccineId: 'mmr', doseNumber: 1 });
  });
});
