// Output types for the schedule engine (SPEC.md §7). Pure data, no UI.
import type { DoseRecord } from '@/lib/api/schemas';

export type DoseStateKind =
  | 'received'
  | 'dueNow' // window open: from its start through the day before overdueFrom
  | 'upcoming' // window opens in the future (or, for doses timed from a previous dose, not known yet)
  | 'overdue' // window fully ended, not received, and history exists or the window opened after tracking began
  | 'notEntered' // window ended before tracking began and there's no record; never counted as overdue
  | 'needsInfo' // caregiver isn't sure
  | 'postponed'
  | 'exempt'
  | 'notGiven'
  | 'declined' // the caregiver chose not to have this dose
  | 'noLongerRecommended'; // past the series' catch-up age (or rotavirus's maximum age)

/** Problems with a recorded date (rule 3). Errors block saving; warnings ask the caregiver to check. */
export type DoseIssue = 'beforeBirth' | 'inFuture' | 'beforeMinimumAge' | 'intervalTooShort' | 'afterMaximumAge';
export const blockingIssues: ReadonlySet<DoseIssue> = new Set(['beforeBirth', 'inFuture']);

export interface DoseState {
  vaccineId: string;
  doseNumber: number;
  label: string;
  state: DoseStateKind;
  /** First day the dose is due (shifted later by a postponed or late previous dose). */
  windowStart?: string;
  /** Last day before it counts as overdue. */
  windowEnd?: string;
  /** Day it becomes overdue. */
  overdueDate?: string;
  /** Caregiver's target: postponedUntil, or customTargetDate for an upcoming dose. */
  plannedDate?: string;
  record?: DoseRecord;
  /** Problems with the recorded date of a received dose. */
  issues: DoseIssue[];
  /** For `noLongerRecommended`: past the age limit for starting the series, or for the doses left in it. */
  ageLimit?: 'start' | 'remaining';
}

export interface SeriesState {
  vaccineId: string;
  doses: DoseState[];
}

export type SeasonalStateKind = 'dueThisSeason' | 'receivedThisSeason' | 'outOfSeason' | 'notYetEligible' | 'askPediatrician';

/** Influenza, COVID-19 and conditional vaccines (RSV antibody, MenB…): never due or overdue in the AAP sense. */
export interface SeasonalState {
  vaccineId: string;
  kind: 'annual' | 'conditional';
  state: SeasonalStateKind;
}

export type ChildStatus = 'onTrack' | 'dueSoon' | 'overdue' | 'needsInfo';

export interface CatchUpItem {
  vaccineId: string;
  doseNumber: number;
  /** Earliest date it can be given: today, or later if a minimum age or interval requires. */
  earliestDate: string;
}

export interface ChildSchedule {
  today: string;
  series: SeriesState[];
  seasonal: SeasonalState[];
  status: ChildStatus;
  counts: { received: number; due: number; overdue: number; needsInfo: number };
  catchUp: CatchUpItem[];
  /** Received doses with a date problem (e.g. after a DOB change). */
  invalidDoses: DoseState[];
}
