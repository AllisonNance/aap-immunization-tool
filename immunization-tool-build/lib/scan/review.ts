// Review Scan (4c) rules, SPEC.md §6.4c. Pure: the screen keeps a list of
// ReviewItems, and these functions decide flags, what blocks Save and what
// gets committed. Nothing is saved until the caregiver presses Save.
//
// Flags: the OCR service's flags hold until the caregiver edits an item; then
// the date-dependent ones (before birth, too soon, already recorded) are
// rechecked here against the child's record.
import type { DoseRecord, ExtractedDose } from '@/lib/api/schemas';
import type { ScheduleData } from '@/lib/data/schemas';
import { compareISO } from '@/lib/dates';
import { checkDoseDate } from '@/lib/schedule';
import { readRawDate } from './rawDate';

export type ScanFlag = ExtractedDose['flags'][number];
export type Decision = 'confirm' | 'remove' | 'custom';

export interface ReviewItem {
  key: string;
  rawName: string;
  rawDate: string;
  confidence: number;
  vaccineId?: string;
  doseNumber?: number;
  /** Chosen ISO date. Unset while an ambiguous date is unresolved. */
  date?: string;
  /** Both readings of an ambiguous printed date (month-first, day-first). */
  dateOptions?: string[];
  serviceFlags: ScanFlag[];
  /** The caregiver changed the vaccine, dose or date: recheck date flags. */
  edited: boolean;
  decision: Decision;
}

export interface ReviewContext {
  dob: string;
  today: string;
  doses: DoseRecord[];
  schedule: ScheduleData;
}

const received = (ctx: ReviewContext, vaccineId: string) =>
  ctx.doses.filter((d) => d.vaccineId === vaccineId && d.status === 'received' && d.dateGiven);

/**
 * Dose numbers by date: a scanned dose is numbered by how many doses of that
 * vaccine (recorded, or earlier on the same card) came before it, capped at the
 * series length. Undated items go after the recorded ones.
 */
export function assignDoseNumbers(items: ReviewItem[], ctx: ReviewContext): ReviewItem[] {
  const numbers = new Map<string, number>();
  for (const it of items) {
    if (!it.vaccineId || it.decision === 'remove' || it.doseNumber) continue;
    const recorded = received(ctx, it.vaccineId);
    const scanned = items.filter((o) => o !== it && o.vaccineId === it.vaccineId && o.decision !== 'remove');
    const before = it.date
      ? recorded.filter((d) => d.dateGiven! < it.date!).length + scanned.filter((o) => o.date && o.date < it.date!).length
      : recorded.length;
    const max = ctx.schedule.series.find((s) => s.vaccineId === it.vaccineId)?.doses.length ?? Infinity;
    numbers.set(it.key, Math.min(before + 1, max));
  }
  return items.map((it) => (numbers.has(it.key) ? { ...it, doseNumber: numbers.get(it.key) } : it));
}

/** From the OCR result: dates read, duplicates default to Remove (SPEC.md §6.4c). */
export function initReview(extracted: ExtractedDose[], ctx: ReviewContext): ReviewItem[] {
  const items = extracted.map((e, i): ReviewItem => {
    const readings = readRawDate(e.rawDate);
    const ambiguous = e.dateAmbiguous || readings.ambiguous;
    return {
      key: String(i),
      rawName: e.rawName,
      rawDate: e.rawDate,
      confidence: e.confidence,
      vaccineId: e.matchedVaccineId,
      date: ambiguous ? undefined : (e.parsedDate ?? readings.options[0]),
      dateOptions: ambiguous ? readings.options : undefined,
      serviceFlags: e.flags,
      edited: false,
      decision: e.flags.includes('duplicate') ? 'remove' : 'confirm',
    };
  });
  return assignDoseNumbers(items, ctx);
}

/** Current flags for an item. */
export function itemFlags(item: ReviewItem, ctx: ReviewContext): ScanFlag[] {
  const flags = new Set<ScanFlag>();
  if (!item.vaccineId && item.decision !== 'custom') flags.add('unrecognized');
  if (item.dateOptions && !item.date) {
    flags.add('ambiguousDate');
    // Both readings before birth: no choice will fix it.
    if (item.dateOptions.every((d) => compareISO(d, ctx.dob) < 0)) flags.add('beforeBirth');
  }
  if (item.date && compareISO(item.date, ctx.dob) < 0) flags.add('beforeBirth');

  if (!item.edited) {
    for (const f of item.serviceFlags) if (f === 'duplicate' || f === 'intervalTooShort') flags.add(f);
  } else if (item.vaccineId && item.date && item.decision === 'confirm') {
    const recorded = received(ctx, item.vaccineId);
    if (recorded.some((d) => d.doseNumber === item.doseNumber || d.dateGiven === item.date)) flags.add('duplicate');
    const dose = ctx.schedule.series.find((s) => s.vaccineId === item.vaccineId)?.doses.find((d) => d.dose === item.doseNumber);
    const previous = recorded.filter((d) => item.doseNumber && d.doseNumber < item.doseNumber).sort((a, b) => b.doseNumber - a.doseNumber)[0];
    if (dose && checkDoseDate({ dateGiven: item.date, dob: ctx.dob, today: ctx.today, dose, previousDate: previous?.dateGiven }).includes('intervalTooShort')) {
      flags.add('intervalTooShort');
    }
  }
  return [...flags];
}

export type Blocker = 'ambiguousDate' | 'beforeBirth' | 'needsVaccine' | 'needsDate';

/** Why a kept item can't be saved yet. Removed items never block. */
export function itemBlockers(item: ReviewItem, ctx: ReviewContext): Blocker[] {
  if (item.decision === 'remove') return [];
  const flags = itemFlags(item, ctx);
  const out: Blocker[] = [];
  if (flags.includes('ambiguousDate')) out.push('ambiguousDate');
  if (flags.includes('beforeBirth')) out.push('beforeBirth');
  if (item.decision === 'confirm' && !item.vaccineId) out.push('needsVaccine');
  if (!item.date && !flags.includes('ambiguousDate')) out.push('needsDate');
  return out;
}

export function reviewSummary(items: ReviewItem[], ctx: ReviewContext) {
  const doses = items.filter((i) => i.decision === 'confirm').length;
  const custom = items.filter((i) => i.decision === 'custom').length;
  const blocked = items.filter((i) => itemBlockers(i, ctx).length > 0).length;
  return { doses, custom, blocked, canSave: blocked === 0 && doses + custom > 0 };
}

/** What Save sends to the commit endpoint. */
export function toCommit(items: ReviewItem[]): ExtractedDose[] {
  return items.map((i) => ({
    rawName: i.rawName,
    rawDate: i.rawDate,
    matchedVaccineId: i.vaccineId,
    parsedDate: i.date,
    doseNumber: i.doseNumber,
    dateAmbiguous: !!i.dateOptions && !i.date,
    confidence: i.confidence,
    flags: i.serviceFlags,
    decision: i.decision,
  }));
}

export type Confidence = 'high' | 'medium' | 'low';
export const confidenceLevel = (c: number): Confidence => (c >= 0.85 ? 'high' : c >= 0.7 ? 'medium' : 'low');
