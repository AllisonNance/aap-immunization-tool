// Home quick actions: Record +, Appointment +, Question + (popups).
import { expect, test, type Page } from '@playwright/test';
import { fillDate, freshStart, logIn, currentChild, openVisitPrep, vpQuestions } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await logIn(page);
});

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

async function ids(page: Page) {
  return page.evaluate(async () =>
    Object.fromEntries(((await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>).map((c) => [c.name, c.id])),
  ) as Promise<Record<string, string>>;
}

function nextYear() {
  return String(new Date().getFullYear() + 1);
}

test('the three buttons sit between the notices and Child Status: on mobile Add Record has its own line', async ({ page }) => {
  const row = page.getByRole('group', { name: "Add to a child's record" });
  await expect(row.getByRole('button')).toHaveText(['Add Record', 'Appointment', 'Question']);
  const tops = await row.getByRole('button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  // 375px: Add Record alone, then Appointment and Question together.
  expect(tops[1]).toBeGreaterThan(tops[0]);
  expect(tops[1]).toBe(tops[2]);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main [data-testid^="notice-"], main [role="group"][aria-label], main h1')]
      .filter((el) => el.checkVisibility())
      .map((el) => (el.tagName === 'H1' ? 'h1' : (el.dataset.testid ?? 'actions'))),
  );
  expect(order.slice(0, 4)).toEqual(['notice-schedule', 'notice-flu', 'actions', 'h1']);

  // Desktop: all three in one row.
  await page.setViewportSize({ width: 1024, height: 800 });
  const wide = await row.getByRole('button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(wide).size).toBe(1);
});

test('Add Record: choose the child, then the record page opens for that child; the popup can be closed', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Record', exact: true }).click();
  const d = dialog(page, 'Add to a record');
  await expect(d).toBeVisible();
  await expect(d.getByText('Which child is this record for?')).toBeVisible();
  await d.getByRole('button', { name: 'Close' }).click();
  await expect(d).toHaveCount(0);

  await page.getByRole('button', { name: 'Add Record', exact: true }).click();
  await dialog(page, 'Add to a record').getByRole('button', { name: 'Ava', exact: true }).click();
  const kids = await ids(page);
  await expect(page).toHaveURL(new RegExp(`/child/${kids['Ava']}/add\\?from=%2F$`));
  await expect(currentChild(page, 'Ava')).toBeVisible();
});

test('Appointment: child + date saved in the popup, saved as that child’s next appointment', async ({ page }) => {
  await page.getByRole('button', { name: 'Appointment' }).click();
  const d = dialog(page, 'Next appointment');
  await expect(d.getByRole('button', { name: 'Cancel' })).toBeVisible();
  // Both fields are required.
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.getByText('Choose a child.')).toBeVisible();
  await expect(d.getByText('Enter the month, day and year.')).toBeVisible();

  await d.getByRole('radio', { name: 'Leo' }).check();
  await fillDate(page, 'Appointment date', { month: 'March', day: '9', year: nextYear() });
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/); // no redirect
  await expect(page.getByRole('status').filter({ hasText: 'Next appointment for Leo' })).toContainText(`Mar 9, ${nextYear()}`);

  // Saved as Leo's next appointment (shown in his Visit Prep).
  await openVisitPrep(page, 'Leo');
  await expect(page.getByRole('region', { name: 'Next appointment' }).filter({ visible: true })).toContainText(`Mar 9, ${nextYear()}`);
});

test('Appointment: Cancel and Escape close without saving', async ({ page }) => {
  await page.getByRole('button', { name: 'Appointment' }).click();
  const d = dialog(page, 'Next appointment');
  await d.getByRole('radio', { name: 'Maya' }).check();
  await d.getByRole('button', { name: 'Cancel' }).click();
  await expect(d).toHaveCount(0);
  await page.getByRole('button', { name: 'Appointment' }).click();
  await expect(d).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  // Focus goes back to the button that opened it.
  await expect(page.getByRole('button', { name: 'Appointment' })).toBeFocused();
});

test('Question: child, optional vaccine and question, saved in the popup, listed on Home and in Visit Prep', async ({ page }) => {
  await page.getByRole('button', { name: 'Question' }).click();
  const d = dialog(page, 'Add a question');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.getByText('Choose a child.')).toBeVisible();
  await expect(d.getByText('Enter your question.')).toBeVisible();

  await d.getByRole('radio', { name: 'Ava' }).check();
  await d.getByLabel('Vaccine (optional)').selectOption({ label: 'Polio (IPV)' });
  await d.getByLabel('Your question').fill('Can polio and MMR be given the same day?');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Question added for Ava.' })).toBeVisible();
  // Listed on Home under Open Questions, and in Ava's Visit Prep.
  await expect(page.getByRole('region', { name: 'Open Questions' }).getByRole('region', { name: 'Ava' })).toContainText('Can polio and MMR be given the same day?');
  await openVisitPrep(page, 'Ava');
  await expect(vpQuestions(page)).toContainText('Can polio and MMR be given the same day?');
});

test('a save shows a temporary toast above the bottom nav that can be closed', async ({ page }) => {
  await page.getByRole('button', { name: 'Question' }).click();
  const d = dialog(page, 'Add a question');
  await d.getByRole('radio', { name: 'Maya' }).check();
  await d.getByLabel('Your question').fill('Is a fever after shots normal?');
  await d.getByRole('button', { name: 'Save' }).click();
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('Question added for Maya.');
  await expect(toast.getByRole('link', { name: "See Maya's schedule" })).toBeVisible();
  // Sits just above the tab bar.
  const [t, nav] = await Promise.all([toast.boundingBox(), page.getByRole('navigation', { name: 'Main' }).boundingBox()]);
  expect(t!.y + t!.height).toBeLessThanOrEqual(nav!.y);
  expect(nav!.y - (t!.y + t!.height)).toBeLessThan(24);
  await toast.getByRole('button', { name: 'Close' }).click();
  await expect(toast).toHaveCount(0);
});

test('the toast goes away on its own', async ({ page }) => {
  await page.clock.install();
  await page.getByRole('button', { name: 'Question' }).click();
  const d = dialog(page, 'Add a question');
  await d.getByRole('radio', { name: 'Leo' }).check();
  await d.getByLabel('Your question').fill('When is his next booster?');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.clock.runFor(7000);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});
