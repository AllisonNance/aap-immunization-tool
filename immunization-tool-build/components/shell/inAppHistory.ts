'use client';
// Whether "Back" can go to an earlier page of this app (router.back()), or
// should fall back to a fixed link because the page was opened directly.
// Tracks pathnames only: tab / view / child changes on the same page use
// router.replace and don't add a page to go back to.
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const stack: string[] = [];

/** Call once, in AppShell. */
export function useTrackInAppHistory() {
  const pathname = usePathname();
  useEffect(() => {
    if (stack.at(-1) === pathname) return;
    if (stack.at(-2) === pathname) stack.pop(); // went back
    else stack.push(pathname);
  }, [pathname]);
}

/** True when there's an earlier page of this app in the history. */
export function canGoBackInApp() {
  return stack.length > 1;
}

/**
 * For Cancel-style links to `href`: true when `href` is the page just before
 * this one, so router.back() should be used instead of pushing it again (which
 * would leave this page in the history for that page's own Back to return to).
 */
export function isPreviousInAppPage(href: string) {
  return stack.length > 1 && stack.at(-2) === href.split(/[?#]/)[0];
}
