// Milestone 8: Settings & Reminders (8), Edit Child (3), the reminder mock and
// export. SPEC.md §11 scenario 12 (language).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fillDate, freshStart, logIn, switcher, openVisitPrep } from './helpers';

test.beforeEach(async ({ page }) => freshStart(page));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function kid(page: Page, name: string) {
  return page.evaluate(async (n) => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string; dateOfBirth: string }>;
    return kids.find((k) => k.name === n)!;
  }, name);
}

// Interface words that must not appear once the app is in Spanish.
const ENGLISH = [
  'Child Status',
  'Open Questions',
  'Due now',
  'Due soon',
  'Overdue',
  'Needs info',
  'On track',
  'Coming next',
  'Not entered',
  'Add to record',
  'Add Record',
  'Visit Prep',
  'Settings',
  'Schedule',
  'Next appointment',
  'Log out',
  'Reminders',
  'Protects against',
  'Catching up',
  'Dose ',
  'Given ',
  'Save',
  'Cancel',
];

async function expectAllSpanish(page: Page, mustShow: string) {
  await expect(page.getByText(mustShow).filter({ visible: true }).first()).toBeVisible();
  const visible = await page.locator('body').innerText();
  expect(visible, 'no missing translations').not.toContain('⟦missing');
  // Whole words only ("Cancel" must not match "Cancelar").
  for (const word of ENGLISH) {
    const re = new RegExp(`(^|[^\\p{L}])${word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
    expect(visible, `"${word}" on ${page.url()}`).not.toMatch(re);
  }
}

test('scenario 12: switch to Spanish in Settings → every screen, vaccine page and guide is in Spanish → switch back', async ({ page }) => {
  await logIn(page, 'one-child');
  const maya = await kid(page, 'Maya');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes y recordatorios' })).toBeVisible();
  await expectAllSpanish(page, 'Recordatorios');

  const visits: Array<[string, string]> = [
    ['/', 'Estado de los niños'],
    [`/child/${maya.id}`, 'Le tocan ahora'],
    [`/child/${maya.id}/add`, 'Buscar vacunas'],
    [`/child/${maya.id}/dose/hepb/3`, '¿Qué pasó con esta dosis?'],
    [`/child/${maya.id}/add/custom`, 'Nombre como aparece escrito'],
    [`/child/${maya.id}/add/scan`, 'Escanear un registro'],
    [`/child/${maya.id}/edit`, 'Editar el perfil de Maya'],
    [`/child/${maya.id}/record`, 'Registro personal, no es un registro oficial de vacunas.'],
    [`/visit-prep?child=${maya.id}`, 'Próxima cita'],
    ['/vaccines', 'Todas las vacunas, de la A a la Z'],
    ['/vaccines/hepb', 'Protege contra:'],
    ['/vaccines/guides/catch-up', 'Ponerse al día con las dosis que faltan'],
  ];
  for (const [path, text] of visits) {
    await page.goto(path);
    await expectAllSpanish(page, text);
  }

  // And back to English the same way.
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings & Reminders' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Child Status' })).toBeVisible();
});

test('the Spanish sample family sees Spanish sample text too', async ({ page }) => {
  await logIn(page, 'spanish-family');
  await openVisitPrep(page, 'Maya');
  await expect(page.getByRole('region', { name: 'Preguntas y notas' }).filter({ visible: true })).toContainText(
    '¿Le pueden poner también la vacuna contra la influenza en la visita de los 6 meses?',
  );
});

test('Settings: no child selector; children can be edited, removed and added', async ({ page }) => {
  await logIn(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(switcher(page)).toHaveCount(0);
  const kids = page.getByRole('region', { name: 'Children' });
  await expect(kids.getByRole('listitem')).toHaveCount(4);
  await expect(kids.getByRole('link', { name: 'Edit Ava' })).toHaveAttribute('href', /\/child\/[^/]+\/edit$/);
  await expect(page.getByRole('link', { name: '+ Add a child' })).toHaveAttribute('href', '/children/add?from=%2Fsettings');
  await expect(page.getByRole('link', { name: 'Manage your AAP My Account' })).toBeVisible();

  await kids.getByRole('button', { name: 'Remove Leo' }).click();
  await expect(page.getByText("Remove Leo and all of their records? This can't be undone.")).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(kids.getByRole('listitem')).toHaveCount(3);
  await expect(kids).not.toContainText('Leo');
});

test('Edit Child: lists doses a new birth date would make wrong before saving; checks the phone', async ({ page }) => {
  await logIn(page);
  const maya = await kid(page, 'Maya');
  await page.goto(`/child/${maya.id}/edit`);
  await expect(page.getByTestId('editing-banner')).toHaveText(/Editing for Maya/);

  // Born a month later: the birth dose of HepB is now before birth.
  const [y, m] = maya.dateOfBirth.split('-').map(Number);
  const later = new Date(Date.UTC(y, m, 1)); // next month
  await fillDate(page, 'Month and year of birth', { month: MONTHS[later.getUTCMonth()], year: String(later.getUTCFullYear()) });
  const warning = page.getByRole('alert').filter({ hasText: "doesn't fit" }).or(page.getByRole('alert').filter({ hasText: "don't fit" }));
  await expect(warning).toContainText('Hepatitis B · Dose 1');
  await expect(warning).toContainText('before birth');

  // Pediatrician phone is checked.
  await page.getByRole('textbox', { name: 'Phone' }).fill('555-01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Enter a 10-digit phone number.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Phone' }).fill('312 555 0100');

  // First Save confirms the warning; then it's "Save anyway".
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Maya' })).toBeVisible();
  await openVisitPrep(page, 'Maya');
  await expect(page.getByRole('region', { name: 'Pediatrician', exact: true }).filter({ visible: true })).toContainText('(312) 555-0100');
});

test('Reminders: contact checks, lead time, per child, preview; the dev log shows what would be sent', async ({ page }) => {
  await logIn(page);
  const maya = await kid(page, 'Maya');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const rem = page.getByRole('region', { name: 'Reminders' });

  // demo-family: SMS on with a number; email off.
  await expect(rem.getByRole('checkbox', { name: 'Text messages' })).toBeChecked();
  await rem.getByRole('checkbox', { name: 'Email' }).check();
  await rem.getByRole('textbox', { name: 'Email address' }).fill('parent@example');
  await rem.getByRole('button', { name: 'Save reminders' }).click();
  await expect(rem.getByText('Enter an email address like name@example.com.')).toBeVisible();
  await rem.getByRole('textbox', { name: 'Email address' }).fill('parent@example.com');
  await rem.getByRole('radio', { name: '1 week before' }).check();
  await rem.getByRole('checkbox', { name: 'Leo' }).uncheck();
  await rem.getByRole('button', { name: 'Save reminders' }).click();
  await expect(rem.getByText('Reminders saved.')).toBeVisible();

  // Preview: what's due with the age window, the pediatrician's number, a deep link.
  const preview = rem.getByTestId('reminder-preview');
  await expect(preview).toContainText('Maya has vaccines coming up');
  await expect(preview).toContainText('HepB dose 3 (6–18 months)');
  await expect(preview).toContainText('Call Dr. Priya Shah at (312) 555-0142');
  await expect(preview).toContainText(`/child/${maya.id}`);

  // Mock delivery: logged, not sent.
  const dev = page.getByRole('region', { name: 'Reminder log (development only)' });
  await dev.getByRole('button', { name: 'Send reminders now' }).click();
  await expect(dev.getByText(/reminders? logged/)).toBeVisible();
  await expect(dev).toContainText('Text · (312) 555-0199');
  await expect(dev).toContainText('Email · parent@example.com');
  await expect(dev).not.toContainText('Leo has vaccines');
  await dev.getByRole('link', { name: 'Open the link' }).first().click();
  await expect(page).toHaveURL(/\/child\/[^/]+$/);
});

test('export: a printable personal record and a PDF download', async ({ page }) => {
  await logIn(page);
  await page.getByRole('link', { name: 'Sofía', exact: true }).click();
  await page.getByRole('main').getByRole('link', { name: 'Print', exact: true }).click();

  await expect(page.getByText('Personal record, not an official immunization record.')).toBeVisible();
  await expect(page.getByText('For an official copy, ask your pediatrician or your state immunization registry.')).toBeVisible();
  await expect(page.getByText(/^Sofía · Born [A-Z][a-z]+ \d{4}$/)).toBeVisible(); // month and year, no day
  await expect(page.getByRole('rowheader', { name: 'Hepatitis B' }).first()).toBeVisible();
  await expect(page.getByRole('region').filter({ hasText: 'Other vaccines' }).or(page.getByText('BCG')).first()).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('immunization-record-Sofía.pdf');
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
});
