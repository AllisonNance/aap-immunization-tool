import { describe, expect, it } from 'vitest';
import type { Account, Child } from '@/lib/api/schemas';
import { AGREEMENT_VERSION } from '@/lib/config';
import { guard, safeNext } from '@/lib/guards';

const stamp = '2026-11-23T00:00:00.000Z';
const account = (over: Partial<Account> = {}): Account => ({
  id: 'acc',
  myAccountId: 'my',
  locale: 'en',
  agreementVersionAccepted: AGREEMENT_VERSION,
  onboardingComplete: true,
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});
const child = (id: string, order: number, setupComplete: boolean): Child => ({
  id,
  accountId: 'acc',
  source: 'manual',
  name: setupComplete ? `Kid ${id}` : '',
  dateOfBirth: setupComplete ? '2020-01-01' : undefined,
  setupComplete,
  setupOrder: order,
  createdAt: stamp,
  updatedAt: stamp,
});
const g = (pathname: string, acc: Account | null | undefined, children?: Child[], search = '') =>
  guard({ pathname, search, account: acc, children });

describe('route guards (SPEC.md §3)', () => {
  it('sends a logged-out deep link to login with next (scenario 11)', () => {
    expect(g('/child/abc', null, undefined, '?x=1')).toEqual({ kind: 'redirect', to: '/login?next=%2Fchild%2Fabc%3Fx%3D1' });
    expect(g('/login', null)).toEqual({ kind: 'render' });
  });

  it('can send logged-out visitors to the dev sample-data page, keeping next', () => {
    expect(guard({ pathname: '/vaccines', search: '', account: null, children: undefined, entry: '/start' })).toEqual({
      kind: 'redirect',
      to: '/start?next=%2Fvaccines',
    });
    expect(g('/start', null)).toEqual({ kind: 'render' });
  });

  it('waits while the account loads', () => {
    expect(g('/', undefined)).toEqual({ kind: 'wait' });
  });

  it('requires the current agreement version', () => {
    expect(g('/', account({ agreementVersionAccepted: undefined }))).toEqual({ kind: 'redirect', to: '/onboarding/agreement' });
    expect(g('/', account({ agreementVersionAccepted: 'old-version' }))).toEqual({ kind: 'redirect', to: '/onboarding/agreement' });
    expect(g('/onboarding/agreement', account({ agreementVersionAccepted: undefined }))).toEqual({ kind: 'render' });
  });

  it('sends a new account with no children to Add Children', () => {
    const acc = account({ onboardingComplete: false });
    expect(g('/', acc, [])).toEqual({ kind: 'redirect', to: '/onboarding/children' });
    expect(g('/onboarding/children', acc, [])).toEqual({ kind: 'render' });
  });

  it('resumes at the first unfinished child (scenario 2)', () => {
    const acc = account({ onboardingComplete: false });
    const kids = [child('b', 1, false), child('a', 0, true)];
    expect(g('/', acc, kids)).toEqual({ kind: 'redirect', to: '/onboarding/setup/b' });
    expect(g('/onboarding/children', acc, kids)).toEqual({ kind: 'redirect', to: '/onboarding/setup/b' });
    // Back to an already-saved child is allowed.
    expect(g('/onboarding/setup/a', acc, kids)).toEqual({ kind: 'render' });
    expect(g('/onboarding/setup/zzz', acc, kids)).toEqual({ kind: 'redirect', to: '/onboarding/setup/b' });
  });

  it('waits for children before deciding onboarding', () => {
    expect(g('/', account({ onboardingComplete: false }), undefined)).toEqual({ kind: 'wait' });
  });

  it('closes onboarding screens once onboarding is complete', () => {
    expect(g('/onboarding/agreement', account())).toEqual({ kind: 'redirect', to: '/' });
    expect(g('/onboarding/setup/a', account())).toEqual({ kind: 'redirect', to: '/' });
    expect(g('/children/add', account())).toEqual({ kind: 'render' });
    expect(g('/vaccines', account())).toEqual({ kind: 'render' });
  });
});

describe('safeNext', () => {
  it('only allows same-app paths', () => {
    expect(safeNext('/child/abc')).toBe('/child/abc');
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
