'use client';
import { useTranslations } from 'next-intl';
import { todayISO } from '@/lib/dates';
import { ageParts } from '@/lib/i18n';

/** "6 months", "5 years" (SPEC.md §8). */
export function useAgeLabel() {
  const t = useTranslations('age');
  return (dateOfBirth: string, today: string = todayISO()) => {
    const { unit, count } = ageParts(dateOfBirth, today);
    return t(unit, { count });
  };
}
