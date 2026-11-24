// Milestone 9: loading, error, offline and not-found states.
// Failures are injected through the dev mock (`PUT /api/__dev/fail`).
import { expect, test, type Page } from '@playwright/test';
import { freshStart, logIn } from './helpers';

async function failPaths(page: Page, paths: string[]) {
  await page.evaluate(
    (p) => fetch('/api/__dev/fail', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: p }) }),
    paths,
  );
}

async function mayaId(page: Page) {
  return page.evaluate(async () => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>;
    return kids.find((k) => k.name === 'Maya')!.id;
  });
}

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await logIn(page, 'one-child');
});

test.afterEach(async ({ page }) => {
  await failPaths(page, []).catch(() => {});
});

test('a screen whose data fails to load says so, and Try again recovers', async ({ page }) => {
  const id = await mayaId(page);
  await failPaths(page, ['/record']);
  await page.goto(`/child/${id}`);
  const error = visible(page, 'load-error');
  await expect(error).toContainText("We couldn't load this");
  await failPaths(page, []);
  await error.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Maya' })).toBeVisible();
  await expect(visible(page, 'load-error')).toHaveCount(0);
});

test('the account or child list failing shows the error in the shell', async ({ page }) => {
  await failPaths(page, ['/api/children']);
  await page.goto('/');
  await expect(visible(page, 'load-error')).toBeVisible();
  await failPaths(page, []);
  await visible(page, 'load-error').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Child Status' })).toBeVisible();
});

test('Home keeps working and shows a retry when a record fails', async ({ page }) => {
  await failPaths(page, ['/record']);
  await page.goto('/');
  await expect(visible(page, 'load-error')).toBeVisible();
  await expect(page.getByTestId('child-card').filter({ visible: true })).toHaveCount(1);
});

test('Settings: a reminders load failure is shown in place', async ({ page }) => {
  await failPaths(page, ['/reminders']);
  await page.goto('/settings');
  await expect(visible(page, 'load-error')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});

test('offline: a banner says changes cannot be saved', async ({ page, context }) => {
  await page.goto('/');
  await expect(visible(page, 'offline-banner')).toHaveCount(0);
  await context.setOffline(true);
  await expect(visible(page, 'offline-banner')).toBeVisible();
  await context.setOffline(false);
  await expect(visible(page, 'offline-banner')).toHaveCount(0);
});

test('not found: a dose, a custom entry and a used scan each lead back to the child', async ({ page }) => {
  const id = await mayaId(page);
  for (const [path, title] of [
    [`/child/${id}/dose/rotavirus/99`, "We can't find that dose"],
    [`/child/${id}/add/custom/nope`, "We can't find that vaccine entry"],
    [`/child/${id}/add/scan/review?scan=nope`, "This scan isn't available anymore"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the child page' })).toHaveAttribute('href', `/child/${id}`);
  }
});

test('empty: with no children, each tab says so and offers Add a child', async ({ page }) => {
  const id = await mayaId(page);
  await page.evaluate((i) => fetch(`/api/children/${i}`, { method: 'DELETE' }), id);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Add your first child' })).toBeVisible();
  await page.goto('/visit-prep');
  await expect(page.getByText('Add a child to prepare for a visit.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add a child' })).toHaveAttribute('href', '/children/add?from=%2Fvisit-prep');
  await page.goto('/settings');
  await expect(page.getByText('No children added yet.')).toBeVisible();
  await page.goto('/vaccines');
  await expect(page.getByRole('heading', { level: 1 }).filter({ visible: true })).toBeVisible();
});
