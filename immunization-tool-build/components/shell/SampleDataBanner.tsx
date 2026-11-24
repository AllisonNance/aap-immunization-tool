'use client';
// Dev-only banner while any SAMPLE seed data is loaded (CLAUDE.md, SPEC.md §5b).
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiRequest } from '@/lib/api/client';
import { apiMockingEnabled, entryPath, isDev } from '@/lib/config';
import { sampleDataLoaded } from '@/lib/data';
import s from './shell.module.css';

export function SampleDataBanner() {
  const t = useTranslations('sampleBanner');
  const qc = useQueryClient();
  const router = useRouter();
  if (!isDev || !sampleDataLoaded) return null;
  return (
    <div className={s.sample} role="note">
      <span>{t('text')}</span>
      {apiMockingEnabled && (
        <button
          type="button"
          className={s.sampleReset}
          onClick={async () => {
            await apiRequest('/api/__dev/reset', { method: 'POST' });
            qc.clear();
            router.replace(entryPath);
          }}
        >
          {t('reset')}
        </button>
      )}
    </div>
  );
}
