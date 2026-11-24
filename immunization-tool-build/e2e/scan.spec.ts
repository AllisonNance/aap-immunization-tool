// Milestone 6: Scan a Record (4b) and Review Scan (4c). SPEC.md §11 scenario 8.
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { freshStart, logIn } from './helpers';

test.beforeEach(async ({ page }) => freshStart(page));

const card = path.join(__dirname, 'fixtures', 'shot-card.png');
const item = (page: Page, printed: string) => page.getByTestId('review-item').filter({ hasText: `As printed: ${printed}` });

async function scanFor(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click();
  await page.getByRole('link', { name: 'Add Record' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Create a Record for ${name}` })).toBeVisible();
  await page.getByRole('link', { name: 'Scan a record', exact: true }).click();
  await expect(page).toHaveURL(/\/add\/scan$/);
}

test('scenario 8: scan → review shows the flags → resolve → make custom → save', async ({ page }) => {
  await logIn(page);
  await scanFor(page, 'Sofía');

  // 4b: tips, what works, privacy; upload the fixture.
  await expect(page.getByText('Lay the record flat.')).toBeVisible();
  await expect(page.getByText('Records from other countries')).toBeVisible();
  await expect(page.getByTestId('editing-banner')).toHaveText(/Editing for Sofía/);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.locator('input[type="file"][multiple]').setInputFiles(card);
  await expect(page.getByRole('img', { name: 'Photo of page 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 4c: one of each flag, in plain language.
  await expect(page).toHaveURL(/\/add\/scan\/review\?scan=/);
  await expect(page.getByText('Nothing is saved until you choose Save.', { exact: false })).toBeVisible();
  await expect(item(page, 'DPT')).toContainText('Which is it?');
  await expect(item(page, 'BCG')).toContainText("We couldn't match “BCG”");
  await expect(item(page, 'Hep B')).toContainText('before Sofía was born');
  await expect(item(page, 'Hib')).toContainText('sooner after the previous');
  await expect(item(page, 'Polio')).toContainText("already in Sofía's record, so we'll skip it");
  // Duplicates start removed; confidence shows as text.
  await expect(item(page, 'Polio').getByRole('radio', { name: 'Remove' })).toBeChecked();
  await expect(item(page, 'Hep B')).toContainText('Hard to read');

  // Save is blocked until the ambiguous date is resolved.
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  await expect(page.getByText(/items? needs? your attention/)).toBeVisible();

  const dpt = item(page, 'DPT');
  await dpt.getByRole('group', { name: 'Which date is it?' }).getByRole('radio').first().check();
  await expect(dpt).not.toContainText('Which is it?');
  await item(page, 'Hep B').getByRole('radio', { name: 'Remove' }).check();
  await expect(save).toBeDisabled(); // BCG still unmatched
  await item(page, 'BCG').getByRole('radio', { name: 'Make custom' }).check();
  await expect(save).toBeEnabled();
  await expect(page.getByText('3 doses and 1 custom vaccine will be added.')).toBeVisible();
  await save.click();

  // Child page: the summary, the custom vaccine under Other vaccines, and its question.
  // A temporary toast at the bottom, like the question and appointment ones.
  await expect(page.getByTestId('toast').filter({ visible: true })).toContainText('3 doses added, 1 custom vaccine');
  await expect(page.getByRole('region', { name: 'Other vaccines' }).getByText('BCG')).toHaveCount(2);
  const questions = await page.evaluate(async () => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>;
    const sofia = kids.find((k) => k.name === 'Sofía')!;
    return ((await (await fetch(`/api/children/${sofia.id}/questions`)).json()) as Array<{ text: string; origin: string }>).map((q) => q.text);
  });
  expect(questions).toContain('Confirm how BCG fits the schedule.');

  await page.getByTestId('toast').filter({ visible: true }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('toast').filter({ visible: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/scanAdded/);
});

test('Review: pages open in a zoomable viewer; editing a date rechecks it', async ({ page }) => {
  await logIn(page);
  await scanFor(page, 'Sofía');
  await page.locator('input[type="file"][multiple]').setInputFiles(card);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'View page 1 larger' }).click();
  const viewer = page.getByRole('dialog', { name: 'Scanned page' });
  await expect(viewer.getByRole('img', { name: 'Scanned page 1' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toBeHidden();

  // Hep B: before birth. Edit the date to after birth → the flag goes away.
  const hepb = item(page, 'Hep B');
  await hepb.getByRole('button', { name: 'Edit' }).click();
  const dob = await page.evaluate(async () => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ name: string; dateOfBirth: string }>;
    return kids.find((k) => k.name === 'Sofía')!.dateOfBirth;
  });
  const [y] = dob.split('-');
  const group = hepb.getByRole('group', { name: 'Date given' });
  await group.getByLabel('Month').selectOption({ label: 'December' });
  await group.getByLabel('Day').fill('20');
  await group.getByLabel('Year').fill(String(Number(y) + 1));
  await expect(hepb).not.toContainText('before Sofía was born');
  await expect(hepb).not.toContainText('Which is it?');
});

test('Scan: add and remove pages; discard a scan', async ({ page }) => {
  await logIn(page);
  await scanFor(page, 'Leo');
  const files = page.locator('input[type="file"][multiple]');
  await files.setInputFiles(card);
  await files.setInputFiles(card);
  await expect(page.getByRole('heading', { name: '2 pages' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove page 1' }).click();
  await expect(page.getByRole('heading', { name: '1 page' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/add\/scan\/review/);
  await page.getByRole('button', { name: 'Discard scan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Leo' })).toBeVisible();
  // Nothing was added.
  await expect(page.getByRole('region', { name: 'Other vaccines' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Dose 1 Given/ })).toHaveCount(0);
});
