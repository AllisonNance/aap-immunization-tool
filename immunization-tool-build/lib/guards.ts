// Route guards (SPEC.md §3). Pure: given who is signed in and where they are,
// decide whether to render, wait for data, or redirect.
import { AGREEMENT_VERSION } from '@/lib/config';
import type { Account, Child } from '@/lib/api/schemas';
import { routeMeta } from '@/lib/routes';

export type GuardResult = { kind: 'render' } | { kind: 'wait' } | { kind: 'redirect'; to: string };

const render: GuardResult = { kind: 'render' };
const wait: GuardResult = { kind: 'wait' };
const go = (to: string): GuardResult => ({ kind: 'redirect', to });

/** Only same-app paths are allowed as a return target (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;
}

export function needsAgreement(account: Account): boolean {
  return account.agreementVersionAccepted !== AGREEMENT_VERSION;
}

/** Where an unfinished onboarding resumes: the first unfinished child (lowest setupOrder). */
export function onboardingTarget(children: Child[]): string {
  const ordered = [...children].sort((a, b) => a.setupOrder - b.setupOrder);
  const unfinished = ordered.find((c) => !c.setupComplete);
  if (unfinished) return `/onboarding/setup/${unfinished.id}`;
  // Every child is set up but Finish never landed: reopen the last one.
  const last = ordered.at(-1);
  return last ? `/onboarding/setup/${last.id}` : '/onboarding/children';
}

export function guard(input: {
  pathname: string;
  search: string;
  account: Account | null | undefined; // undefined = still loading
  children: Child[] | undefined; // undefined = not loaded yet
  /** Where logged-out visitors go: screen 0, or the dev sample-data page. */
  entry?: string;
}): GuardResult {
  const { pathname, search, account, children, entry = '/login' } = input;
  const meta = routeMeta(pathname);
  if (!meta) return render; // unknown path → Next's not-found
  if (account === undefined) return meta.auth ? wait : render;

  // Not logged in → /login?next=<original> (or the dev entry page, which passes next on)
  if (account === null) {
    if (!meta.auth) return render;
    return go(`${entry}?next=${encodeURIComponent(pathname + search)}`);
  }

  // Screen 0 while signed in: allowed (switching accounts in dev).
  if (meta.screen === '0') return render;

  // Agreement not accepted, or the terms version changed → 1a.
  if (needsAgreement(account)) return meta.screen === '1a' ? render : go('/onboarding/agreement');

  if (!account.onboardingComplete) {
    if (children === undefined) return wait;
    if (meta.screen === '1b' && pathname === '/onboarding/children' && children.length === 0) return render;
    if (meta.screen === '1c' && pathname.startsWith('/onboarding/setup/')) {
      const id = decodeURIComponent(pathname.split('/')[3] ?? '');
      if (children.some((c) => c.id === id)) return render;
    }
    return go(onboardingTarget(children));
  }

  // Onboarding done: its screens no longer apply.
  if (pathname.startsWith('/onboarding/')) return go('/');
  return render;
}
