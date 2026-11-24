'use client';
// Something on a screen crashed: say so plainly, offer a retry and a way Home.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertIcon } from '@/components/shell/icons';
import s from '@/components/states/states.module.css';

export default function ErrorScreen({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('states');
  return (
    <section className={s.notFound}>
      <h1>
        <AlertIcon className={s.icon} /> {t('crashTitle')}
      </h1>
      <p>{t('crashBody')}</p>
      <div className={s.actions}>
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t('retry')}
        </button>
        <Link href="/" className="btn">
          {t('home')}
        </Link>
      </div>
    </section>
  );
}
