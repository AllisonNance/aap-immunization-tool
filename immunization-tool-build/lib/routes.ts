// Route table from SPEC.md §3. Screen numbers match the design team's IA doc.
// The shell reads this to decide: tab bar or not, child selector or editing
// banner, which tab is active, and whether a session is required.

export type ScreenId =
  | '0' | '1a' | '1b' | '1c' | '1' | '2' | '3' | '4a' | '4b' | '4c' | '4d' | '4' | '5' | '5a' | '6' | '6a' | '7' | '8';
export type TabId = 'home' | 'schedule' | 'visitPrep' | 'vaccines' | 'settings';

export interface RouteMeta {
  screen: ScreenId;
  /** Forms hide the tab bar and lock the child behind the editing banner. */
  kind: 'page' | 'form';
  tab: TabId | null;
  /** Child selector at the top (not on 0, 1a, 1b or 1 Home). */
  selector: boolean;
  /** Needs a signed-in session. */
  auth: boolean;
  /** A page with its own action bar at the bottom instead of the tab bar (4a). */
  actionBar?: boolean;
}

const ID = '([^/]+)';
const table: Array<[RegExp, RouteMeta]> = [
  [/^\/login$/, { screen: '0', kind: 'page', tab: null, selector: false, auth: false }],
  [/^\/onboarding\/agreement$/, { screen: '1a', kind: 'page', tab: null, selector: false, auth: true }],
  [/^\/(onboarding\/children|children\/add)$/, { screen: '1b', kind: 'page', tab: null, selector: false, auth: true }],
  [new RegExp(`^/(onboarding/setup|children/add/setup)/${ID}$`), { screen: '1c', kind: 'form', tab: null, selector: false, auth: true }],
  [/^\/$/, { screen: '1', kind: 'page', tab: 'home', selector: false, auth: true }],
  [new RegExp(`^/child/${ID}/edit$`), { screen: '3', kind: 'form', tab: 'schedule', selector: true, auth: true }],
  [new RegExp(`^/child/${ID}/add/scan/review$`), { screen: '4c', kind: 'form', tab: 'schedule', selector: true, auth: true }],
  [new RegExp(`^/child/${ID}/add/scan$`), { screen: '4b', kind: 'form', tab: 'schedule', selector: true, auth: true }],
  [new RegExp(`^/child/${ID}/add/custom(/${ID})?$`), { screen: '4d', kind: 'form', tab: 'schedule', selector: true, auth: true }],
  // 4a is a page, not a form: it only picks what to record, so the switcher stays. Its action bar replaces the tab bar.
  [new RegExp(`^/child/${ID}/add$`), { screen: '4a', kind: 'page', tab: 'schedule', selector: true, auth: true, actionBar: true }],
  // Dose Edit names the child in a chip above the vaccine name instead of the editing banner.
  [new RegExp(`^/child/${ID}/dose/${ID}/${ID}$`), { screen: '4', kind: 'form', tab: 'schedule', selector: false, auth: true }],
  [new RegExp(`^/child/${ID}$`), { screen: '2', kind: 'page', tab: 'schedule', selector: true, auth: true }],
  [/^\/visit-prep$/, { screen: '5', kind: 'page', tab: 'visitPrep', selector: true, auth: true }],
  // Past questions (not in SPEC.md): under Visit Prep, no tab of its own.
  [/^\/visit-prep\/past$/, { screen: '5a', kind: 'page', tab: 'visitPrep', selector: true, auth: true }],
  [/^\/vaccines\/guides\/[^/]+$/, { screen: '7', kind: 'page', tab: 'vaccines', selector: true, auth: true }],
  [/^\/vaccines\/[^/]+$/, { screen: '6a', kind: 'page', tab: 'vaccines', selector: true, auth: true }],
  [/^\/vaccines$/, { screen: '6', kind: 'page', tab: 'vaccines', selector: true, auth: true }],
  // Settings lists every child, so no selector (an open question in SPEC.md §13).
  [/^\/settings$/, { screen: '8', kind: 'page', tab: 'settings', selector: false, auth: true }],
  // Printable record / PDF export of the child page (SPEC.md §6.2 Export).
  [new RegExp(`^/child/${ID}/record$`), { screen: '2', kind: 'page', tab: 'schedule', selector: false, auth: true }],
];

export function routeMeta(pathname: string): RouteMeta | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return table.find(([re]) => re.test(path))?.[1];
}

/** The child a URL is about: /child/[id]/…, 1c setup routes, or ?child= on Visit Prep. */
export function childIdFromLocation(pathname: string, search: URLSearchParams): string | undefined {
  const m = /^\/(?:child|onboarding\/setup|children\/add\/setup)\/([^/]+)/.exec(pathname);
  if (m) return decodeURIComponent(m[1]);
  return search.get('child') ?? undefined;
}

/** Same screen, different child (SPEC.md §3: switching reloads, never navigates away). */
export function hrefForChild(pathname: string, search: URLSearchParams, childId: string): string | null {
  if (/^\/child\/[^/]+$/.test(pathname)) {
    // Stay on the same tab (Overview / Schedule).
    const keep = new URLSearchParams();
    for (const k of ['tab', 'view']) {
      const v = search.get(k);
      if (v) keep.set(k, v);
    }
    const qs = keep.toString();
    return `/child/${encodeURIComponent(childId)}${qs ? `?${qs}` : ''}`;
  }
  if (/^\/child\/[^/]+\/add$/.test(pathname)) {
    // Keep where Add to record was opened from, unless that was the old child's own page.
    const next = new URLSearchParams(search);
    if (next.get('from')?.startsWith('/child/')) next.set('from', `/child/${encodeURIComponent(childId)}`);
    const qs = next.toString();
    return `/child/${encodeURIComponent(childId)}/add${qs ? `?${qs}` : ''}`;
  }
  if (pathname === '/visit-prep' || pathname === '/visit-prep/past') {
    const next = new URLSearchParams(search);
    next.set('child', childId);
    return `${pathname}?${next}`;
  }
  return null; // Vaccines, Settings: the selection lives in context only.
}

export const tabs: Array<{ id: TabId; href: string }> = [
  { id: 'home', href: '/' },
  // The selected child's page (screen 2); TabBar fills in the child.
  { id: 'schedule', href: '/child' },
  { id: 'visitPrep', href: '/visit-prep' },
  { id: 'vaccines', href: '/vaccines' },
  { id: 'settings', href: '/settings' },
];
