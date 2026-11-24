import { describe, expect, it } from 'vitest';
import { childIdFromLocation, hrefForChild, routeMeta } from '@/lib/routes';

describe('route table (SPEC.md §3)', () => {
  it.each([
    ['/login', '0', 'page', false],
    ['/onboarding/agreement', '1a', 'page', false],
    ['/children/add', '1b', 'page', false],
    ['/onboarding/setup/abc', '1c', 'form', false],
    ['/', '1', 'page', false],
    ['/child/abc', '2', 'page', true],
    ['/child/abc/edit', '3', 'form', true],
    ['/child/abc/add', '4a', 'page', true],
    ['/child/abc/add/scan', '4b', 'form', true],
    ['/child/abc/add/scan/review', '4c', 'form', true],
    ['/child/abc/add/custom', '4d', 'form', true],
    ['/child/abc/add/custom/e1', '4d', 'form', true],
    ['/child/abc/dose/dtap/4', '4', 'form', false],
    ['/visit-prep', '5', 'page', true],
    ['/visit-prep/past', '5a', 'page', true],
    ['/vaccines', '6', 'page', true],
    ['/vaccines/mmr', '6a', 'page', true],
    ['/vaccines/guides/catch-up', '7', 'page', true],
    ['/settings', '8', 'page', false],
    ['/child/abc/record', '2', 'page', false],
  ] as const)('%s → screen %s', (path, screen, kind, selector) => {
    expect(routeMeta(path)).toMatchObject({ screen, kind, selector });
  });

  it('hides the tab bar on forms (they have no tab-bar kind)', () => {
    expect(['/child/a/edit', '/child/a/dose/x/1'].map((p) => routeMeta(p)!.kind)).toEqual(['form', 'form']);
  });

  it('finds the child in the URL', () => {
    expect(childIdFromLocation('/child/abc/edit', new URLSearchParams())).toBe('abc');
    expect(childIdFromLocation('/visit-prep', new URLSearchParams('child=xyz'))).toBe('xyz');
    expect(childIdFromLocation('/vaccines', new URLSearchParams())).toBeUndefined();
  });

  it('switching children stays on the same screen', () => {
    expect(hrefForChild('/child/abc', new URLSearchParams(), 'def')).toBe('/child/def');
    expect(hrefForChild('/child/abc', new URLSearchParams('tab=schedule&scanAdded=2'), 'def')).toBe('/child/def?tab=schedule');
    expect(hrefForChild('/child/abc', new URLSearchParams('tab=schedule&view=list'), 'def')).toBe('/child/def?tab=schedule&view=list');
    expect(hrefForChild('/child/abc/add', new URLSearchParams(), 'def')).toBe('/child/def/add');
    expect(hrefForChild('/child/abc/add', new URLSearchParams('from=%2F'), 'def')).toBe('/child/def/add?from=%2F');
    expect(hrefForChild('/child/abc/add', new URLSearchParams('from=%2Fchild%2Fabc'), 'def')).toBe('/child/def/add?from=%2Fchild%2Fdef');
    expect(hrefForChild('/visit-prep', new URLSearchParams('child=abc'), 'def')).toBe('/visit-prep?child=def');
    expect(hrefForChild('/visit-prep/past', new URLSearchParams('child=abc'), 'def')).toBe('/visit-prep/past?child=def');
    expect(hrefForChild('/vaccines', new URLSearchParams(), 'def')).toBeNull();
  });
});
