// Milestone 5: recording — Add to Record (4a), Dose Edit (4), Custom Vaccine (4d).
// SPEC.md §11 scenario 3 (mark Received → status updates), 6 (Not sure) and 9 (custom vaccine).
import { expect, test, type Page } from '@playwright/test';
import { fillDate, freshStart, logIn, switcher, currentChild, pickChild, openVisitPrep, vpQuestions, showSchedule, showOverview } from './helpers';

test.beforeEach(async ({ page }) => freshStart(page));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function parts(d: Date) {
  return { month: MONTHS[d.getMonth()], day: String(d.getDate()), year: String(d.getFullYear()) };
}
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function openChild(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
const summaryCount = (page: Page, label: string) =>
  page.getByRole('region', { name: 'Vaccine summary' }).getByText(label, { exact: true }).locator('..');

test('scenario 3 (Maya): mark a dose Received with a valid date → status updates', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await expect(summaryCount(page, 'Due now')).toContainText('6');

  const hepb = page.getByRole('region', { name: 'Due now' }).getByRole('listitem').filter({ hasText: 'Hepatitis B' });
  await hepb.getByRole('link', { name: 'Record this dose' }).click();
  await expect(page).toHaveURL(/\/dose\/hepb\/3$/);

  // A chip above the vaccine name names the child (no editing banner); the selector and tab bar are gone.
  await expect(page.getByTestId('child-chip').filter({ visible: true })).toHaveText('Maya');
  await expect(page.getByTestId('editing-banner')).toHaveCount(0);
  await expect(switcher(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hepatitis B · Dose 3');
  await expect(page.getByRole('radio', { name: 'Received' })).toBeChecked();
  await expect(page.getByText('If your child got one shot that covered several vaccines, log each one.')).toBeVisible();

  await fillDate(page, 'Date given', parts(new Date()));
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(/\/child\/[^/]+$/); // opened from Overview, so back to Overview
  await expect(summaryCount(page, 'Due now')).toContainText('5');
  await expect(page.getByRole('region', { name: 'Due now' })).not.toContainText('Hepatitis B');
  await showSchedule(page);
  await expect(page.getByRole('link', { name: `Hepatitis B Dose 3 Given ${short(new Date())}` })).toBeVisible();
});

test('Dose Edit blocks impossible dates and needs a date', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await showSchedule(page);
  await page.getByRole('link', { name: /Rotavirus Dose 3 Due now/ }).click();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter the month, day and year.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Date given' }).getByLabel('Month')).toBeFocused();

  await fillDate(page, 'Date given', parts(inDays(3)));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('This date is in the future.')).toBeVisible();
  await expect(page).toHaveURL(/\/dose\/rotavirus\/3(\?back=schedule(&view=list)?)?$/);

  await fillDate(page, 'Date given', { month: 'January', day: '1', year: '2020' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('This date is before your child was born.')).toBeVisible();

  await page.getByRole('link', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name: /Rotavirus Dose 3 Due now/ })).toBeVisible();
});

test('scenario 6: Not sure → where to look → a question is added → the child shows Needs info', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Leo');
  await showSchedule(page);
  await page.getByRole('link', { name: /Diphtheria.*Dose 5 Due now/ }).click();

  await page.getByRole('radio', { name: 'Not sure' }).check();
  await expect(page.getByText('Where to look:')).toBeVisible();
  await expect(page.getByText('Your state immunization registry')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Scan a record' })).toHaveAttribute('href', /\/add\/scan$/);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('link', { name: /Diphtheria.*Dose 5 Needs info/ })).toBeVisible();
  await expect(currentChild(page, 'Leo')).toBeVisible();
  await openVisitPrep(page, 'Leo');
  await expect(vpQuestions(page)).toContainText("Was Diphtheria, tetanus and whooping cough (DTaP) dose 5 given? Check Leo's records.");
  // The question is saved for Visit Prep (screen 5, milestone 7).
  const qs = await page.evaluate(async () => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>;
    const leo = kids.find((k) => k.name === 'Leo')!;
    return (await (await fetch(`/api/children/${leo.id}/questions`)).json()) as Array<{ origin: string; vaccineId?: string }>;
  });
  expect(qs).toContainEqual(expect.objectContaining({ origin: 'notSure', vaccineId: 'dtap' }));
});

test('scenario 9: search "BCG" → no match → add a custom vaccine by month name → saved under Other vaccines', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Leo');
  await page.getByRole('link', { name: 'Add Record' }).click();
  // Add to record shows the switcher with the child (no editing banner) and its own action bar instead of the tab bar.
  await expect(currentChild(page, 'Leo')).toBeVisible();
  await expect(page.getByTestId('editing-banner')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Search vaccines' }).fill('BCG');
  await expect(page.getByText('No vaccines match “BCG”.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Add a Custom Vaccine' }).filter({ visible: true }).click();

  await expect(page).toHaveURL(/\/add\/custom\?name=BCG$/);
  await expect(page.getByRole('textbox', { name: 'Name as written' })).toHaveValue('BCG');
  await page.getByRole('textbox', { name: 'Country (optional)' }).fill('Mexico');
  // Month is picked by name; the day is optional.
  await expect(page.getByRole('group', { name: 'Date given' }).getByLabel('Day (optional)')).toBeVisible();
  await fillDate(page, 'Date given', { month: 'March', year: '2023' });
  await page.getByRole('textbox', { name: 'Dose notes (optional)' }).fill('Scar on left arm.');
  // Asking the pediatrician how it fits is checked by default.
  await expect(page.getByRole('checkbox', { name: /Ask my pediatrician how this vaccine fits the schedule/ })).toBeChecked();
  await page.getByRole('button', { name: 'Save' }).click();

  const other = page.getByRole('region', { name: 'Other vaccines' });
  await expect(other).toContainText('BCG');
  await expect(other).toContainText('March 2023 · Mexico');
  await expect(other).toContainText('Not yet confirmed');
  // Custom vaccines never change AAP statuses.
  await expect(summaryCount(page, 'Overdue')).toContainText('0');

  // Editing: confirm with the pediatrician.
  await other.getByRole('link', { name: /BCG/ }).click();
  await page.getByRole('checkbox', { name: 'My pediatrician confirmed this vaccine' }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'Other vaccines' })).toContainText('Confirmed by pediatrician');

  // Its question is in Visit Prep.
  await openVisitPrep(page, 'Leo');
  await expect(vpQuestions(page)).toContainText('Confirm how BCG given in Mexico fits the schedule.');
});

test('Custom vaccine: unchecking "Ask my pediatrician" adds no question', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Leo');
  await page.getByRole('link', { name: 'Add Record' }).filter({ visible: true }).click();
  await page.getByRole('searchbox', { name: 'Search vaccines' }).fill('BCG');
  await page.getByRole('link', { name: 'Add a Custom Vaccine' }).filter({ visible: true }).click();
  await fillDate(page, 'Date given', { month: 'March', year: '2023' });
  await page.getByRole('checkbox', { name: /Ask my pediatrician how this vaccine fits the schedule/ }).uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'Other vaccines' })).toContainText('BCG');
  await openVisitPrep(page, 'Leo');
  await expect(page.getByRole('heading', { level: 1 }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/Confirm how BCG/)).toHaveCount(0);
});

test('Add to Record: typo-tolerant search, then pick a dose (default: next unrecorded)', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await page.getByRole('link', { name: 'Add Record' }).click();

  // Quick picks while the search is empty.
  await expect(page.getByRole('region', { name: 'Due Next for Maya' })).toContainText('Hepatitis B');
  await expect(page.getByRole('region', { name: 'Recently logged' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Search vaccines' }).fill('polo');
  await expect(page.getByRole('button', { name: /Polio \(IPV\)/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search vaccines' }).fill('poilo');
  await page.getByRole('button', { name: /Polio \(IPV\)/ }).click();
  await expect(page.getByRole('radio', { name: /Dose 3/ })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/dose\/ipv\/3$/);
});

test('Add to Record: a vaccine with only one dose to offer (COVID-19) skips the dose step', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await page.getByRole('link', { name: 'Add Record' }).click();
  await page.getByRole('searchbox', { name: 'Search vaccines' }).fill('covid');
  await page.getByRole('button', { name: /^COVID-19/ }).click();
  await expect(page).toHaveURL(/\/dose\/covid19\/1$/);
  await expect(page.getByRole('radio', { name: /Dose 1/ })).toHaveCount(0);

  // From the vaccine's page, too (Add Record + → straight to Dose Edit).
  await page.goto('/vaccines/covid19');
  await page.getByRole('link', { name: 'Add Record' }).click();
  await expect(page).toHaveURL(/\/dose\/covid19\/1$/);
});

test('Received as one of the child\'s custom vaccines: the date fills in, a notice asks to check with the pediatrician, and it counts as given', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Sofía');
  await showSchedule(page);
  await page.getByRole('link', { name: /Tetanus.*\(Tdap\) Dose 1 Due now/ }).click();
  await expect(page.getByRole('radio', { name: 'Received' })).toBeChecked();
  const custom = page.getByRole('combobox', { name: 'Given as a custom vaccine (optional)' });
  await expect(custom).toHaveValue('');
  await expect(page.getByText(/Check with your pediatrician that this vaccine counts/)).toHaveCount(0);

  await custom.selectOption({ label: 'BCG · Sep 27, 2014 · Mexico' });
  await expect(page.getByText('Check with your pediatrician that this vaccine counts as this dose on the AAP schedule.')).toBeVisible();
  const date = page.getByRole('group', { name: 'Date given' });
  await expect(date.getByLabel('Month')).toHaveValue('9');
  await expect(date.getByLabel(/^Day/)).toHaveValue('27');
  await expect(date.getByLabel('Year')).toHaveValue('2014');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Tdap\) Dose 1 Given Sep 27, 2014/ })).toBeVisible();
  // Reopened, it remembers which custom vaccine it was.
  await page.getByRole('link', { name: /Tdap\) Dose 1 Given Sep 27, 2014/ }).click();
  await expect(page.getByRole('combobox', { name: 'Given as a custom vaccine (optional)' })).toHaveValue(/.+/);
});

test('Delayed shows the new date; an exemption covers the rest of the series and can be deleted', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');

  await showSchedule(page);
  await page.getByRole('link', { name: /Diphtheria.*Dose 3 Due now/ }).click();
  await page.getByRole('radio', { name: 'Delayed (illness or other reason)' }).check();
  await fillDate(page, 'New target date', parts(inDays(14)));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: `Diphtheria, tetanus and whooping cough (DTaP) Dose 3 Delayed to ${short(inDays(14))}` })).toBeVisible();

  await page.getByRole('link', { name: /Pneumococcal \(PCV\) Dose 3 Due now/ }).click();
  await page.getByRole('radio', { name: 'Non-medical exemption' }).check();
  await expect(page.getByRole('checkbox', { name: 'Also apply to the rest of this series' })).toBeChecked();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'Pneumococcal (PCV) Dose 3 Exemption' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pneumococcal (PCV) Dose 4 Exemption' })).toBeVisible();

  await page.getByRole('link', { name: 'Pneumococcal (PCV) Dose 3 Exemption' }).click();
  await page.getByRole('button', { name: 'Delete entry' }).click();
  await expect(page.getByText("Delete this entry? This can't be undone.")).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Pneumococcal (PCV) Dose 3 Due now' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Pneumococcal \(PCV\) Dose 4 From/ })).toBeVisible();
});

test('Dose Edit: no "plan a date" choice; Declined then Not sure are last; Delayed moves the next dose back for spacing', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await showSchedule(page);
  await expect(page.getByRole('link', { name: /Haemophilus.*Dose 4 From May 2027/ })).toBeVisible();
  await page.getByRole('link', { name: /Haemophilus.*Dose 3 Due now/ }).click();
  const choices = page.getByRole('group', { name: 'What happened with this dose?' }).getByRole('radio');
  await expect(choices).toHaveCount(6);
  await expect(choices.nth(4)).toHaveAccessibleName('Declined');
  await expect(choices.last()).toHaveAccessibleName('Not sure');
  await expect(page.getByRole('radio', { name: 'Not yet, plan a date' })).toHaveCount(0);

  // Dose 4 must be at least 8 weeks after dose 3, so delaying dose 3 to ~300 days out moves it.
  const later = inDays(300);
  await page.getByRole('radio', { name: 'Delayed (illness or other reason)' }).check();
  await fillDate(page, 'New target date', parts(later));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\?tab=schedule&view=list$/);
  await expect(page.getByRole('link', { name: `Haemophilus influenzae type b (Hib) Dose 3 Delayed to ${short(later)}` })).toBeVisible();
  await expect(page.getByRole('link', { name: /Haemophilus.*Dose 4 From May 2027/ })).toHaveCount(0);

  // Declined: the chip says so.
  await page.getByRole('link', { name: /Pneumococcal \(PCV\) Dose 3 Due now/ }).click();
  await page.getByRole('radio', { name: 'Declined' }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'Pneumococcal (PCV) Dose 3 Declined' })).toBeVisible();
});

test('a note for the doctor becomes a question', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await showSchedule(page);
  await page.getByRole('link', { name: /Hib.*Dose 3 Due now/ }).click();
  await fillDate(page, 'Date given', parts(new Date()));
  await page.getByRole('textbox', { name: 'Note for the doctor (optional)' }).fill('She had a fever the next day. Is that normal?');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Maya' })).toBeVisible();
  await openVisitPrep(page, 'Maya');
  await expect(vpQuestions(page)).toContainText('She had a fever the next day.');
});

test('Add to record: switcher at the top (not the editing bar), Scan beside the title, action bar instead of the tab bar', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await page.getByRole('link', { name: 'Add Record' }).click();
  await expect(currentChild(page, 'Maya')).toBeVisible();
  await expect(page.getByTestId('editing-banner')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  // Scan a record is beside the title, or (when "Create a Record for <name>" fills a phone's width) just below it, on the left.
  const h1 = page.getByRole('heading', { level: 1, name: /^Create a Record for / });
  const scan = page.getByRole('main').getByRole('link', { name: 'Scan a record', exact: true });
  const [hb, sb] = [await h1.boundingBox(), await scan.boundingBox()];
  const beside = Math.abs(hb!.y + hb!.height / 2 - (sb!.y + sb!.height / 2)) < 12 && sb!.x > hb!.x + hb!.width;
  const below = sb!.y >= hb!.y + hb!.height - 2 && Math.abs(sb!.x - hb!.x) < 2;
  expect(beside || below).toBe(true);

  // Below the search: "Can't find what you're looking for?" with a plain link row (not a button).
  const custom = page.getByRole('region', { name: "Can't find what you're looking for?" }).filter({ visible: true });
  await expect(custom).toContainText('Add international vaccines');
  await expect(custom.getByRole('link', { name: 'Add a Custom Vaccine' })).not.toHaveClass(/\bbtn\b/);
  const [search, cb] = [await page.getByRole('searchbox', { name: 'Search vaccines' }).filter({ visible: true }).boundingBox(), await custom.boundingBox()];
  expect(cb!.y).toBeGreaterThan(search!.y);

  // Cancel is the only button in a bar fixed just above the tab bar.
  const bar = page.getByTestId('add-bar').filter({ visible: true });
  await expect(bar.getByRole('link')).toHaveText(['Cancel']);
  await expect(bar.getByRole('link', { name: 'Cancel' })).toHaveClass(/\bbtn\b/);
  const b = await bar.boundingBox();
  expect(Math.abs(b!.y + b!.height - page.viewportSize()!.height)).toBeLessThanOrEqual(2); // at the bottom edge
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');

  // Switching child stays on Add to record, for the new child.
  await pickChild(page, 'Leo');
  // …and Cancel now goes to the new child's page.
  await expect(page).toHaveURL(/\/child\/([^/]+)\/add\?from=%2Fchild%2F\1$/);
  await expect(currentChild(page, 'Leo')).toBeVisible();
});

test('Add to record: Cancel goes back where it was opened from (Home or the child page)', async ({ page }) => {
  await logIn(page);
  // From Home (Add Record).
  await page.getByRole('button', { name: 'Add Record', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add to a record' }).getByRole('button', { name: 'Leo', exact: true }).click();
  await expect(page).toHaveURL(/\/child\/[^/]+\/add\?from=%2F$/);
  await page.getByTestId('add-bar').filter({ visible: true }).getByRole('link', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Child Status' })).toBeVisible();

  // From a child's schedule page.
  await openChild(page, 'Ava');
  const avaUrl = page.url();
  await page.getByRole('link', { name: 'Add Record' }).click();
  await page.getByTestId('add-bar').filter({ visible: true }).getByRole('link', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(avaUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Ava' })).toBeVisible();
});
