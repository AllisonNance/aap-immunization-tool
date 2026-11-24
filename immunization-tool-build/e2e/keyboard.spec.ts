// Milestone 9: keyboard use and 44px touch targets (CLAUDE.md, SPEC.md §9).
import { expect, test, type Page } from '@playwright/test';
import { freshStart, logIn, switcher, currentChild } from './helpers';

async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary')) {
      if (!el.checkVisibility() || el.classList.contains('skip-link')) continue;
      // A checkbox or radio inside its label: the label is the target.
      if (el.tagName === 'INPUT' && el.closest('label')) continue;
      // Home's child-name link is stretched over the whole card.
      if (el.closest('[data-testid="child-card"]') && el.matches('h2 a')) continue;
      // Links inside running text are exempt (WCAG 2.5.8 inline exception).
      const parent = el.parentElement;
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && parent && (parent.textContent ?? '').trim() !== (el.textContent ?? '').trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) out.push(`${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return [...new Set(out)];
  });
}

test('every control on the main screens is at least 44px', async ({ page }) => {
  await freshStart(page);
  await logIn(page, 'demo-family');
  const ids = await page.evaluate(async () => ((await (await fetch('/api/children')).json()) as Array<{ id: string }>).map((c) => c.id));
  const id = ids[0];
  for (const path of [
    '/',
    `/child/${id}`,
    `/child/${id}/add`,
    `/child/${id}/add/scan`,
    `/child/${id}/add/custom`,
    `/child/${id}/dose/rotavirus/1`,
    `/child/${id}/edit`,
    `/child/${id}/record`,
    '/visit-prep',
    `/visit-prep/past?child=${id}`,
    '/vaccines',
    '/vaccines/rotavirus',
    '/vaccines/guides',
    '/settings',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).filter({ visible: true }).first()).toBeVisible();
    expect(await smallTargets(page), path).toEqual([]);
  }
});

test('keyboard: skip link and the child switcher', async ({ page }) => {
  await freshStart(page);
  await logIn(page, 'demo-family');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Child Status' })).toBeVisible();

  // First Tab lands on the skip link; it moves focus past the header.
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);

  // The child switcher: Tab moves through the pills, Enter picks one.
  await page.goto('/vaccines');
  await expect(currentChild(page, 'Maya')).toBeVisible();
  await currentChild(page, 'Maya').focus();
  await page.keyboard.press('Tab');
  await expect(switcher(page).getByRole('button', { name: 'Leo', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(currentChild(page, 'Leo')).toBeVisible();
});

test('keyboard: a form can be completed without a mouse (log in)', async ({ page }) => {
  await freshStart(page);
  await page.goto('/login');
  const email = page.getByRole('textbox', { name: 'Email' });
  await email.focus();
  await page.keyboard.press('Enter');
  // Submitting empty moves focus back to the field with the error.
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.type('parent@example.com');
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/\/login/);
});
