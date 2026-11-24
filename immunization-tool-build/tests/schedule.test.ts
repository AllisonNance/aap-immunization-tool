// Schedule engine (SPEC.md §7): one describe block per rule, then the four
// sample children (§5b) as end-to-end expectations.
import { describe, expect, it } from 'vitest';
import type { CustomVaccineEntry, DoseRecord, DoseStatus, Exemption } from '@/lib/api/schemas';
import { schedule } from '@/lib/data';
import { addAge, addDays } from '@/lib/dates';
import { blockingIssues, checkDoseDate, computeChildSchedule, dosesDueAt, type ChildSchedule, type ScheduleInput } from '@/lib/schedule';
import { seedDb } from '@/mocks/db';

const stamp = '2026-01-01T00:00:00.000Z';
let n = 0;
function dose(vaccineId: string, doseNumber: number, status: DoseStatus, extra: Partial<DoseRecord> = {}): DoseRecord {
  return { id: `d${n++}`, childId: 'c', vaccineId, doseNumber, status, source: 'manual', createdAt: stamp, updatedAt: stamp, ...extra };
}
const got = (vaccineId: string, doseNumber: number, dateGiven: string) => dose(vaccineId, doseNumber, 'received', { dateGiven });

/** trackedFrom: when the child was added (defaults to today: a late add with no assumed history). */
function run(args: { dob: string; today: string; doses?: DoseRecord[]; exemptions?: Exemption[]; trackedFrom?: string }): ChildSchedule {
  const input: ScheduleInput = {
    child: { dateOfBirth: args.dob, createdAt: `${args.trackedFrom ?? args.today}T00:00:00.000Z` },
    doses: args.doses ?? [],
    exemptions: args.exemptions ?? [],
    schedule,
    today: args.today,
  };
  return computeChildSchedule(input);
}
const stateOf = (r: ChildSchedule, vaccineId: string, doseNumber: number) =>
  r.series.find((s) => s.vaccineId === vaccineId)!.doses.find((d) => d.doseNumber === doseNumber)!;

describe('rule 1: age ranges are not deadlines until they end', () => {
  // HepB dose 3: "6–18 months", overdue from 19 months (data: overdueFrom).
  const dob = '2025-01-15';
  const history = [got('hepb', 1, dob), got('hepb', 2, '2025-02-15')];
  const firstDay = addAge(dob, { value: 6, unit: 'months' }); // 2025-07-15
  const overdueDay = addAge(dob, { value: 19, unit: 'months' }); // 2026-08-15
  const lastDay = addDays(overdueDay, -1);
  const at = (today: string) => run({ dob, today, doses: history });

  it('is upcoming the day before the range opens', () => {
    expect(stateOf(at(addDays(firstDay, -1)), 'hepb', 3).state).toBe('upcoming');
  });

  it('is due now on the first day of the range', () => {
    expect(stateOf(at(firstDay), 'hepb', 3).state).toBe('dueNow');
  });

  it('is still due now, not overdue, on the last day of the range', () => {
    const r = at(lastDay);
    expect(stateOf(r, 'hepb', 3)).toMatchObject({ state: 'dueNow', windowStart: firstDay, windowEnd: lastDay, overdueDate: overdueDay });
    // The overall status can't be overdue because of a range that's still open,
    // and the catch-up path leaves it out.
    expect(r.status).not.toBe('overdue');
    expect(r.catchUp.find((c) => c.vaccineId === 'hepb')).toBeUndefined();
  });

  it('is overdue once the range has fully ended, and joins the catch-up path', () => {
    const r = at(overdueDay);
    expect(stateOf(r, 'hepb', 3).state).toBe('overdue');
    expect(r.status).toBe('overdue');
    expect(r.catchUp).toContainEqual({ vaccineId: 'hepb', doseNumber: 3, earliestDate: overdueDay });
  });
});

describe('rule 2: missing history is not missed', () => {
  const dob = '2021-10-14';
  const today = '2026-11-23'; // 5 years and ~1 month; added today with no records

  it('shows earlier doses as not entered and recommends from now on', () => {
    const r = run({ dob, today });
    expect(stateOf(r, 'hepb', 1).state).toBe('notEntered');
    expect(stateOf(r, 'dtap', 4).state).toBe('notEntered');
    expect(stateOf(r, 'mmr', 1).state).toBe('notEntered');
    for (const [v, d] of [['dtap', 5], ['ipv', 4], ['mmr', 2], ['varicella', 2]] as const) {
      expect(stateOf(r, v, d).state).toBe('dueNow');
    }
    expect(r.counts.overdue).toBe(0);
    expect(r.status).toBe('dueSoon');
  });

  it('does count a dose overdue if its window opened after the child was added', () => {
    // Tracked since birth, nothing recorded: the birth dose is missed.
    const r = run({ dob: '2026-06-01', today: '2026-08-01', trackedFrom: '2026-06-01' });
    expect(stateOf(r, 'hepb', 1).state).toBe('overdue');
  });

  it('does not treat a "not sure" or postponed entry as history', () => {
    const r = run({ dob, today, doses: [dose('dtap', 5, 'notSure')] });
    expect(stateOf(r, 'dtap', 5).state).toBe('needsInfo');
    for (const d of [1, 2, 3, 4]) expect(stateOf(r, 'dtap', d).state).toBe('notEntered');
    expect(r.status).toBe('needsInfo');
  });

  it('does count a dose overdue when the caregiver entered history for that vaccine', () => {
    const r = run({ dob, today, doses: [got('mmr', 1, '2022-10-20')] });
    expect(stateOf(r, 'mmr', 2).state).toBe('dueNow');
    expect(stateOf(r, 'hepb', 1).state).toBe('notEntered');
    const ava = run({ dob: '2025-03-20', today: '2026-11-23', doses: [got('hib', 1, '2025-05-20'), got('hib', 2, '2025-07-20'), got('hib', 3, '2025-09-20')] });
    expect(stateOf(ava, 'hib', 4).state).toBe('overdue');
  });
});

describe('rule 3: received dates are checked', () => {
  const dob = '2026-01-10';
  const today = '2026-11-23';
  const data = (v: string, d: number) => schedule.series.find((s) => s.vaccineId === v)!.doses.find((x) => x.dose === d)!;

  it('rejects a date before birth or in the future', () => {
    expect(checkDoseDate({ dateGiven: '2026-01-09', dob, today, dose: data('hepb', 1) })).toContain('beforeBirth');
    expect(checkDoseDate({ dateGiven: '2026-11-24', dob, today, dose: data('hepb', 1) })).toContain('inFuture');
    expect(blockingIssues.has('beforeBirth') && blockingIssues.has('inFuture')).toBe(true);
  });

  it('flags a date before the minimum age', () => {
    // Rotavirus dose 1: minimum age 6 weeks.
    expect(checkDoseDate({ dateGiven: addAge(dob, { value: 5, unit: 'weeks' }), dob, today, dose: data('rotavirus', 1) })).toEqual([
      'beforeMinimumAge',
    ]);
    expect(checkDoseDate({ dateGiven: addAge(dob, { value: 6, unit: 'weeks' }), dob, today, dose: data('rotavirus', 1) })).toEqual([]);
  });

  it('flags a dose closer to the previous one than the minimum interval', () => {
    // DTaP dose 2: at least 4 weeks after dose 1.
    const prev = '2026-03-10';
    expect(checkDoseDate({ dateGiven: '2026-04-06', dob, today, dose: data('dtap', 2), previousDate: prev })).toEqual(['intervalTooShort']);
    expect(checkDoseDate({ dateGiven: '2026-04-07', dob, today, dose: data('dtap', 2), previousDate: prev })).toEqual([]);
    expect(blockingIssues.has('intervalTooShort')).toBe(false);
  });

  it('flags a first rotavirus dose after its maximum age', () => {
    expect(checkDoseDate({ dateGiven: addAge(dob, { value: 16, unit: 'weeks' }), dob, today, dose: data('rotavirus', 1) })).toContain(
      'afterMaximumAge',
    );
  });

  it('reports problem doses in the schedule', () => {
    const r = run({ dob, today, doses: [got('dtap', 1, '2026-03-10'), got('dtap', 2, '2026-03-20')] });
    expect(stateOf(r, 'dtap', 2)).toMatchObject({ state: 'received', issues: ['intervalTooShort'] });
    expect(r.invalidDoses.map((d) => [d.vaccineId, d.doseNumber])).toEqual([['dtap', 2]]);
  });
});

describe('rule 4: postponed shifts the following doses', () => {
  const dob = '2026-01-01';
  const doses = [got('dtap', 1, '2026-03-01'), dose('dtap', 2, 'postponed', { postponedUntil: '2026-06-20' })];

  it('keeps the postponed dose with its target date', () => {
    const r = run({ dob, today: '2026-06-01', doses });
    expect(stateOf(r, 'dtap', 2)).toMatchObject({ state: 'postponed', plannedDate: '2026-06-20' });
    expect(r.counts.overdue).toBe(0);
  });

  it('moves the next dose to the minimum interval after the new target', () => {
    // DTaP 3 is normally due at 6 months (Jul 1); 4 weeks after Jun 20 is Jul 18.
    const r = run({ dob, today: '2026-07-10', doses });
    expect(stateOf(r, 'dtap', 3)).toMatchObject({ state: 'upcoming', windowStart: '2026-07-18' });
  });

  it("doesn't make the shifted dose overdue on its old date", () => {
    // Normally overdue from 7 months (Aug 1); shifted, it gets a month from Jul 18.
    const r = run({ dob, today: '2026-08-05', doses });
    expect(stateOf(r, 'dtap', 3)).toMatchObject({ state: 'dueNow', overdueDate: '2026-08-18' });
  });
});

describe('rule 5: exemptions apply from a dose onward', () => {
  const dob = '2025-01-01';
  const today = '2026-11-23';
  const history = [got('dtap', 1, '2025-03-01')];
  const exemption: Exemption = { id: 'e', childId: 'c', vaccineId: 'dtap', fromDoseNumber: 2, createdAt: stamp, updatedAt: stamp };

  it('marks that dose and the rest of the series exempt, and none overdue', () => {
    const without = run({ dob, today, doses: history });
    expect(stateOf(without, 'dtap', 2).state).toBe('overdue');

    const r = run({ dob, today, doses: history, exemptions: [exemption] });
    expect(stateOf(r, 'dtap', 1).state).toBe('received');
    for (const d of [2, 3, 4, 5]) expect(stateOf(r, 'dtap', d).state).toBe('exempt');
    expect(r.counts.overdue).toBe(0);
    expect(r.catchUp.find((c) => c.vaccineId === 'dtap')).toBeUndefined();
  });

  it('also honors a single dose recorded as an exemption', () => {
    const r = run({ dob, today, doses: [...history, dose('dtap', 2, 'exemption')] });
    expect(stateOf(r, 'dtap', 2).state).toBe('exempt');
  });
});

describe('rule 6: not sure counts toward needs info, not overdue', () => {
  it('shows needs info even after the window has ended', () => {
    const r = run({ dob: '2014-09-24', today: '2026-11-23', doses: [got('mmr', 1, '2015-09-24'), dose('mmr', 2, 'notSure')] });
    expect(stateOf(r, 'mmr', 2).state).toBe('needsInfo');
    expect(r.counts).toMatchObject({ needsInfo: 1, overdue: 0 });
    expect(r.status).toBe('needsInfo');
  });

  it('ranks overdue above needs info', () => {
    const r = run({
      dob: '2025-03-20',
      today: '2026-11-23',
      doses: [got('hib', 1, '2025-05-20'), got('hib', 2, '2025-07-20'), got('hib', 3, '2025-09-20'), dose('mmr', 1, 'notSure')],
    });
    expect(r.status).toBe('overdue');
  });
});

describe('rule 7: past catch-up age is no longer recommended, never overdue', () => {
  it('stops Hib after 59 months', () => {
    const doses = [got('hib', 1, '2020-03-01'), got('hib', 2, '2020-05-01')];
    const at59 = run({ dob: '2020-01-01', today: '2024-12-31', doses });
    expect(stateOf(at59, 'hib', 3).state).toBe('overdue');
    const at60 = run({ dob: '2020-01-01', today: '2025-01-01', doses });
    expect(stateOf(at60, 'hib', 3).state).toBe('noLongerRecommended');
    expect(at60.counts.overdue).toBe(0);
  });

  it('stops rotavirus after 8 months, and never starts it after 15 weeks', () => {
    const r = run({ dob: '2026-01-01', today: '2026-09-15', doses: [got('rotavirus', 1, '2026-03-01')] });
    expect(stateOf(r, 'rotavirus', 2).state).toBe('noLongerRecommended');
    expect(stateOf(r, 'rotavirus', 2).ageLimit).toBe('remaining'); // started: past the limit for the doses left
    const late = run({ dob: '2026-01-01', today: '2026-05-01', trackedFrom: '2026-01-01' });
    expect(stateOf(late, 'rotavirus', 1).state).toBe('noLongerRecommended');
    expect(stateOf(late, 'rotavirus', 1).ageLimit).toBe('start'); // never started: past the limit for starting
  });

  it('stops DTaP from age 7 (Tdap is used instead)', () => {
    const r = run({ dob: '2019-01-01', today: '2026-11-23', doses: [got('dtap', 1, '2019-03-01')] });
    expect(stateOf(r, 'dtap', 5).state).toBe('noLongerRecommended');
  });
});

describe('rule 8: seasonal and conditional vaccines never make a child overdue', () => {
  const dob = '2025-03-20';

  it('reports flu and COVID-19 as due this season, outside the dose series', () => {
    const r = run({ dob, today: '2026-11-23', doses: [got('influenza', 1, '2025-10-20')] });
    expect(r.series.map((s) => s.vaccineId)).not.toContain('influenza');
    expect(r.seasonal).toContainEqual({ vaccineId: 'influenza', kind: 'annual', state: 'dueThisSeason' });
    expect(r.seasonal).toContainEqual({ vaccineId: 'covid19', kind: 'annual', state: 'dueThisSeason' });
    expect(r.status).not.toBe('overdue');
  });

  it('knows a dose this season, and when the season is over', () => {
    expect(run({ dob, today: '2026-11-23', doses: [got('influenza', 1, '2026-10-01')] }).seasonal).toContainEqual({
      vaccineId: 'influenza',
      kind: 'annual',
      state: 'receivedThisSeason',
    });
    expect(run({ dob, today: '2026-07-01' }).seasonal).toContainEqual({ vaccineId: 'influenza', kind: 'annual', state: 'outOfSeason' });
  });

  it('sends RSV antibody and MenB to the pediatrician', () => {
    expect(run({ dob: '2026-08-01', today: '2026-11-23' }).seasonal).toContainEqual({
      vaccineId: 'rsv-mab',
      kind: 'conditional',
      state: 'askPediatrician',
    });
    const teen = run({ dob: '2010-01-01', today: '2026-11-23' });
    expect(teen.seasonal).toContainEqual({ vaccineId: 'menb', kind: 'conditional', state: 'askPediatrician' });
    expect(teen.seasonal.find((s) => s.vaccineId === 'rsv-mab')).toBeUndefined();
  });
});

describe('rule 9: single-age doses become overdue at overdueFrom', () => {
  // DTaP 1 at "2 months", overdueFrom 3 months; tracked since birth.
  const dob = '2026-01-15';
  const at = (today: string) => stateOf(run({ dob, today, trackedFrom: dob }), 'dtap', 1);
  const threeMonths = addAge(dob, { value: 3, unit: 'months' });

  it('uses overdueFrom from the data', () => {
    expect(at('2026-03-15')).toMatchObject({ state: 'dueNow', windowStart: '2026-03-15', overdueDate: threeMonths });
  });

  it('is still due now the day before, and overdue from that day', () => {
    expect(at(addDays(threeMonths, -1)).state).toBe('dueNow');
    expect(at(threeMonths).state).toBe('overdue');
  });
});

describe('rule 10: custom vaccines never change AAP dose states', () => {
  it('gives the same schedule with or without custom entries, confirmed or not', () => {
    const base = { dob: '2014-09-24', today: '2026-11-23', doses: [got('mmr', 1, '2015-09-24')] };
    const custom = (pediatricianConfirmed: boolean): CustomVaccineEntry => ({
      id: 'cv',
      childId: 'c',
      nameAsWritten: 'BCG',
      country: 'Mexico',
      dateGiven: { year: 2014, month: 9, day: 26 },
      pediatricianConfirmed,
      source: 'manual',
      createdAt: stamp,
      updatedAt: stamp,
    });
    const plain = run(base);
    for (const confirmed of [false, true]) {
      const withCustom = computeChildSchedule({
        child: { dateOfBirth: base.dob, createdAt: `${base.today}T00:00:00.000Z` },
        doses: base.doses,
        exemptions: [],
        schedule,
        today: base.today,
        customVaccines: [custom(confirmed)],
      });
      expect(withCustom).toEqual(plain);
    }
  });
});

describe('rule 11: changing the DOB recomputes everything and surfaces invalid doses', () => {
  const today = '2026-11-23';
  const doses = [got('hepb', 1, '2026-05-18'), got('hepb', 2, '2026-06-18')];

  it('recomputes states and flags doses that become impossible', () => {
    const before = run({ dob: '2026-05-18', today, doses });
    expect(stateOf(before, 'hepb', 3).state).toBe('dueNow');
    expect(before.invalidDoses).toEqual([]);

    // DOB moved a month later: the birth dose is now before birth, and HepB 3 isn't due yet.
    const after = run({ dob: '2026-06-01', today, doses });
    expect(after.invalidDoses.map((d) => [d.vaccineId, d.doseNumber, d.issues])).toContainEqual(['hepb', 1, ['beforeBirth']]);
    expect(stateOf(after, 'hepb', 3).state).toBe('upcoming');
  });
});

describe('a declined dose', () => {
  it('shows Declined, never overdue, and is not history for earlier doses', () => {
    const r = run({ dob: '2021-10-14', today: '2026-11-23', doses: [dose('mmr', 1, 'declined')] });
    expect(stateOf(r, 'mmr', 1).state).toBe('declined');
    expect(r.status).not.toBe('overdue');
  });
});

describe('a planned date (Customize timing)', () => {
  it("shows the caregiver's date without changing the state, and isn't history", () => {
    const r = run({ dob: '2021-10-14', today: '2026-11-23', doses: [dose('mmr', 2, 'planned', { customTargetDate: '2026-12-10' })] });
    expect(stateOf(r, 'mmr', 2)).toMatchObject({ state: 'dueNow', plannedDate: '2026-12-10' });
    // Still no history for MMR: dose 1 stays "not entered", not overdue.
    expect(stateOf(r, 'mmr', 1).state).toBe('notEntered');
  });
});

describe('due soon and due at a date', () => {
  it('is due soon when a dose opens within 30 days', () => {
    // 2 months on Jan 15; 20 days before.
    const r = run({ dob: '2025-11-15', today: '2025-12-26', doses: [got('hepb', 1, '2025-11-15'), got('hepb', 2, '2025-12-20')] });
    expect(r.counts.due).toBe(0);
    expect(r.status).toBe('dueSoon');
    expect(run({ dob: '2025-11-15', today: '2025-12-01', doses: [got('hepb', 1, '2025-11-15')] }).status).toBe('dueSoon');
  });

  it('lists the vaccines due at a future appointment', () => {
    const due = dosesDueAt(
      { child: { dateOfBirth: '2026-01-15', createdAt: stamp }, doses: [got('hepb', 1, '2026-01-15'), got('hepb', 2, '2026-02-15')], exemptions: [], schedule },
      '2026-03-20',
    );
    const ids = due.map((d) => `${d.vaccineId}${d.doseNumber}`);
    expect(ids).toEqual(expect.arrayContaining(['dtap1', 'hib1', 'pcv1', 'ipv1', 'rotavirus1']));
    expect(ids).not.toContain('hepb3');
  });
});

describe('the four sample children (SPEC.md §5b)', () => {
  const today = '2026-11-23';
  const db = seedDb(today);
  const account = db.accounts.find((a) => a.key === 'demo-family')!;
  const kid = (name: string) => {
    const c = db.children.find((x) => x.accountId === account.id && x.name === name)!;
    return computeChildSchedule({
      child: { dateOfBirth: c.dateOfBirth!, createdAt: c.createdAt },
      doses: db.doses.filter((d) => d.childId === c.id),
      exemptions: db.exemptions.filter((e) => e.childId === c.id),
      schedule,
      today,
    });
  };

  it('Maya (6 months): 6-month doses and HepB 3 due now, nothing overdue', () => {
    const r = kid('Maya');
    for (const v of ['hepb', 'rotavirus', 'dtap', 'hib', 'pcv', 'ipv']) expect(stateOf(r, v, 3).state).toBe('dueNow');
    expect(r.counts.overdue).toBe(0);
    expect(r.status).toBe('dueSoon');
  });

  it('Leo (5 years, no history): earlier doses not entered, 4–6 year doses due now', () => {
    const r = kid('Leo');
    expect(r.counts).toMatchObject({ received: 0, overdue: 0 });
    expect(stateOf(r, 'hepb', 1).state).toBe('notEntered');
    for (const [v, d] of [['dtap', 5], ['ipv', 4], ['mmr', 2], ['varicella', 2]] as const) expect(stateOf(r, v, d).state).toBe('dueNow');
  });

  it('Ava (20 months, behind): boosters and DTaP 4 overdue with a catch-up path; HepA 2 due now', () => {
    const r = kid('Ava');
    for (const [v, d] of [['hib', 4], ['pcv', 4], ['dtap', 4]] as const) expect(stateOf(r, v, d).state).toBe('overdue');
    expect(stateOf(r, 'hepa', 2).state).toBe('dueNow');
    expect(r.status).toBe('overdue');
    expect(r.catchUp.map((c) => `${c.vaccineId}${c.doseNumber}`).sort()).toEqual(['dtap4', 'hib4', 'pcv4']);
  });

  it('Sofía (12 years): MMR 2 needs info; Tdap, MenACWY and HPV 2 due now; rotavirus no longer recommended', () => {
    const r = kid('Sofía');
    expect(stateOf(r, 'mmr', 2).state).toBe('needsInfo');
    for (const [v, d] of [['tdap', 1], ['menacwy', 1], ['hpv', 2]] as const) expect(stateOf(r, v, d).state).toBe('dueNow');
    expect(stateOf(r, 'rotavirus', 1).state).toBe('noLongerRecommended');
    expect(r.status).toBe('needsInfo');
  });
});
