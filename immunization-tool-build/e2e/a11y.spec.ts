// Milestone 9: automated accessibility audit (WCAG 2.2 AA, SPEC.md §9) of
// every screen, in English and Spanish, at 375px. axe-core catches what can be
// checked by machine; keyboard flows are covered in keyboard.spec.ts.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { freshStart, logIn, showSchedule } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type Finding = { screen: string; rule: string; impact?: string | null; help: string; targets: string[] };
let findings: Finding[] = [];

/** Collects violations; each test asserts there are none at the end (so one run lists them all). */
async function audit(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  findings.push(
    ...violations.map((v) => ({
      screen: label,
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
    })),
  );
}

test.beforeEach(() => {
  findings = [];
});
test.afterEach(() => {
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
});

async function ids(page: Page) {
  return page.evaluate(async () => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>;
    return Object.fromEntries(kids.map((k) => [k.name, k.id])) as Record<string, string>;
  });
}

async function setLocale(page: Page, locale: 'en' | 'es') {
  await page.evaluate(async (l) => {
    const a = await (await fetch('/api/account')).json();
    if (a.locale !== l) {
      await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: l, updatedAt: a.updatedAt }) });
    }
  }, locale);
}

test.describe.configure({ mode: 'parallel' });

test('signed-out screens: sample data and log in', async ({ page }) => {
  await freshStart(page);
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'Choose sample data' })).toBeVisible();
  await audit(page, 'start');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await audit(page, 'login');
  // With validation errors showing.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await audit(page, 'login (error)');
});

test('onboarding: agreement, add children, child setup', async ({ page }) => {
  await freshStart(page);
  await logIn(page, 'new-family');
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
  await audit(page, 'agreement');
  await page.getByLabel('I have read and agree to the terms of use and privacy policy.').check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Who are you tracking vaccines for?' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add a child' }).click();
  await audit(page, 'add children');
  await page.getByRole('button', { name: '+ Add a child' }).click(); // shows field errors
  await audit(page, 'add children (errors)');
  await page.getByRole('button', { name: 'Remove this child' }).click();
  await page.getByLabel(/Maya/).filter({ visible: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Child details').filter({ visible: true })).toBeVisible();
  await audit(page, 'child setup');
});

for (const locale of ['en', 'es'] as const) {
  test(`signed-in screens (${locale})`, async ({ page }) => {
    test.setTimeout(240_000); // ~15 screens, each with an axe pass
    await freshStart(page);
    await logIn(page);
    await setLocale(page, locale);
    const kid = await ids(page);
    const maya = kid['Maya'];
    const sofia = kid['Sofía'];

    const screens: Array<[string, string]> = [
      ['home', '/'],
      ['child (Maya)', `/child/${maya}`],
      ['child (Sofía)', `/child/${sofia}`],
      ['add to record', `/child/${maya}/add`],
      ['dose edit', `/child/${maya}/dose/hepb/3`],
      ['custom vaccine', `/child/${maya}/add/custom`],
      ['scan', `/child/${maya}/add/scan`],
      ['edit child', `/child/${maya}/edit`],
      ['record export', `/child/${sofia}/record`],
      ['visit prep', `/visit-prep?child=${sofia}`],
      ['past questions', `/visit-prep/past?child=${maya}`],
      ['vaccines', '/vaccines'],
      ['vaccine detail', '/vaccines/dtap'],
      ['guide', '/vaccines/guides/school-and-childcare'],
      ['settings', '/settings'],
    ];
    for (const [label, path_] of screens) {
      await page.goto(path_);
      await expect(page.locator('main h1').filter({ visible: true }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await audit(page, `${label} (${locale})`);
    }

    // Review Scan, with every flag showing.
    await page.goto(`/child/${sofia}/add/scan`);
    await page.locator('input[type="file"][multiple]').setInputFiles(path.join(__dirname, 'fixtures', 'shot-card.png'));
    await page.locator('button.btn-primary').filter({ visible: true }).click();
    await expect(page.getByTestId('review-item').first()).toBeVisible();
    await audit(page, `review scan (${locale})`);

    // Home popups (Appointment, Question, Record).
    await page.goto('/');
    for (const [name, label] of [
      [/^(Appointment|Cita)$/, 'appointment popup'],
      [/^(Question|Pregunta)$/, 'question popup'],
      [/^(Add Record|Agregar registro)$/, 'record popup'],
    ] as const) {
      await page.getByRole('button', { name }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await audit(page, `${label} (${locale})`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }

    // Open state: the Timeline view.
    await page.goto(`/child/${maya}`);
    await page.locator('main h1').filter({ visible: true }).first().waitFor();
    await showSchedule(page, 'timeline');
    await audit(page, `timeline (${locale})`);
    await page.getByRole('button', { name: /^(List|Lista)$/ }).filter({ visible: true }).click();
    await audit(page, `schedule list (${locale})`);
  });
}
