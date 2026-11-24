// Zod schemas for the seed data files in data/. Validated at build time by
// scripts/validate-data.ts (SPEC.md §5b) and in unit tests.
import { z } from 'zod';

export const ageSchema = z.object({
  value: z.number().nonnegative(),
  unit: z.enum(['days', 'weeks', 'months', 'years']),
});

const ageWindowSchema = z.object({ start: ageSchema, end: ageSchema });

const localizedText = z.object({ en: z.string().min(1), es: z.string().min(1) });

// ---------- data/schedule/aap-2026.json ----------

export const scheduleDoseSchema = z
  .object({
    dose: z.number().int().positive(),
    label: z.string(),
    // null for doses timed from the previous dose (e.g. HPV dose 2)
    window: ageWindowSchema.nullable().optional(),
    overdueFrom: ageSchema.nullable().optional(),
    windowRelativeToPrevious: ageWindowSchema.optional(),
    overdueRelativeToPrevious: ageSchema.optional(),
    minimumAge: ageSchema.optional(),
    minimumIntervalFromPrevious: ageSchema.optional(),
    maximumAge: ageSchema.optional(),
    note: z.string().optional(),
  })
  .refine((d) => d.window || d.windowRelativeToPrevious, {
    message: 'A dose needs window or windowRelativeToPrevious',
  })
  .refine((d) => (d.window ? !!d.overdueFrom : !!d.overdueRelativeToPrevious), {
    message: 'A dose needs an overdue threshold matching its window type',
  });

export const scheduleSeriesSchema = z.object({
  vaccineId: z.string(),
  catchUpThrough: ageSchema.nullable().optional(),
  seriesVariants: z.record(z.string(), z.number()).optional(),
  maximumAgeForFinalDose: ageSchema.optional(),
  note: z.string().optional(),
  olderChildren: z.string().optional(),
  doses: z.array(scheduleDoseSchema).min(1),
});

export const scheduleDataSchema = z.object({
  sample: z.boolean(),
  version: z.string(),
  effectiveDate: z.iso.date(),
  rules: z.record(z.string(), z.string()),
  series: z.array(scheduleSeriesSchema).min(1),
  annual: z.array(
    z.object({
      vaccineId: z.string(),
      startAge: ageSchema,
      routineThrough: ageSchema.optional(),
      season: z.object({ startMonth: z.number().int().min(1).max(12), endMonth: z.number().int().min(1).max(12) }).optional(),
      rule: z.string(),
      overdue: z.string(),
    }),
  ),
  conditional: z.array(z.object({ vaccineId: z.string(), rule: z.string(), appShows: z.string() })),
});

// ---------- data/vaccines/catalog.json ----------

export const vaccineSchema = z.object({
  id: z.string(),
  sample: z.boolean(),
  abbreviation: z.string(),
  name: localizedText,
  searchAliases: z.object({ en: z.array(z.string()), es: z.array(z.string()) }),
  protectsAgainst: localizedText,
  dosesSummary: localizedText,
  commonSideEffects: localizedText,
  reasonsToPostpone: localizedText,
  givenWith: localizedText,
  productNames: z.array(z.string()),
  links: z.object({ healthyChildren: z.url().nullable(), aapFactSheet: z.url().nullable() }),
});

export const catalogSchema = z.object({
  sample: z.boolean(),
  note: z.string().optional(),
  vaccines: z.array(vaccineSchema).min(1),
});

// ---------- data/fixtures/*.json ----------

const fixtureAgeSchema = ageSchema.extend({ plusDays: z.number().int().optional() });

export const fixtureChildSchema = z.object({
  key: z.string(),
  name: z.string(),
  ageToday: fixtureAgeSchema,
  source: z.enum(['myAccount', 'manual']),
  scenario: z.string(),
  pediatrician: z
    .object({ name: z.string().optional(), practice: z.string().optional(), phone: z.string().optional() })
    .nullable()
    .optional(),
  priorReactions: z.string().optional(),
  /** Spanish versions of free text, used for Spanish-language sample accounts. */
  priorReactionsEs: z.string().optional(),
  recordsFromAbroad: z.boolean().optional(),
  medicalConditions: z.string().optional(),
  nextAppointment: z.object({ daysFromToday: z.number().int() }).optional(),
  doses: z
    .array(
      z.object({
        vaccineId: z.string(),
        doseNumber: z.number().int().positive(),
        status: z.enum(['received', 'notSure', 'postponed', 'notGiven', 'declined', 'exemption', 'planned']),
        ageGiven: ageSchema.optional(),
      }),
    )
    .default([]),
  customVaccines: z
    .array(
      z.object({
        nameAsWritten: z.string(),
        country: z.string().optional(),
        ageGiven: ageSchema,
        doseNotes: z.string().optional(),
        doseNotesEs: z.string().optional(),
        pediatricianConfirmed: z.boolean(),
      }),
    )
    .default([]),
  questions: z
    .array(
      z.object({
        text: z.string(),
        textEs: z.string().optional(),
        vaccineId: z.string().optional(),
        origin: z.enum(['manual', 'notSure', 'doseNote', 'customVaccine', 'vaccineDetail']),
        resolved: z.boolean().optional(),
        answer: z.string().optional(),
        answerEs: z.string().optional(),
      }),
    )
    .default([]),
});

export const fixtureAccountSchema = z.object({
  key: z.string(),
  description: z.string(),
  locale: z.enum(['en', 'es']),
  agreementAccepted: z.boolean(),
  onboardingComplete: z.boolean(),
  children: z.array(z.string()),
  myAccountChildren: z.array(z.string()).optional(),
  reminders: z
    .object({
      sms: z.object({ enabled: z.boolean(), phone: z.string().optional() }),
      email: z.object({ enabled: z.boolean(), address: z.string().optional() }),
      leadTimeDays: z.number().int().nonnegative(),
      perChild: z.record(z.string(), z.boolean()),
    })
    .optional(),
});

export const fixturesSchema = z.object({
  sample: z.boolean(),
  accounts: z.array(fixtureAccountSchema),
  children: z.array(fixtureChildSchema),
});

export const scanFixtureSchema = z.object({
  sample: z.boolean(),
  forChild: z.string(),
  extracted: z.array(
    z.object({
      rawName: z.string(),
      rawDate: z.string(),
      matchedVaccineId: z.string().optional(),
      dateAmbiguous: z.boolean(),
      confidence: z.number().min(0).max(1),
      flags: z.array(z.enum(['unrecognized', 'ambiguousDate', 'beforeBirth', 'intervalTooShort', 'duplicate'])),
    }),
  ),
});

export type ScheduleData = z.infer<typeof scheduleDataSchema>;
export type ScheduleSeries = z.infer<typeof scheduleSeriesSchema>;
export type ScheduleDose = z.infer<typeof scheduleDoseSchema>;
export type Vaccine = z.infer<typeof vaccineSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Fixtures = z.infer<typeof fixturesSchema>;
export type FixtureChild = z.infer<typeof fixtureChildSchema>;
export type FixtureAccount = z.infer<typeof fixtureAccountSchema>;
export type ScanFixture = z.infer<typeof scanFixtureSchema>;
