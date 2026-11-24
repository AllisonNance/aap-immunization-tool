// Validates every seed data file against its Zod schema. Runs before
// `next build`; a schema error exits non-zero and fails the build (SPEC.md §5b).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import { catalogSchema, fixturesSchema, scanFixtureSchema, scheduleDataSchema } from '../lib/data/schemas';

const root = join(__dirname, '..');
const files: Array<[string, ZodType]> = [
  ['data/schedule/aap-2026.json', scheduleDataSchema],
  ['data/vaccines/catalog.json', catalogSchema],
  ['data/fixtures/accounts.json', fixturesSchema],
  ['data/fixtures/scan-extraction.json', scanFixtureSchema],
];

let failed = false;
for (const [file, schema] of files) {
  const result = schema.safeParse(JSON.parse(readFileSync(join(root, file), 'utf8')));
  if (result.success) {
    console.log(`ok   ${file}`);
  } else {
    failed = true;
    console.error(`FAIL ${file}`);
    for (const issue of result.error.issues) console.error(`     ${issue.path.join('.')}: ${issue.message}`);
  }
}
process.exit(failed ? 1 : 0);
