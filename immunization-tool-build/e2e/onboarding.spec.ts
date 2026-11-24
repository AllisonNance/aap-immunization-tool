// Milestone 2: auth and onboarding. SPEC.md §11 scenarios 1, 2 and 11.
// (Scenario 1's Home cards and child-page cards are asserted in milestone 4.)
import { expect, test, type Page } from '@playwright/test';
import { fillDate, freshStart, logIn, logOut, currentChild } from './helpers';

test.beforeEach(async ({ page }) => freshStart(page));

async function agree(page: Page) {
  await expect(page).toHaveURL(/\/onboarding\/agreement$/);
  const agreeButton = page.getByRole('button', { name: 'Agree and continue' });
  await expect(agreeButton).toBeDisabled();
  await page.getByLabel('I have read and agree to the terms of use and privacy policy.').filter({ visible: true }).check();
  await agreeButton.click();
}

/** 1b: pick Maya from My Account and add one manual child. */
async function pickTwoChildren(page: Page) {
  await expect(page).toHaveURL(/\/onboarding\/children$/);
  await expect(page.getByText('No children selected').filter({ visible: true })).toBeVisible();
  // None are pre-checked.
  for (const cb of await page.getByRole('checkbox').all()) await expect(cb).not.toBeChecked();
  await page.getByLabel(/Maya/).filter({ visible: true }).check();
  await page.getByRole('button', { name: '+ Add a child' }).click();
  await page.getByRole('textbox', { name: "Child's first name" }).fill('Leo');
  await fillDate(page, 'Month and year of birth', { month: 'October', year: '2021' });
  await expect(page.getByText('2 children selected').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('scenario 1: first run with two children', async ({ page }) => {
  await logIn(page, 'new-family');
  await agree(page);
  await pickTwoChildren(page);

  // Child 1 of 2: pre-filled from My Account. The first name is the title, "Child details" below it.
  await expect(page.getByText('Child 1 of 2').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Maya' })).toBeVisible();
  await expect(page.getByText('Child details').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Child's first name").filter({ visible: true })).toHaveValue('Maya');
  // Month and year of birth only: no day field.
  const dob = page.getByRole('group', { name: 'Month and year of birth' });
  await expect(dob.getByLabel('Month')).not.toHaveValue('');
  await expect(dob.getByLabel('Year')).toHaveValue(/^\d{4}$/);
  await expect(dob.getByLabel(/^Day/)).toHaveCount(0);
  // No "Editing for…" banner and no "Filled in from your AAP My Account" line.
  await expect(page.getByTestId('editing-banner')).toHaveCount(0);
  await expect(page.getByText(/Filled in from your AAP My Account/)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next child' }).click();

  // Child 2 of 2: added by hand. First name and birth month/year carry over from 1b.
  await expect(page.getByText('Child 2 of 2').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Leo' })).toBeVisible();
  await expect(page.getByLabel("Child's first name").filter({ visible: true })).toHaveValue('Leo');
  const leoDob = page.getByRole('group', { name: 'Month and year of birth' });
  await expect(leoDob.getByLabel('Month')).toHaveValue('10');
  await expect(leoDob.getByLabel('Year')).toHaveValue('2021');
  await page.getByRole('button', { name: 'Finish' }).click();

  // Home shows two cards; each child page shows "Add past vaccines" (no "Complete profile" card any more).
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByTestId('child-card')).toHaveCount(2);
  for (const name of ['Maya', 'Leo']) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('link', { name: /Add past vaccines/ }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /profile/ }).filter({ visible: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Home' }).click();
  }
  const kids = await page.evaluate(
    async () =>
      (await (await fetch('/api/children')).json()) as Array<{ name: string; setupComplete: boolean; dateOfBirth: string; dateOfBirthPrecision?: string }>,
  );
  expect(kids.map((k) => [k.name, k.setupComplete])).toEqual([
    ['Maya', true],
    ['Leo', true],
  ]);
  // Leo's birth date is the month only (stored as the 1st).
  expect(kids[1]).toMatchObject({ dateOfBirth: '2021-10-01', dateOfBirthPrecision: 'month' });
  const account = await page.evaluate(async () => (await (await fetch('/api/account')).json()) as { onboardingComplete: boolean });
  expect(account.onboardingComplete).toBe(true);
});

test('scenario 2: resume setup at the first unfinished child', async ({ page }) => {
  await logIn(page, 'new-family');
  await agree(page);
  await pickTwoChildren(page);
  await expect(page.getByText('Child 1 of 2').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next child' }).click();
  await expect(page.getByText('Child 2 of 2').filter({ visible: true })).toBeVisible();

  // Leave after child 1, then log in again.
  await logOut(page);
  await page.goto('/login');
  await logIn(page, 'new-family');

  await expect(page).toHaveURL(/\/onboarding\/setup\//);
  await expect(page.getByText('Child 2 of 2').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Child's first name").filter({ visible: true })).toHaveValue('Leo');
});

test('Back keeps the values entered for a child', async ({ page }) => {
  await logIn(page, 'new-family');
  await agree(page);
  await pickTwoChildren(page);
  await page.getByRole('button', { name: 'Next child' }).click();
  await expect(page.getByText('Child 2 of 2').filter({ visible: true })).toBeVisible();
  await page.getByLabel("Child's first name").filter({ visible: true }).fill('Leo');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Child 1 of 2').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Child's first name").filter({ visible: true })).toHaveValue('Maya');
  await page.getByRole('button', { name: 'Next child' }).click();
  await expect(page.getByText('Child 2 of 2').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Child's first name").filter({ visible: true })).toHaveValue('Leo');
});

test('scenario 11: a reminder deep link while logged out lands on that child after login', async ({ page }) => {
  await logIn(page, 'demo-family');
  const ava = await page.evaluate(async () => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>;
    return kids.find((k) => k.name === 'Ava')!.id;
  });
  await logOut(page);

  await page.goto(`/child/${ava}`);
  await expect(page).toHaveURL(new RegExp(`/start\\?next=%2Fchild%2F${ava}$`));
  await logIn(page, 'demo-family');
  await expect(page).toHaveURL(new RegExp(`/child/${ava}$`));
  await expect(currentChild(page, 'Ava')).toBeVisible();
});

test('declining the agreement logs out and returns to login', async ({ page }) => {
  await logIn(page, 'new-family');
  await expect(page).toHaveURL(/\/onboarding\/agreement$/);
  await page.getByRole('button', { name: 'Decline and log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const status = await page.evaluate(async () => (await fetch('/api/account')).status);
  expect(status).toBe(401);
});

test('Add Children needs at least one child', async ({ page }) => {
  await logIn(page, 'new-family');
  await agree(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  // (Next's route announcer is also role=alert, so match the text.)
  await expect(page.getByText('Choose at least one child to continue.')).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding\/children$/);
});

test('adding a child later marks tracked children "Already added" and returns to the origin', async ({ page }) => {
  await logIn(page, 'one-child');
  await page.goto('/children/add?from=%2Fsettings');
  const maya = page.locator('li', { hasText: 'Maya' });
  await expect(maya.getByText('Already added')).toBeVisible();
  await expect(maya.getByRole('checkbox')).toHaveCount(0);

  await page.getByRole('button', { name: '+ Add a child' }).click();
  await page.getByRole('textbox', { name: "Child's first name" }).fill('Nora');
  await fillDate(page, 'Month and year of birth', { month: 'March', year: '2024' });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Child 1 of 1').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Child's first name").filter({ visible: true })).toHaveValue('Nora');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // Settings lists every child (it has no selector).
  await expect(page.getByRole('region', { name: 'Children' })).toContainText('Nora');
});

test('child details: schedule and outside-US answers and reminders are saved', async ({ page }) => {
  await logIn(page, 'new-family');
  await agree(page);
  await page.getByRole('button', { name: '+ Add a child' }).click();
  await page.getByRole('textbox', { name: "Child's first name" }).fill('Nora');
  await fillDate(page, 'Month and year of birth', { month: 'February', year: '2024' });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Nora' })).toBeVisible();
  // The title follows the first name as it's typed.
  await page.getByLabel("Child's first name").filter({ visible: true }).fill('Nori');
  await expect(page.getByRole('heading', { level: 1, name: 'Nori' })).toBeVisible();

  // Optional questions; reminders start off (opt-in).
  const schedule = page.getByRole('group', { name: 'Is Nori on a delayed or alternate vaccine schedule?' });
  const abroad = page.getByRole('group', { name: 'Has Nori lived outside the US?' });
  const reminders = page.getByRole('checkbox', { name: "Send me reminders when Nori's vaccines are coming up" });
  await expect(reminders).not.toBeChecked();
  await schedule.getByRole('radio', { name: 'Not sure' }).check();
  await abroad.getByRole('radio', { name: 'Yes' }).check();
  await reminders.check();

  // A month in the future is refused, with focus on the date.
  await fillDate(page, 'Month and year of birth', { month: 'January', year: String(new Date().getFullYear() + 1) });
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText("That month hasn't happened yet.").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Month and year of birth' }).getByLabel('Month')).toBeFocused();

  await fillDate(page, 'Month and year of birth', { month: 'February', year: '2024' });
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(/\/$/);

  const saved = await page.evaluate(async () => {
    const [kid] = await (await fetch('/api/children')).json();
    const prefs = await (await fetch('/api/reminders')).json();
    return { kid, remindersOn: prefs.perChild[kid.id] };
  });
  expect(saved.kid).toMatchObject({
    name: 'Nori',
    dateOfBirth: '2024-02-01',
    dateOfBirthPrecision: 'month',
    alternateSchedule: 'notSure',
    livedOutsideUs: 'yes',
    setupComplete: true,
  });
  expect(saved.remindersOn).toBe(true);
});

test('in Spanish, child details use Spanish month names and questions', async ({ page }) => {
  await logIn(page, 'new-family');
  // No toggle before sign-in: the account's language decides (Settings changes it later).
  await page.evaluate(async () => {
    const account = await (await fetch('/api/account')).json();
    await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'es', updatedAt: account.updatedAt }),
    });
  });
  await page.reload();
  await page.getByLabel('He leído y acepto los términos de uso y la política de privacidad.').check();
  await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
  await page.getByRole('button', { name: '+ Agregar un niño' }).click();
  await page.getByRole('textbox', { name: 'Nombre del niño' }).fill('Lucía');
  await fillDate(page, 'Mes y año de nacimiento', { month: 'Marzo', year: '2024' });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lucía' })).toBeVisible();
  await expect(page.getByText('Datos del niño').filter({ visible: true })).toBeVisible();
  const dob = page.getByRole('group', { name: 'Mes y año de nacimiento' });
  await expect(dob.locator('label')).toHaveText(['Mes', 'Año']);
  await expect(dob.getByLabel('Mes')).toHaveValue('3');
  await expect(page.getByRole('group', { name: '¿Lucía ha vivido fuera de los Estados Unidos?' })).toBeVisible();
  await expect(dob.getByLabel('Mes').locator('option', { hasText: 'Octubre' })).toHaveCount(1);
});

test('log in and agreement have no language toggle', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Español' })).toHaveCount(0);
  await logIn(page, 'new-family');
  await expect(page).toHaveURL(/\/onboarding\/agreement$/);
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Español' })).toHaveCount(0);
});

test('the Spanish sample family sees the tool in Spanish', async ({ page }) => {
  await logIn(page, 'spanish-family');
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
});

test('adding children by hand: name and birth month open in a card, and the next "Add a child" turns it into a card', async ({ page }) => {
  await logIn(page, 'new-family');
  await agree(page);

  // First click: a focused name field appears, with month and year of birth.
  await page.getByRole('button', { name: '+ Add a child' }).click();
  const nameField = page.getByRole('textbox', { name: "Child's first name" });
  await expect(nameField).toBeFocused();
  await expect(page.getByRole('group', { name: 'Month and year of birth' }).locator('label')).toHaveText(['Month', 'Year']);

  // An incomplete card doesn't stack another one.
  await page.getByRole('button', { name: '+ Add a child' }).click();
  await expect(page.getByText("Enter the child's first name.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Enter the month and year they were born.').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: "Child's first name" })).toHaveCount(1);
  await expect(nameField).toBeFocused();

  await nameField.fill('Leo');
  await page.getByRole('button', { name: '+ Add a child' }).click();
  await expect(page.getByRole('group', { name: 'Month and year of birth' }).getByLabel('Month')).toBeFocused();

  // A month that hasn't happened yet is refused.
  await fillDate(page, 'Month and year of birth', { month: 'January', year: String(new Date().getFullYear() + 1) });
  await page.getByRole('button', { name: '+ Add a child' }).click();
  await expect(page.getByText("That month hasn't happened yet.").filter({ visible: true })).toBeVisible();

  await fillDate(page, 'Month and year of birth', { month: 'October', year: '2021' });
  await expect(page.getByText('1 child selected').filter({ visible: true })).toBeVisible();

  // Second click: Leo becomes a checked card ("Born October 2021"); a new empty card opens.
  await page.getByRole('button', { name: '+ Add a child' }).click();
  await expect(page.getByRole('checkbox', { name: /Leo/ })).toBeChecked();
  await expect(page.getByText('Born October 2021').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: "Child's first name" })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: "Child's first name" })).toBeFocused();

  // Continue checks a half-filled open card instead of dropping it.
  await page.getByRole('textbox', { name: "Child's first name" }).fill('Nora');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter the month and year they were born.').filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding\/children$/);

  await fillDate(page, 'Month and year of birth', { month: 'March', year: '2024' });
  await expect(page.getByText('2 children selected').filter({ visible: true })).toBeVisible();

  // Unchecking a card leaves that child out; the cycle runs for the rest.
  await page.getByRole('checkbox', { name: /Leo/ }).uncheck();
  await expect(page.getByText('1 child selected').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Child 1 of 1').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Child's first name").filter({ visible: true })).toHaveValue('Nora');
});
