'use client';
// EN/ES switch. Signed in it saves to the account; on 0 and 1a it applies
// to the signed-out screens (SPEC.md §8).
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useLocaleSetting } from '@/components/providers/LocaleProvider';
import { locales } from '@/lib/i18n';
import s from './LanguageToggle.module.css';

export function LanguageToggle() {
  const t = useTranslations('language');
  const { locale, setLocale, saving } = useLocaleSetting();
  // Unique per instance: Next keeps hidden routes mounted (Activity), and two
  // radio groups sharing a name would uncheck each other.
  const name = useId();
  return (
    <fieldset className={s.toggle} disabled={saving}>
      <legend className="visually-hidden">{t('label')}</legend>
      {locales.map((l) => (
        <label key={l} className={s.option}>
          <input type="radio" name={name} value={l} checked={locale === l} onChange={() => setLocale(l)} />
          {/* Each language name is shown in its own language. */}
          <span lang={l}>{t(l)}</span>
        </label>
      ))}
    </fieldset>
  );
}
