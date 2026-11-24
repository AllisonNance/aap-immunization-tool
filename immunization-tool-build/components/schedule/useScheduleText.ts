'use client';
// Words for schedule data: vaccine names, age windows ("6–18 months"), and
// dose/seasonal state labels. All copy comes from messages/*.json and the
// catalog (SPEC.md §8); thresholds come from data/schedule.
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/lib/api/schemas';
import { getVaccine, schedule } from '@/lib/data';
import type { Age } from '@/lib/dates';
import { formatDate, formatMonthYear } from '@/lib/i18n';
import type { DoseState, SeasonalStateKind } from '@/lib/schedule';

function doseData(vaccineId: string, doseNumber: number) {
  return schedule.series.find((s) => s.vaccineId === vaccineId)?.doses.find((d) => d.dose === doseNumber);
}

export function useScheduleText() {
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const age = (a: Age) => (a.value === 0 ? t('ages.birth') : t(`age.${a.unit}`, { count: a.value }));
  const range = (s: Age, e: Age) => {
    if (s.value === e.value && s.unit === e.unit) return age(s);
    if (s.unit === e.unit && s.value > 0) return t('ages.range', { start: s.value, end: t(`age.${e.unit}`, { count: e.value }) });
    return t('ages.rangeMixed', { start: age(s), end: age(e) });
  };

  return {
    locale,
    vaccineName: (id: string) => getVaccine(id)?.name[locale] ?? id,
    vaccineShort: (id: string) => getVaccine(id)?.abbreviation ?? id,
    /** One-line "why": what the vaccine protects against. */
    vaccineWhy: (id: string) => getVaccine(id)?.protectsAgainst[locale] ?? '',
    /** "6–18 months", "2 months", "Birth", "6–12 months after dose 1". */
    windowLabel: (vaccineId: string, doseNumber: number) => {
      const d = doseData(vaccineId, doseNumber);
      if (!d) return '';
      if (d.window) return range(d.window.start, d.window.end);
      if (d.windowRelativeToPrevious) {
        return t('ages.afterDose', { range: range(d.windowRelativeToPrevious.start, d.windowRelativeToPrevious.end), dose: doseNumber - 1 });
      }
      return '';
    },
    doseLabel: (doseNumber: number) => t('schedule.dose', { n: doseNumber }),
    /**
     * Short label for a dose's state, with its date where it has one. Past the
     * age limit, it names the child when `childName` is given.
     */
    stateLabel: (d: DoseState, childName?: string) => {
      switch (d.state) {
        case 'noLongerRecommended':
          if (!childName) return t('doseState.noLongerRecommended');
          return d.ageLimit === 'remaining'
            ? t('doseState.pastAgeLimitRemaining', { name: childName })
            : t('doseState.pastAgeLimitStart', { name: childName });
        case 'received':
          return d.record?.dateGiven ? t('doseState.receivedOn', { date: formatDate(d.record.dateGiven, locale) }) : t('doseState.received');
        case 'upcoming':
          if (d.plannedDate) return t('doseState.plannedFor', { date: formatDate(d.plannedDate, locale) });
          // Computed from the birth date: month and year only, so the birth day isn't revealed.
          return d.windowStart ? t('doseState.upcomingFrom', { date: formatMonthYear(d.windowStart, locale) }) : t('doseState.upcoming');
        case 'postponed':
          return d.plannedDate ? t('doseState.postponedTo', { date: formatDate(d.plannedDate, locale) }) : t('doseState.postponed');
        default:
          return t(`doseState.${d.state}`);
      }
    },
    seasonalLabel: (state: SeasonalStateKind) => t(`seasonal.${state}`),
    /** A recorded date (given, postponed to): full date. */
    date: (iso: string) => formatDate(iso, locale),
    /** A date computed from the birth date: month and year only. */
    monthYear: (iso: string) => formatMonthYear(iso, locale),
  };
}
