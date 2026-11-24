// Milestone 1 (Foundation): the app shell against the MSW mock.
// Scenario tests from SPEC.md §11 are added as each milestone lands.
import { expect, test } from '@playwright/test';
import { freshStart, logIn, switcher, pickChild, currentChild } from './helpers';

test.beforeEach(async ({ page }) => freshStart(page));

test('logged out, a deep link goes to login and back (scenario 11 shape)', async ({ page }) => {
  await page.goto('/vaccines');
  // Dev entry: Choose sample data, keeping next.
  await expect(page).toHaveURL(/\/start\?next=%2Fvaccines$/);
  await logIn(page);
  await expect(page).toHaveURL(/\/vaccines$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vaccines', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('child selector switches child without leaving the screen', async ({ page }) => {
  await logIn(page);
  await page.getByRole('link', { name: 'Vaccines', exact: true }).click();
  await expect(currentChild(page, 'Maya')).toBeVisible();
  await pickChild(page, 'Ava');
  await expect(page).toHaveURL(/\/vaccines$/);
  await expect(currentChild(page, 'Ava')).toBeVisible();
});

test('with one child, the selector shows that child and offers no switch', async ({ page }) => {
  await logIn(page, 'one-child');
  // (On the Vaccines tab "No child" is also a choice, so check another tab.)
  await page.getByRole('link', { name: 'Visit Prep', exact: true }).click();
  await expect(page.getByText('Maya', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(switcher(page)).toHaveCount(0);
});

test('Dose Edit names the child in a chip, locks the child and hides the tab bar', async ({ page }) => {
  await logIn(page);
  const childId = await page.evaluate(async () => (await (await fetch('/api/children')).json())[0].id);
  await page.goto(`/child/${childId}/dose/hepb/3`);
  await expect(page.getByTestId('child-chip').filter({ visible: true })).toHaveText('Maya');
  await expect(page.getByTestId('editing-banner')).toHaveCount(0);
  await expect(switcher(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});

test('a child not on the account shows not-found with a way Home', async ({ page }) => {
  await logIn(page);
  await page.goto('/child/not-a-real-child');
  await expect(page.getByRole('heading', { name: "We can't find that child on your account" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
});

test('switching to Spanish in Settings changes the shell', async ({ page }) => {
  await logIn(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
  await page.getByRole('radio', { name: 'Español' }).click();
  await expect(page.getByRole('radio', { name: 'Español' })).toBeChecked();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('sample data page: Enter tool leads to a plain Log in screen', async ({ page }) => {
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'Choose sample data' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Register here.' })).toHaveCount(0);

  await page.getByRole('radio', { name: /One child/ }).check();
  await page.getByRole('button', { name: 'Enter tool' }).click();

  await expect(page).toHaveURL(/\/login$/);
  // Just a login: no reference to the chosen sample data.
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  // (The sample-data page stays mounted but hidden, so only count what's visible.)
  await expect(page.getByText(/Sample data:|One child/).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Email' })).not.toHaveAttribute('placeholder');
  await page.getByRole('textbox', { name: 'Email' }).fill('parent@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  // The login screen's muted page background doesn't follow you into the tool.
  await expect(page.locator('body')).not.toHaveAttribute('data-backdrop');
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Vaccines', exact: true }).click();
  await expect(page.getByText('Maya', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('log in: email is required and must look like an address; Register here starts a new account', async ({ page }) => {
  await page.goto('/login');
  const email = page.getByRole('textbox', { name: 'Email' });
  await expect(page.getByText('*Required')).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await expect(email).toBeFocused();
  await expect(page).toHaveURL(/\/login$/);

  await email.fill('parent');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter an email address like name@example.com.')).toBeVisible();

  await page.getByRole('button', { name: 'Register here.' }).click();
  await expect(page).toHaveURL(/\/onboarding\/agreement$/);
});

test('the switcher expands the selected child with their name; the others show an initial', async ({ page }) => {
  await logIn(page);
  await page.getByRole('link', { name: 'Vaccines', exact: true }).click();
  await expect(currentChild(page, 'Maya')).toHaveText('Maya');
  await expect(switcher(page).getByRole('button', { name: 'Leo', exact: true })).toHaveText('LLeo'); // "L" shown, the name for screen readers
  await expect(switcher(page).getByRole('button', { pressed: true })).toHaveCount(1);
  for (const name of ['Leo', 'Ava', 'Sofía', 'Maya']) {
    await pickChild(page, name);
    await expect(currentChild(page, name)).toHaveText(name);
  }
});

test('header has the HealthyChildren.org logo; every page ends with the logo section', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('banner').getByRole('img', { name: 'HealthyChildren.org' })).toBeVisible();
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('img', { name: 'HealthyChildren.org' })).toBeVisible();
  await expect(footer.getByRole('img', { name: /^American Academy of Pediatrics/ })).toBeVisible();
  await logIn(page);
  await expect(page.getByRole('contentinfo').getByRole('img', { name: /^American Academy of Pediatrics/ })).toBeVisible();
});

test('Schedule tab opens the selected child\'s page, the same page Home\'s cards open', async ({ page }) => {
  await logIn(page);
  const tab = page.getByRole('link', { name: 'Schedule', exact: true });
  await tab.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Maya' })).toBeVisible();
  await expect(tab).toHaveAttribute('aria-current', 'page');
  // Switching child stays on the schedule.
  await pickChild(page, 'Leo');
  await expect(page.getByRole('heading', { level: 1, name: 'Leo' })).toBeVisible();
  await expect(tab).toHaveAttribute('aria-current', 'page');
  // From Home, a card opens the same page.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Ava', exact: true }).click();
  await expect(page).toHaveURL(/\/child\/[^/]+$/);
  await expect(tab).toHaveAttribute('aria-current', 'page');
  await expect(tab).toHaveAttribute('href', page.url().replace(/^https?:\/\/[^/]+/, ''));
});
