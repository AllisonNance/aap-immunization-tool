import { expect, type Page } from '@playwright/test';

/** Fresh mock data: the dev mock persists to localStorage per browser context. */
export async function freshStart(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await mockReady(page);
}

/**
 * Wait for the in-browser mock API (started in instrumentation-client.ts).
 * The app waits for it, but a test's own fetch can run first and miss it.
 */
export async function mockReady(page: Page) {
  await page.waitForFunction(() => '__apiMockReady' in window);
  await page.evaluate(() => (window as unknown as { __apiMockReady?: Promise<unknown> }).__apiMockReady);
}

/**
 * Sign in as a sample account. On the dev "Choose sample data" page (/start) it
 * picks the account and presses Enter tool; elsewhere it sets the sample account
 * through the dev API. Then it enters an email on screen 0 and presses Continue.
 * Works in either language.
 */
export async function logIn(page: Page, account = 'demo-family') {
  if (new URL(page.url()).pathname === '/start') {
    await page.locator(`input[type="radio"][value="${account}"]`).check();
    await page.getByRole('button', { name: /^(Enter tool|Entrar a la herramienta)$/ }).click();
    await expect(page).toHaveURL(/\/login/);
  } else {
    await mockReady(page);
    await page.evaluate(
      (accountKey) =>
        fetch('/api/__dev/sample-account', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountKey }),
        }),
      account,
    );
  }
  await page.getByRole('textbox', { name: /^(Email|Correo electrónico)$/ }).fill('parent@example.com');
  await page.getByRole('button', { name: /^(Continue|Continuar)$/ }).click();
  await expect(page).not.toHaveURL(/\/(login|start)/);
}

export async function logOut(page: Page) {
  await mockReady(page);
  await page.evaluate(() => fetch('/api/session', { method: 'DELETE' }));
}

/** Fill a month-name date picker (DateFields) by its legend. Role queries skip hidden copies. */
export async function fillDate(page: Page, legend: string, date: { month: string; day?: string; year: string }) {
  const group = page.getByRole('group', { name: legend });
  await group.getByLabel(/^(Month|Mes)$/).selectOption({ label: date.month });
  if (date.day !== undefined) await group.getByLabel(/^(Day|Día)/).fill(date.day);
  await group.getByLabel(/^(Year|Año)$/).fill(date.year);
}

/** The child switcher in the header (pills). Absent with one child, on Home, Settings and forms. */
export const switcher = (page: Page) => page.getByRole('list', { name: /^(Child|Niño)$/ }).filter({ visible: true });

/** Pick a child (or "No child") in the switcher. */
export async function pickChild(page: Page, name: string) {
  await switcher(page).getByRole('button', { name, exact: true }).click();
}

/** The switcher's selected pill for `name`. */
export const currentChild = (page: Page, name: string) => switcher(page).getByRole('button', { name, exact: true, pressed: true });

/** Open a child's Visit Prep (questions, pediatrician and appointment live there, not on the child page). */
export async function openVisitPrep(page: Page, name: string) {
  await mockReady(page);
  const id = await page.evaluate(async (n) => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>;
    return kids.find((k) => k.name === n)!.id;
  }, name);
  await page.goto(`/visit-prep?child=${id}`);
  await expect(page.getByRole('heading', { level: 1 }).filter({ visible: true }).first()).toBeVisible();
}
export const vpQuestions = (page: Page) => page.getByRole('region', { name: 'Questions and notes' }).filter({ visible: true });

/**
 * On a child's page, open the Schedule tab. Timeline is the default view;
 * most checks use List (full vaccine names), so that's this helper's default.
 */
export async function showSchedule(page: Page, view: 'list' | 'timeline' = 'list') {
  await page.getByRole('tab', { name: /^(Schedule|Calendario)$/ }).filter({ visible: true }).click();
  await expect(page.getByRole('tab', { name: /^(Schedule|Calendario)$/ }).filter({ visible: true })).toHaveAttribute('aria-selected', 'true');
  const name = view === 'list' ? /^(List|Lista)$/ : /^(Timeline|Línea de tiempo)$/;
  await page.getByRole('button', { name }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name }).filter({ visible: true })).toHaveAttribute('aria-pressed', 'true');
}

/** On a child's page, open the Overview tab (summary, Due now, Coming next…). */
export async function showOverview(page: Page) {
  await page.getByRole('tab', { name: /^(Overview|Resumen)$/ }).filter({ visible: true }).click();
  await expect(page.getByRole('tab', { name: /^(Overview|Resumen)$/ }).filter({ visible: true })).toHaveAttribute('aria-selected', 'true');
}
