'use client';
// Shown while the device is offline: data lives on the caregiver's account,
// so nothing can be saved until they reconnect (SPEC.md §5a).
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import s from './states.module.css';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function OfflineBanner() {
  const t = useTranslations('states');
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p className={s.offline} role="status" data-testid="offline-banner">
      {t('offline')}
    </p>
  );
}
