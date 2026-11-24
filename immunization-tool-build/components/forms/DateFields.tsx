'use client';
// Month-name date picker (SPEC.md §6.4d, §8): month chosen by name, day and
// year typed, so day-first and month-first dates can't be confused. Modes:
// full date (Edit Child, 3), day optional (custom vaccines, 4d), and month +
// year only (birth month for children added in 1b).
import { useLocale, useTranslations } from 'next-intl';
import { useId, type Ref } from 'react';
import type { DateInput } from '@/lib/dates';
import s from './DateFields.module.css';

function monthNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return Array.from({ length: 12 }, (_, i) => {
    const name = fmt.format(new Date(Date.UTC(2000, i, 1)));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

export function DateFields(props: {
  legend: string;
  value: DateInput;
  onChange(value: DateInput): void;
  /** Day may be left blank (custom vaccines). */
  dayOptional?: boolean;
  /** Month and year only, no day field. */
  monthYearOnly?: boolean;
  invalid?: boolean;
  /** Id of the error/warning text, linked from every part. */
  describedBy?: string;
  /** Receives the first part, so a form can focus it on error. */
  firstRef?: Ref<HTMLSelectElement | HTMLInputElement>;
}) {
  const { legend, value, onChange, dayOptional, monthYearOnly, invalid, describedBy, firstRef } = props;
  const t = useTranslations('dateFields');
  const locale = useLocale();
  const uid = useId();
  const set = (key: keyof DateInput) => (v: string) => onChange({ ...value, [key]: v });

  const digits = (max: number) => (e: React.ChangeEvent<HTMLInputElement>) => e.target.value.replace(/\D/g, '').slice(0, max);
  const common = {
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
  };

  const month = (
    <div className={`${s.part} ${s.month}`} key="month">
      <label htmlFor={`${uid}-month`} className={s.label}>
        {t('month')}
      </label>
      <select
        id={`${uid}-month`}
        ref={locale === 'es' && !monthYearOnly ? undefined : (firstRef as Ref<HTMLSelectElement>)}
        className={s.input}
        value={value.month}
        onChange={(e) => set('month')(e.target.value)}
        {...common}
      >
        <option value="">{t('monthPlaceholder')}</option>
        {monthNames(locale).map((name, i) => (
          <option key={name} value={String(i + 1)}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
  const day = (
    <div className={`${s.part} ${s.day}`} key="day">
      <label htmlFor={`${uid}-day`} className={s.label}>
        {dayOptional ? t('dayOptional') : t('day')}
      </label>
      <input
        id={`${uid}-day`}
        ref={locale === 'es' && !monthYearOnly ? (firstRef as Ref<HTMLInputElement>) : undefined}
        className={s.input}
        inputMode="numeric"
        autoComplete="off"
        value={value.day}
        onChange={(e) => set('day')(digits(2)(e))}
        {...common}
      />
    </div>
  );
  const year = (
    <div className={`${s.part} ${s.year}`} key="year">
      <label htmlFor={`${uid}-year`} className={s.label}>
        {t('year')}
      </label>
      <input
        id={`${uid}-year`}
        className={s.input}
        inputMode="numeric"
        autoComplete="off"
        value={value.year}
        onChange={(e) => set('year')(digits(4)(e))}
        {...common}
      />
    </div>
  );

  // English reads Month Day Year; Spanish reads Día Mes Año. Month + year reads the same in both.
  const parts = monthYearOnly ? [month, year] : locale === 'es' ? [day, month, year] : [month, day, year];

  return (
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>{legend}</legend>
      <div className={s.row}>{parts}</div>
    </fieldset>
  );
}
