'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <section>
      <h1>{t('title')}</h1>
      <Link href="/" className="btn btn-primary">
        {t('home')}
      </Link>
    </section>
  );
}
