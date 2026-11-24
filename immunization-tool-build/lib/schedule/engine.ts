// The schedule engine (SPEC.md §7). A pure function: no UI, storage or
// network. Thresholds come from data/schedule (window, overdueFrom, minimum
// ages and intervals, catchUpThrough); nothing is recomputed here.
//
// Conventions (also in the data's `rules`):
// - A dose is dueNow from dob + window.start through the day before
//   dob + overdueFrom, and overdue from dob + overdueFrom.
// - A postponed or late previous dose can push a dose's start later (minimum
//   interval). A pushed dose gets at least 1 month before it's overdue
//   (Table 2's "more than 1 month behind").
// - Doses timed from the previous dose (HPV 2) use its received date; with
//   no received previous dose they're upcoming with no date.
import type { CustomVaccineEntry, DoseRecord, Exemption } from '@/lib/api/schemas';
import type { ScheduleData, ScheduleDose, ScheduleSeries } from '@/lib/data/schemas';
import { addAge, addDays, compareISO, type Age } from '@/lib/dates';
import type {
  CatchUpItem,
  ChildSchedule,
  ChildStatus,
  DoseIssue,
  DoseState,
  SeasonalState,
  SeriesState,
} from './types';

export interface ScheduleInput {
  /** DOB must be known (a set-up child). createdAt marks when tracking began. */
  child: { dateOfBirth: string; createdAt: string };
  doses: DoseRecord[];
  exemptions: Exemption[];
  schedule: ScheduleData;
  today: string;
  /**
   * Rule 10: custom (non-US) vaccines never change AAP dose states. They're
   * accepted here only so callers can pass the whole record; counting a
   * pediatrician-confirmed entry stays off (FEATURE_CUSTOM_COUNTS, SPEC.md §13)
   * and would also need a mapping to a catalog dose, which v1 doesn't have.
   */
  customVaccines?: CustomVaccineEntry[];
}

/** How far ahead an upcoming dose makes the child "Due soon". */
export const DUE_SOON_DAYS = 30;

const max = (a: string, b: string) => (compareISO(a, b) >= 0 ? a : b);
const before = (a: string, b: string) => compareISO(a, b) < 0;
const ONE_MONTH: Age = { value: 1, unit: 'months' };

// ---------------------------------------------------------------- doses

/** The record that stands for a dose: a received one wins; earliest first. */
function recordFor(records: DoseRecord[], doseNumber: number): DoseRecord | undefined {
  const forDose = records.filter((r) => r.doseNumber === doseNumber);
  const received = forDose
    .filter((r) => r.status === 'received' && r.dateGiven)
    .sort((a, b) => compareISO(a.dateGiven!, b.dateGiven!));
  return received[0] ?? forDose[0];
}

/** Number of doses in the series (rotavirus: 2 or 3 by product; unknown → the data's default). */
function seriesLength(series: ScheduleSeries): number {
  return series.seriesVariants?.defaultIfUnknown ?? series.doses.length;
}

/** Past the last age Table 1 shows a catch-up bar (or rotavirus's maximum age). */
function pastCatchUp(series: ScheduleSeries, dob: string, today: string, hasFirstDose: boolean): boolean {
  if (series.catchUpThrough) {
    // catchUpThrough is inclusive: "through 18 years" ends at the 19th birthday.
    const through = series.catchUpThrough;
    if (!before(today, addAge(dob, { value: through.value + 1, unit: through.unit }))) return true;
  }
  if (series.maximumAgeForFinalDose && !before(today, addAge(dob, series.maximumAgeForFinalDose))) return true;
  // Rotavirus: if dose 1 wasn't given by its maximum age, the series isn't started.
  const firstMax = series.doses[0]?.maximumAge;
  if (firstMax && !hasFirstDose && !before(today, addAge(dob, firstMax))) return true;
  return false;
}

/** Rule 3: problems with a recorded date. */
export function checkDoseDate(args: {
  dateGiven: string;
  dob: string;
  today: string;
  dose: ScheduleDose;
  previousDate?: string;
}): DoseIssue[] {
  const { dateGiven, dob, today, dose, previousDate } = args;
  const issues: DoseIssue[] = [];
  if (before(dateGiven, dob)) issues.push('beforeBirth');
  if (before(today, dateGiven)) issues.push('inFuture');
  if (dose.minimumAge && !issues.includes('beforeBirth') && before(dateGiven, addAge(dob, dose.minimumAge))) {
    issues.push('beforeMinimumAge');
  }
  if (dose.maximumAge && !before(dateGiven, addAge(dob, dose.maximumAge))) issues.push('afterMaximumAge');
  if (previousDate && dose.minimumIntervalFromPrevious && before(dateGiven, addAge(previousDate, dose.minimumIntervalFromPrevious))) {
    issues.push('intervalTooShort');
  }
  return issues;
}

function computeSeries(series: ScheduleSeries, input: ScheduleInput): SeriesState {
  const { child, today } = input;
  const dob = child.dateOfBirth;
  const trackedFrom = child.createdAt.slice(0, 10);
  const records = input.doses.filter((d) => d.vaccineId === series.vaccineId);
  // History = a dose recorded as given. "Not sure", postponed, planned (and the
  // like) say nothing about earlier doses, so they don't turn "Not entered" into "Overdue".
  const historyEntered = records.some((r) => r.status === 'received');
  const exemptFrom = Math.min(
    ...input.exemptions.filter((e) => e.vaccineId === series.vaccineId).map((e) => e.fromDoseNumber),
    Infinity,
  );
  const hasFirstDose = recordFor(records, 1)?.status === 'received';
  const past = pastCatchUp(series, dob, today, hasFirstDose);

  const out: DoseState[] = [];
  // Anchor for minimum intervals: the previous dose's received date or postponed target.
  let anchor: string | undefined;
  // For doses timed from the previous dose: its received date only.
  let previousReceived: string | undefined;

  for (const dose of series.doses.slice(0, seriesLength(series))) {
    const rec = recordFor(records, dose.dose);
    const base: Pick<DoseState, 'vaccineId' | 'doseNumber' | 'label' | 'record' | 'issues'> = {
      vaccineId: series.vaccineId,
      doseNumber: dose.dose,
      label: dose.label,
      record: rec,
      issues: [],
    };

    // Window from the data (absolute ages, or relative to the previous dose).
    let start: string | undefined;
    let overdue: string | undefined;
    if (dose.window && dose.overdueFrom) {
      start = addAge(dob, dose.window.start);
      overdue = addAge(dob, dose.overdueFrom);
    } else if (dose.windowRelativeToPrevious && dose.overdueRelativeToPrevious && previousReceived) {
      start = addAge(previousReceived, dose.windowRelativeToPrevious.start);
      overdue = addAge(previousReceived, dose.overdueRelativeToPrevious);
    }
    // Rule 4: a postponed (or late) previous dose pushes this one by the minimum interval.
    if (start && overdue && anchor && dose.minimumIntervalFromPrevious) {
      const earliest = addAge(anchor, dose.minimumIntervalFromPrevious);
      if (before(start, earliest)) {
        start = earliest;
        overdue = max(overdue, addAge(earliest, ONE_MONTH));
      }
    }
    const window = start && overdue ? { windowStart: start, windowEnd: addDays(overdue, -1), overdueDate: overdue } : {};

    let state: DoseState;
    if (rec?.status === 'received') {
      const issues = rec.dateGiven
        ? checkDoseDate({ dateGiven: rec.dateGiven, dob, today, dose, previousDate: previousReceived })
        : [];
      state = { ...base, ...window, state: 'received', issues };
    } else if (dose.dose >= exemptFrom || rec?.status === 'exemption') {
      state = { ...base, ...window, state: 'exempt' }; // rule 5
    } else if (rec?.status === 'notSure') {
      state = { ...base, ...window, state: 'needsInfo' }; // rule 6
    } else if (rec?.status === 'notGiven') {
      state = { ...base, ...window, state: 'notGiven' };
    } else if (rec?.status === 'declined') {
      state = { ...base, ...window, state: 'declined' };
    } else if (rec?.status === 'postponed') {
      state = { ...base, ...window, state: 'postponed', plannedDate: rec.postponedUntil };
    } else if (past) {
      state = { ...base, ...window, state: 'noLongerRecommended', ageLimit: historyEntered ? 'remaining' : 'start' }; // rule 7
    } else if (!start || !overdue || before(today, start)) {
      state = { ...base, ...window, state: 'upcoming', plannedDate: rec?.customTargetDate };
    } else if (before(today, overdue)) {
      // Rules 1, 9: open through the day before overdueFrom.
      state = { ...base, ...window, state: 'dueNow', plannedDate: rec?.customTargetDate };
    } else {
      // Rule 2: missing history isn't missed. Overdue only with history for this
      // vaccine, or when the window opened after tracking began.
      const counts = historyEntered || !before(start, trackedFrom);
      state = { ...base, ...window, state: counts ? 'overdue' : 'notEntered' };
    }
    out.push(state);

    // Carry anchors to the next dose.
    if (state.state === 'received' && rec?.dateGiven) {
      anchor = rec.dateGiven;
      previousReceived = rec.dateGiven;
    } else {
      anchor = state.state === 'postponed' ? state.plannedDate : undefined;
      previousReceived = undefined;
    }
  }
  return { vaccineId: series.vaccineId, doses: out };
}

// ---------------------------------------------------------------- seasonal

function inSeason(today: string, season: { startMonth: number; endMonth: number }): boolean {
  const m = Number(today.slice(5, 7));
  return season.startMonth <= season.endMonth ? m >= season.startMonth && m <= season.endMonth : m >= season.startMonth || m <= season.endMonth;
}

function seasonStart(today: string, startMonth: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${String(startMonth).padStart(2, '0')}-01`;
}

/** Rule 8: seasonal and conditional vaccines never make a child overdue. */
function computeSeasonal(input: ScheduleInput): SeasonalState[] {
  const { schedule, today, doses } = input;
  const dob = input.child.dateOfBirth;
  const out: SeasonalState[] = [];
  const fluSeason = schedule.annual.find((a) => a.season)?.season ?? { startMonth: 8, endMonth: 5 };

  for (const a of schedule.annual) {
    if (before(today, addAge(dob, a.startAge))) {
      out.push({ vaccineId: a.vaccineId, kind: 'annual', state: 'notYetEligible' });
      continue;
    }
    const routine = !a.routineThrough || before(today, addAge(dob, { value: a.routineThrough.value + 1, unit: a.routineThrough.unit }));
    if (!routine) {
      out.push({ vaccineId: a.vaccineId, kind: 'annual', state: 'askPediatrician' });
      continue;
    }
    const season = a.season ?? fluSeason;
    const since = seasonStart(today, season.startMonth);
    const gotThisSeason = doses.some(
      (d) => d.vaccineId === a.vaccineId && d.status === 'received' && d.dateGiven && !before(d.dateGiven, since),
    );
    out.push({
      vaccineId: a.vaccineId,
      kind: 'annual',
      state: gotThisSeason ? 'receivedThisSeason' : inSeason(today, season) ? 'dueThisSeason' : 'outOfSeason',
    });
  }

  for (const c of schedule.conditional) {
    const recorded = doses.some((d) => d.vaccineId === c.vaccineId);
    // RSV antibody: infants (and a second season through 19 months); MenB: from 16; others only if recorded.
    const relevant =
      recorded ||
      (c.vaccineId === 'rsv-mab' && before(today, addAge(dob, { value: 20, unit: 'months' }))) ||
      (c.vaccineId === 'menb' && !before(today, addAge(dob, { value: 16, unit: 'years' })));
    if (relevant) out.push({ vaccineId: c.vaccineId, kind: 'conditional', state: 'askPediatrician' });
  }
  return out;
}

// ---------------------------------------------------------------- catch-up

/**
 * Next dates for missed doses: only doses whose range has ended (overdue),
 * chained by minimum intervals from the last received dose (rule 1).
 */
function computeCatchUp(series: SeriesState[], input: ScheduleInput): CatchUpItem[] {
  const dob = input.child.dateOfBirth;
  const items: CatchUpItem[] = [];
  for (const s of series) {
    const data = input.schedule.series.find((x) => x.vaccineId === s.vaccineId)!;
    let anchor: string | undefined;
    for (const d of s.doses) {
      const dose = data.doses.find((x) => x.dose === d.doseNumber)!;
      if (d.state === 'received' && d.record?.dateGiven) {
        anchor = d.record.dateGiven;
        continue;
      }
      if (d.state !== 'overdue') continue;
      let earliest = input.today;
      if (dose.minimumAge) earliest = max(earliest, addAge(dob, dose.minimumAge));
      if (anchor && dose.minimumIntervalFromPrevious) earliest = max(earliest, addAge(anchor, dose.minimumIntervalFromPrevious));
      items.push({ vaccineId: s.vaccineId, doseNumber: d.doseNumber, earliestDate: earliest });
      anchor = earliest; // the next missed dose follows this one
    }
  }
  return items.sort((a, b) => compareISO(a.earliestDate, b.earliestDate));
}

// ---------------------------------------------------------------- public

export function computeChildSchedule(input: ScheduleInput): ChildSchedule {
  const series = input.schedule.series.map((s) => computeSeries(s, input));
  const all = series.flatMap((s) => s.doses);
  const soon = addDays(input.today, DUE_SOON_DAYS);

  const counts = {
    received: all.filter((d) => d.state === 'received').length,
    due: all.filter((d) => d.state === 'dueNow').length,
    overdue: all.filter((d) => d.state === 'overdue').length,
    needsInfo: all.filter((d) => d.state === 'needsInfo').length,
  };
  const dueSoon =
    counts.due > 0 || all.some((d) => d.state === 'upcoming' && d.windowStart && !before(soon, d.windowStart));

  // Precedence: overdue > needsInfo > dueSoon > onTrack.
  const status: ChildStatus = counts.overdue ? 'overdue' : counts.needsInfo ? 'needsInfo' : dueSoon ? 'dueSoon' : 'onTrack';

  return {
    today: input.today,
    series,
    seasonal: computeSeasonal(input),
    status,
    counts,
    catchUp: computeCatchUp(series, input),
    invalidDoses: all.filter((d) => d.issues.length > 0),
  };
}

/** Vaccines due at a given date, e.g. the next appointment (used by Visit Prep). */
export function dosesDueAt(input: Omit<ScheduleInput, 'today'>, date: string): DoseState[] {
  return computeChildSchedule({ ...input, today: date })
    .series.flatMap((s) => s.doses)
    .filter((d) => d.state === 'dueNow' || d.state === 'overdue');
}
