// Mock implementations of the external services in lib/services. No network.
import scanFixtureJson from '@/data/fixtures/scan-extraction.json';
import { scanFixtureSchema, type ScanFixture } from '@/lib/data/schemas';
import { readRawDate } from '@/lib/scan/rawDate';
import type { ExtractedDose, MyAccountChild } from '@/lib/api/schemas';
import type { MyAccountService, NotificationService, OcrService, ReminderMessage } from '@/lib/services';

const scanFixture = scanFixtureSchema.parse(scanFixtureJson);

/** The fixture card was printed for a child born mid-February 2014 (day-first dates). */
const FIXTURE_BIRTH = { year: 2014, month: 2, day: 13 };

/**
 * Moves the card's printed dates by whole months so they fit the scanned
 * child's birth date. Day numbers stay as printed, so "03/04" stays ambiguous
 * and each flag type still appears (SPEC.md §5b note in scan-extraction.json).
 */
export function fitScanToBirthDate(extracted: ScanFixture['extracted'], dob: string): ExtractedDose[] {
  const [y, m, d] = dob.split('-').map(Number);
  const shift = (y - FIXTURE_BIRTH.year) * 12 + (m - FIXTURE_BIRTH.month) + (d > FIXTURE_BIRTH.day ? 1 : 0);
  return extracted.map((e): ExtractedDose => {
    const p = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(e.rawDate);
    if (!p) return { ...e };
    const [day, month, year] = [Number(p[1]), Number(p[2]), Number(p[3])];
    const total = year * 12 + (month - 1) + shift;
    const newMonth = (total % 12) + 1;
    const newYear = Math.floor(total / 12);
    const rawDate = `${String(day).padStart(2, '0')}/${String(newMonth).padStart(2, '0')}/${newYear}`;
    const readings = readRawDate(rawDate);
    const dayFirst = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const flags: ExtractedDose['flags'] = e.flags.filter((f) => f !== 'ambiguousDate' && f !== 'beforeBirth');
    if (readings.ambiguous) flags.push('ambiguousDate');
    if (readings.options.length && readings.options.every((o) => o < dob)) flags.push('beforeBirth');
    return {
      ...e,
      rawDate,
      dateAmbiguous: readings.ambiguous,
      // Ambiguous dates stay unparsed until the caregiver picks a reading in 4c.
      parsedDate: readings.ambiguous ? undefined : dayFirst,
      flags,
    };
  });
}

export const mockOcrService: OcrService = {
  async extract({ childDateOfBirth }) {
    // Always the fixture card (one of each flag), fitted to this child.
    return childDateOfBirth ? fitScanToBirthDate(scanFixture.extracted, childDateOfBirth) : scanFixture.extracted.map((e) => ({ ...e }));
  },
};

export function createMockMyAccountService(profiles: Record<string, MyAccountChild[]>): MyAccountService {
  return {
    async getProfileChildren(myAccountId) {
      return profiles[myAccountId] ?? [];
    },
  };
}

/** Sent reminders, newest first. The Settings dev panel (milestone 8) reads this. */
export const sentReminders: ReminderMessage[] = [];
const listeners = new Set<() => void>();

export const mockNotificationService: NotificationService & {
  subscribe(fn: () => void): () => void;
} = {
  async send(message) {
    sentReminders.unshift(message);
    console.info(`[mock ${message.channel}] to ${message.to}: ${message.body} (${message.deepLink})`);
    listeners.forEach((fn) => fn());
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
