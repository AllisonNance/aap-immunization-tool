'use client';
// Shared loading, error and not-found states (milestone 9: every screen has
// them). Loading is announced politely; errors say what happened and offer a
// retry. Grayscale; status by text and icon, never color.
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { AlertIcon } from '@/components/shell/icons';
import s from './states.module.css';

export function Loading() {
  const t = useTranslations('states');
  return (
    <div className={s.loading} role="status" aria-live="polite" data-testid="loading">
      <span className={s.bar} aria-hidden />
      <span className={s.bar} aria-hidden />
      <span className={s.barShort} aria-hidden />
      <span className="visually-hidden">{t('loading')}</span>
    </div>
  );
}

export function LoadError({ onRetry, offline }: { onRetry?: () => void; offline?: boolean }) {
  const t = useTranslations('states');
  return (
    <div className={s.error} role="alert" data-testid="load-error">
      <AlertIcon className={s.icon} />
      <div>
        <p className={s.title}>{t('errorTitle')}</p>
        <p>{offline ? t('errorOffline') : t('errorBody')}</p>
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry}>
            {t('retry')}
          </button>
        )}
      </div>
    </div>
  );
}

export function NotFoundState({ title, body, href, linkLabel }: { title: string; body?: string; href: string; linkLabel: string }) {
  return (
    <section className={s.notFound}>
      <h1>{title}</h1>
      {body && <p>{body}</p>}
      <Link href={href} className="btn btn-primary">
        {linkLabel}
      </Link>
    </section>
  );
}

type AnyQuery = Pick<UseQueryResult<unknown>, 'isPending' | 'isError' | 'error' | 'refetch' | 'fetchStatus'> | undefined;

/**
 * Loading / error gate for a screen's queries. Returns the state to show, or
 * null when the data is ready. `waiting` covers derived data (e.g. a child
 * that isn't in the list yet). Disabled queries (fetchStatus idle) don't block.
 */
export function useGate(queries: AnyQuery[], waiting = false): ReactNode | null {
  const qc = useQueryClient();
  const failed = queries.filter((q) => q?.isError);
  if (failed.length) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const network = failed.some((q) => q?.error instanceof ApiError && q.error.kind === 'network');
    return (
      <LoadError
        offline={offline || network}
        onRetry={() => {
          for (const q of failed) q?.refetch();
          qc.invalidateQueries();
        }}
      />
    );
  }
  const pending = queries.some((q) => q?.isPending && q.fetchStatus !== 'idle');
  if (pending || waiting) return <Loading />;
  return null;
}
