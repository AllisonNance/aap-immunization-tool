// Locale and message loading. The language lives on the account (SPEC.md §8);
// before login it comes from the toggle on screens 0 and 1a.
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import type { Locale } from '@/lib/api/schemas';
import { ageBetween } from '@/lib/dates';

export const locales: readonly Locale[] = ['en', 'es'];
export const defaultLocale: Locale = 'en';
export const messages = { en, es } as const;
export type Messages = typeof en;

/** Dates always use month names, never numeric-only (SPEC.md §8). */
export function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "March 2025" / "marzo de 2025", for month-only dates of birth. */
export function formatMonthYear(iso: string, locale: Locale): string {
  const [y, m] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** The unit and count used to say a child's age: "6 months", "4 years". */
export function ageParts(dob: string, today: string): { unit: 'days' | 'weeks' | 'months' | 'years'; count: number } {
  const { years, months, days } = ageBetween(dob, today);
  if (months < 1) return days < 14 ? { unit: 'days', count: days } : { unit: 'weeks', count: Math.floor(days / 7) };
  if (months < 24) return { unit: 'months', count: months };
  return { unit: 'years', count: years };
}
