'use client';
// Frame for every screen: sample-data banner, child selector or editing
// banner, content, and the bottom tab bar, all decided by lib/routes.ts.
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { LoadError, Loading } from '@/components/states/States';
import { OfflineBanner } from '@/components/states/OfflineBanner';
import { ApiError } from '@/lib/api/client';
import { useAccount, useChildren } from '@/lib/api/hooks';
import { entryPath } from '@/lib/config';
import { guard } from '@/lib/guards';
import { routeMeta } from '@/lib/routes';
import { ChildSelector } from './ChildSelector';
import { EditingBanner } from './EditingBanner';
import { SampleDataBanner } from './SampleDataBanner';
import { SelectedChildProvider, useSelectedChild } from './SelectedChild';
import { BrandFooter } from './BrandFooter';
import { useTrackInAppHistory } from './inAppHistory';
import { TabBar } from './TabBar';
import s from './shell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations('app');
  const tBrand = useTranslations('brand');
  const meta = routeMeta(pathname);
  useTrackInAppHistory();
  const accountQ = useAccount();
  const account = accountQ.data;
  const signedIn = !!account;
  const childrenQ = useChildren(signedIn);
  const accountChildren = childrenQ.data;
  // The account or child list couldn't load: the guards can't decide, so say so and offer a retry.
  const failed = accountQ.isError ? accountQ : signedIn && childrenQ.isError ? childrenQ : null;

  // Route guards (SPEC.md §3): login, agreement, onboarding/resume.
  const qs = search.toString();
  const decision = guard({
    pathname,
    search: qs ? `?${qs}` : '',
    account,
    children: accountChildren,
    entry: entryPath,
  });
  const redirectTo = decision.kind === 'redirect' ? decision.to : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  const ready = !failed && decision.kind === 'render';
  const showTabs = ready && signedIn && meta?.kind === 'page' && meta.tab !== null && !meta.actionBar;
  // Forms and 4a have a fixed action bar at the bottom; keep the logo footer clear of it.
  const bottomBar = ready && signedIn && !showTabs && (meta?.kind === 'form' || !!meta?.actionBar);

  return (
    <SelectedChildProvider enabled={signedIn}>
      <a href="#main" className="skip-link">
        {t('skipToContent')}
      </a>
      <div className={s.frame}>
        <header className={s.top}>
          <SampleDataBanner />
          <OfflineBanner />
          <div className={s.brandBar}>
            <div className={s.brandInner}>
              <Link href="/" className={s.brand}>
                {/* eslint-disable-next-line @next/next/no-img-element -- static brand art */}
                <img src="/brand/healthychildren.svg" alt={tBrand('healthyChildren')} className={s.brandLogo} width={350} height={55} />
                <span className={s.product}>{t('name')}</span>
              </Link>
              {ready && meta?.selector && meta.kind !== 'form' && <ChildSelector />}
            </div>
          </div>
        </header>
        {ready && meta?.selector && meta.kind === 'form' && (
          <div className={s.editingBar}>
            <EditingBanner />
          </div>
        )}
        <main id="main" className={s.main} data-screen={meta?.screen}>
          {failed ? (
            <LoadError onRetry={() => failed.refetch()} offline={failed.error instanceof ApiError && failed.error.kind === 'network'} />
          ) : ready ? (
            <ChildGate>{children}</ChildGate>
          ) : (
            <Loading />
          )}
        </main>
        <BrandFooter withTabs={showTabs} withBar={bottomBar} />
        {showTabs && <TabBar active={meta!.tab} />}
      </div>
    </SelectedChildProvider>
  );
}

/** Child not on this account → not-found with a way Home (SPEC.md §3). */
function ChildGate({ children }: { children: ReactNode }) {
  const t = useTranslations('notFound');
  const { urlChildMissing } = useSelectedChild();
  if (!urlChildMissing) return children;
  return (
    <section>
      <h1>{t('childTitle')}</h1>
      <Link href="/" className="btn btn-primary">
        {t('home')}
      </Link>
    </section>
  );
}
