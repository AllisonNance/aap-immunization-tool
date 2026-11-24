// Shapes the HealthyChildren.org account API returns and accepts (SPEC.md §5, §5a).
// Shared by the API client, the MSW mock and (later) forms.
import { z } from 'zod';

export const localeSchema = z.enum(['en', 'es']);

const isoDate = z.iso.date();
const timestamps = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };

export const accountSchema = z.object({
  id: z.string(),
  myAccountId: z.string(),
  locale: localeSchema,
  agreementVersionAccepted: z.string().optional(),
  agreementAcceptedAt: z.iso.datetime().optional(),
  onboardingComplete: z.boolean(),
  ...timestamps,
});

export const pediatricianSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  practice: z.string().optional(),
});

// Children are created set up in 1b (name + date of birth). The schema still
// allows a draft (setupComplete: false, no DOB) for API compatibility.
const childFields = z.object({
  id: z.string(),
  accountId: z.string(),
  source: z.enum(['myAccount', 'manual']),
  myAccountChildId: z.string().optional(),
  name: z.string(),
  dateOfBirth: isoDate.optional(),
  /**
   * 'month' when the caregiver gave only month and year (children added by hand
   * in 1b): dateOfBirth is then the 1st of that month. Absent means a full date.
   */
  dateOfBirthPrecision: z.enum(['day', 'month']).optional(),
  setupComplete: z.boolean(),
  setupOrder: z.number().int(),
  medicalConditions: z.string().optional(),
  pediatrician: pediatricianSchema.optional(),
  recordsFromAbroad: z.boolean().optional(),
  /** Asked in Child Setup (1c). Optional: unanswered until the caregiver says. */
  alternateSchedule: z.enum(['yes', 'no', 'notSure']).optional(),
  livedOutsideUs: z.enum(['yes', 'no']).optional(),
  /** The caregiver dismissed the "Complete profile" card on the child page (it stays in Settings › Children). */
  profilePromptDismissed: z.boolean().optional(),
  priorReactions: z.string().optional(),
  nextAppointment: isoDate.optional(),
  ...timestamps,
});

const setUpRule = (c: { setupComplete?: boolean; name?: string; dateOfBirth?: string }) =>
  !c.setupComplete || (!!c.name?.trim() && !!c.dateOfBirth);
const setUpRuleMessage = { message: 'A set-up child needs a name and date of birth' };

export const childSchema = childFields.refine(setUpRule, setUpRuleMessage);
/** Body of POST /api/children (one entry). */
export const newChildSchema = childFields
  .omit({ id: true, accountId: true, createdAt: true, updatedAt: true })
  .refine(setUpRule, setUpRuleMessage);
/** Body of PATCH /api/children/:id. */
export const childPatchSchema = childFields
  .omit({ id: true, accountId: true, createdAt: true, updatedAt: true })
  .partial()
  .extend({ updatedAt: z.string() });

export const myAccountChildSchema = z.object({
  myAccountChildId: z.string(),
  name: z.string(),
  dateOfBirth: isoDate,
  pediatrician: pediatricianSchema.optional(),
});

// 'declined' (not in SPEC.md §5): the caregiver chose not to have the dose. Like
// 'notGiven', it's never overdue and doesn't count as history.
// 'planned' (not in SPEC.md §5): a caregiver-set date for an upcoming dose
// (customTargetDate, "Customize timing"). It never counts as history.
export const doseStatusSchema = z.enum(['received', 'notSure', 'postponed', 'notGiven', 'declined', 'exemption', 'planned']);

export const doseRecordSchema = z.object({
  id: z.string(),
  childId: z.string(),
  vaccineId: z.string(),
  doseNumber: z.number().int().positive(),
  status: doseStatusSchema,
  dateGiven: isoDate.optional(),
  postponedUntil: isoDate.optional(),
  customTargetDate: isoDate.optional(),
  reactionNotes: z.string().optional(),
  /** Received as one of the child's custom vaccines (e.g. a vaccine from another country), not in SPEC.md §5. */
  customVaccineId: z.string().optional(),
  source: z.enum(['manual', 'scan']),
  scanId: z.string().optional(),
  ...timestamps,
});

export const partialDateSchema = z.object({
  year: z.number().int().min(1900),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31).optional(),
});

export const customVaccineEntrySchema = z.object({
  id: z.string(),
  childId: z.string(),
  nameAsWritten: z.string().min(1),
  country: z.string().optional(),
  dateGiven: partialDateSchema,
  doseNotes: z.string().optional(),
  pediatricianConfirmed: z.boolean(),
  source: z.enum(['manual', 'scan']),
  scanId: z.string().optional(),
  ...timestamps,
});

export const exemptionSchema = z.object({
  id: z.string(),
  childId: z.string(),
  vaccineId: z.string(),
  fromDoseNumber: z.number().int().positive(),
  note: z.string().optional(),
  ...timestamps,
});

export const questionSchema = z.object({
  id: z.string(),
  childId: z.string(),
  text: z.string().min(1),
  vaccineId: z.string().optional(),
  doseRecordId: z.string().optional(),
  customVaccineId: z.string().optional(),
  origin: z.enum(['manual', 'notSure', 'doseNote', 'customVaccine', 'vaccineDetail']),
  resolved: z.boolean(),
  /** The caregiver's note of the pediatrician's answer (optional; not in SPEC.md §5). */
  answer: z.string().optional(),
  ...timestamps,
});

export const reminderPrefsSchema = z.object({
  accountId: z.string(),
  sms: z.object({ enabled: z.boolean(), phone: z.string().optional() }),
  email: z.object({ enabled: z.boolean(), address: z.string().optional() }),
  leadTimeDays: z.number().int().nonnegative(),
  perChild: z.record(z.string(), z.boolean()),
  updatedAt: z.iso.datetime(),
});

export const extractedDoseSchema = z.object({
  rawName: z.string(),
  rawDate: z.string(),
  matchedVaccineId: z.string().optional(),
  parsedDate: isoDate.optional(),
  /** Set in review (4c); otherwise the next unrecorded dose. */
  doseNumber: z.number().int().positive().optional(),
  dateAmbiguous: z.boolean(),
  confidence: z.number().min(0).max(1),
  flags: z.array(z.enum(['unrecognized', 'ambiguousDate', 'beforeBirth', 'intervalTooShort', 'duplicate'])),
  decision: z.enum(['confirm', 'remove', 'custom']).optional(),
});

export const scanSessionSchema = z.object({
  id: z.string(),
  childId: z.string(),
  images: z.array(z.string()),
  extracted: z.array(extractedDoseSchema),
  status: z.enum(['pending', 'reviewed', 'discarded']),
  ...timestamps,
});

export const childRecordSchema = z.object({
  doses: z.array(doseRecordSchema),
  customVaccines: z.array(customVaccineEntrySchema),
  exemptions: z.array(exemptionSchema),
});

export const apiErrorBodySchema = z.object({ error: z.string(), message: z.string().optional() });

export type Locale = z.infer<typeof localeSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Child = z.infer<typeof childSchema>;
/** A set-up child: name and DOB are known. Only these appear in the selector. */
export type SetUpChild = Child & { dateOfBirth: string };
export function isSetUp(c: Child): c is SetUpChild {
  return c.setupComplete && !!c.dateOfBirth;
}
export type MyAccountChild = z.infer<typeof myAccountChildSchema>;
export type DoseStatus = z.infer<typeof doseStatusSchema>;
export type DoseRecord = z.infer<typeof doseRecordSchema>;
export type CustomVaccineEntry = z.infer<typeof customVaccineEntrySchema>;
export type Exemption = z.infer<typeof exemptionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type ReminderPrefs = z.infer<typeof reminderPrefsSchema>;
export type ExtractedDose = z.infer<typeof extractedDoseSchema>;
export type ScanSession = z.infer<typeof scanSessionSchema>;
export type ChildRecord = z.infer<typeof childRecordSchema>;

/** Fields the server owns; never sent on create. */
type ServerOwned = 'id' | 'createdAt' | 'updatedAt';
export type NewChild = Omit<Child, ServerOwned | 'accountId'>;
export type NewDose = Omit<DoseRecord, ServerOwned | 'childId'>;
export type NewCustomVaccine = Omit<CustomVaccineEntry, ServerOwned | 'childId'>;
export type NewExemption = Omit<Exemption, ServerOwned | 'childId'>;
export type NewQuestion = Omit<Question, ServerOwned | 'childId' | 'resolved'> & { resolved?: boolean };
/** Every PATCH sends back the updatedAt it read; a stale one gets 409 (§5a Concurrency). */
export type Patch<T> = Partial<Omit<T, ServerOwned>> & { updatedAt: string };
