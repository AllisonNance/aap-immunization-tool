// In-memory store behind the mock API, seeded from data/fixtures/accounts.json.
// Fixture ages are relative, so dates are computed from `today` at seed time
// (SPEC.md §5b). Every seeded entry keeps `sample: true`.
import fixturesJson from '@/data/fixtures/accounts.json';
import { AGREEMENT_VERSION } from '@/lib/config';
import { fixturesSchema, type FixtureAccount, type FixtureChild } from '@/lib/data/schemas';
import { addAge, addDays } from '@/lib/dates';
import type { ReminderMessage } from '@/lib/services';
import type {
  Account,
  Child,
  CustomVaccineEntry,
  DoseRecord,
  Exemption,
  MyAccountChild,
  Question,
  ReminderPrefs,
  ScanSession,
} from '@/lib/api/schemas';

type Sample = { sample: true };

export interface MockDb {
  version: 1;
  fixturesHash: string;
  seededOn: string;
  /** Mock of the HTTP-only session cookie: which account is signed in. */
  session: { accountId: string } | null;
  /** Dev only: the sample account Log in signs in to (chosen on /start). */
  devSelectedAccount?: string;
  /** Dev only: reminders the mock NotificationService "sent" (newest first). */
  sentReminders?: Array<ReminderMessage & { sentAt: string }>;
  accounts: Array<Account & Sample & { key: string }>;
  myAccountProfiles: Record<string, MyAccountChild[]>;
  children: Array<Child & Sample>;
  doses: Array<DoseRecord & Sample>;
  customVaccines: Array<CustomVaccineEntry & Sample>;
  exemptions: Array<Exemption & Sample>;
  questions: Array<Question & Sample>;
  reminders: Array<ReminderPrefs & Sample>;
  scans: Array<ScanSession & Sample>;
}

export const fixtures = fixturesSchema.parse(fixturesJson);

export const DEFAULT_DEV_ACCOUNT = 'demo-family';

/** Changes whenever accounts.json changes, so a persisted dev DB reseeds itself. */
export const fixturesHash = (() => {
  const text = JSON.stringify(fixturesJson);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
})();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowStamp(): string {
  return new Date().toISOString();
}

function dobFor(child: FixtureChild, today: string): string {
  const back = addAge(today, child.ageToday, -1);
  return addDays(back, -(child.ageToday.plusDays ?? 0));
}

export function seedDb(today: string): MockDb {
  const stamp = nowStamp();
  const db: MockDb = {
    version: 1,
    fixturesHash,
    seededOn: today,
    session: null,
    accounts: [],
    myAccountProfiles: {},
    children: [],
    doses: [],
    customVaccines: [],
    exemptions: [],
    questions: [],
    reminders: [],
    scans: [],
  };
  const childByKey = new Map(fixtures.children.map((c) => [c.key, c]));

  for (const fa of fixtures.accounts) {
    const accountId = newId();
    const myAccountId = `mock-myaccount-${fa.key}`;
    db.accounts.push({
      sample: true,
      key: fa.key,
      id: accountId,
      myAccountId,
      locale: fa.locale,
      agreementVersionAccepted: fa.agreementAccepted ? AGREEMENT_VERSION : undefined,
      agreementAcceptedAt: fa.agreementAccepted ? stamp : undefined,
      onboardingComplete: fa.onboardingComplete,
      createdAt: stamp,
      updatedAt: stamp,
    });

    // Children on the My Account profile (offered in 1b). Tracked children
    // with source 'myAccount' are on the profile too.
    const profileKeys = new Set([
      ...(fa.myAccountChildren ?? []),
      ...fa.children.filter((k) => childByKey.get(k)?.source === 'myAccount'),
    ]);
    db.myAccountProfiles[myAccountId] = [...profileKeys].map((key) => {
      const fc = childByKey.get(key)!;
      return {
        myAccountChildId: `${myAccountId}-${key}`,
        name: fc.name,
        dateOfBirth: dobFor(fc, today),
        pediatrician: fc.pediatrician ?? undefined,
      };
    });

    const childIdByKey: Record<string, string> = {};
    fa.children.forEach((key, i) => {
      const fc = childByKey.get(key);
      if (!fc) throw new Error(`Fixture account ${fa.key} references unknown child ${key}`);
      childIdByKey[key] = seedChild(db, fc, { accountId, myAccountId, order: i, today, stamp, locale: fa.locale });
    });

    if (fa.reminders) db.reminders.push(seedReminders(fa, accountId, childIdByKey, stamp));
  }
  return db;
}

function seedChild(
  db: MockDb,
  fc: FixtureChild,
  ctx: { accountId: string; myAccountId: string; order: number; today: string; stamp: string; locale: 'en' | 'es' },
): string {
  const { accountId, myAccountId, order, today, stamp, locale } = ctx;
  // Free text the caregiver "typed": in the account's language for sample accounts.
  const es = locale === 'es';
  const childId = newId();
  const dob = dobFor(fc, today);
  const base = { sample: true as const, createdAt: stamp, updatedAt: stamp, childId };

  db.children.push({
    sample: true,
    id: childId,
    accountId,
    source: fc.source,
    myAccountChildId: fc.source === 'myAccount' ? `${myAccountId}-${fc.key}` : undefined,
    name: fc.name,
    dateOfBirth: dob,
    setupComplete: true,
    setupOrder: order,
    medicalConditions: fc.medicalConditions,
    pediatrician: fc.pediatrician ?? undefined,
    recordsFromAbroad: fc.recordsFromAbroad,
    priorReactions: (es && fc.priorReactionsEs) || fc.priorReactions,
    nextAppointment: fc.nextAppointment ? addDays(today, fc.nextAppointment.daysFromToday) : undefined,
    createdAt: stamp,
    updatedAt: stamp,
  });

  const notSureDoseId: Record<string, string> = {};
  for (const d of fc.doses) {
    const id = newId();
    if (d.status === 'notSure') notSureDoseId[d.vaccineId] = id;
    db.doses.push({
      ...base,
      id,
      vaccineId: d.vaccineId,
      doseNumber: d.doseNumber,
      status: d.status,
      dateGiven: d.ageGiven ? addAge(dob, d.ageGiven) : undefined,
      source: 'manual',
    });
  }

  const customIds: string[] = [];
  for (const cv of fc.customVaccines) {
    const id = newId();
    customIds.push(id);
    const [y, m, d] = addAge(dob, cv.ageGiven).split('-').map(Number);
    db.customVaccines.push({
      ...base,
      id,
      nameAsWritten: cv.nameAsWritten,
      country: cv.country,
      dateGiven: { year: y, month: m, day: d },
      doseNotes: (es && cv.doseNotesEs) || cv.doseNotes,
      pediatricianConfirmed: cv.pediatricianConfirmed,
      source: 'manual',
    });
  }

  for (const q of fc.questions) {
    db.questions.push({
      ...base,
      id: newId(),
      text: (es && q.textEs) || q.text,
      vaccineId: q.vaccineId,
      origin: q.origin,
      resolved: q.resolved ?? false,
      answer: (es && q.answerEs) || q.answer,
      // Link auto-added questions to what created them.
      doseRecordId: q.origin === 'notSure' && q.vaccineId ? notSureDoseId[q.vaccineId] : undefined,
      customVaccineId: q.origin === 'customVaccine' ? customIds[0] : undefined,
    });
  }
  return childId;
}

function seedReminders(
  fa: FixtureAccount,
  accountId: string,
  childIdByKey: Record<string, string>,
  stamp: string,
): ReminderPrefs & Sample {
  const r = fa.reminders!;
  return {
    sample: true,
    accountId,
    sms: r.sms,
    email: r.email,
    leadTimeDays: r.leadTimeDays,
    perChild: Object.fromEntries(
      Object.entries(r.perChild)
        .filter(([key]) => childIdByKey[key])
        .map(([key, on]) => [childIdByKey[key], on]),
    ),
    updatedAt: stamp,
  };
}
