'use client';
// Stand-in for screens built in later milestones (SPEC.md §12). Shows the IA
// screen number so design and code stay traceable.
import { useTranslations } from 'next-intl';
import type { ScreenId } from '@/lib/routes';
import s from './shell.module.css';

export function ScreenPlaceholder({ screen }: { screen: ScreenId }) {
  const t = useTranslations();
  return (
    <section>
      <h1>
        <span className={s.screenTag}>{screen}</span> {t(`screens.${screen}`)}
      </h1>
      <div className={s.placeholder}>
        <p>{t('placeholder.body', { screen })}</p>
      </div>
    </section>
  );
}
