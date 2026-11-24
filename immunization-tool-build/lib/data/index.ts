// Parsed, typed access to the static seed data. Parsing throws on schema
// errors, so bad data fails tests and the build rather than rendering.
import scheduleJson from '@/data/schedule/aap-2026.json';
import catalogJson from '@/data/vaccines/catalog.json';
import { catalogSchema, scheduleDataSchema, type Vaccine } from './schemas';

export const schedule = scheduleDataSchema.parse(scheduleJson);
export const catalog = catalogSchema.parse(catalogJson);

const byId = new Map(catalog.vaccines.map((v) => [v.id, v]));
export function getVaccine(id: string): Vaccine | undefined {
  return byId.get(id);
}

/** True while any sample seed entry is loaded (drives the dev-only banner). */
export const sampleDataLoaded = schedule.sample || catalog.sample || catalog.vaccines.some((v) => v.sample);
