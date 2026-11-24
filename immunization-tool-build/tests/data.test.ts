import { describe, expect, it } from 'vitest';
import { catalog, getVaccine, sampleDataLoaded, schedule } from '@/lib/data';
import { fixtures } from '@/mocks/db';

describe('seed data', () => {
  it('parses and is flagged as sample', () => {
    expect(schedule.sample).toBe(true);
    expect(catalog.vaccines.every((v) => v.sample)).toBe(true);
    expect(fixtures.sample).toBe(true);
    expect(sampleDataLoaded).toBe(true);
  });

  it('every scheduled vaccine is in the catalog', () => {
    const ids = [...schedule.series, ...schedule.annual, ...schedule.conditional].map((s) => s.vaccineId);
    const missing = ids.filter((id) => !getVaccine(id) && !['dengue', 'mpox'].includes(id));
    expect(missing).toEqual([]);
  });

  it('every fixture dose references a scheduled vaccine and dose', () => {
    for (const child of fixtures.children) {
      for (const d of child.doses) {
        const series = schedule.series.find((s) => s.vaccineId === d.vaccineId);
        const annual = schedule.annual.some((a) => a.vaccineId === d.vaccineId);
        expect(series || annual, `${child.key} ${d.vaccineId}`).toBeTruthy();
        if (series) expect(series.doses.some((x) => x.dose === d.doseNumber), `${child.key} ${d.vaccineId} #${d.doseNumber}`).toBe(true);
      }
    }
  });
});
