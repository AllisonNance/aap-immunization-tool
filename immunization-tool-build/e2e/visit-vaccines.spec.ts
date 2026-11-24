// Milestone 7: Visit Prep (5), Vaccines (6, 6a) and Guides (7). SPEC.md §11
// scenarios 3 (vaccine detail step), 7 and 10.
import { expect, test, type Page } from '@playwright/test';
import { fillDate, freshStart, logIn, switcher, pickChild, currentChild, mockReady, showSchedule } from './helpers';

test.beforeEach(async ({ page }) => freshStart(page));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const parts = (d: Date) => ({ month: MONTHS[d.getMonth()], day: String(d.getDate()), year: String(d.getFullYear()) });
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function openChild(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
const pick = pickChild;

test('scenario 3: child page → vaccine detail (with the child’s doses) → back', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await page.getByRole('region', { name: 'Due now' }).getByRole('link', { name: 'Hepatitis B' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Hepatitis B' })).toBeVisible();
  await expect(page.getByText('Protects against:')).toBeVisible();
  const mine = page.getByRole('region', { name: "Maya's doses" });
  await expect(mine.getByRole('link', { name: /Dose 3/ })).toContainText('Due now');
  await expect(mine.getByRole('link', { name: /Dose 1/ })).toContainText('Given');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Maya' })).toBeVisible();
});

test('scenario 7: the dose page locks the child (name chip); Visit Prep switches child and the list changes', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Ava');
  await showSchedule(page);
  await page.getByRole('link', { name: /Hepatitis A Dose 2 Due now/ }).click();
  await expect(page.getByTestId('child-chip').filter({ visible: true })).toHaveText('Ava');
  await expect(switcher(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Cancel' }).click();

  await page.getByRole('link', { name: 'Visit Prep', exact: true }).click();
  await expect(page).toHaveURL(/\/visit-prep\?child=/);
  const questions = page.getByRole('region', { name: 'Questions and notes' });
  await expect(questions).toContainText('How do we catch up on the shots she missed?');

  await pick(page, 'Sofía');
  await expect(currentChild(page, 'Sofía')).toBeVisible();
  await expect(questions).toContainText('Confirm how BCG given in Mexico fits the schedule.');
  await expect(questions).not.toContainText('How do we catch up');
  // Grouped by vaccine, then general.
  await expect(questions.getByRole('region', { name: 'Measles, mumps and rubella (MMR)' })).toBeVisible();
  await expect(questions.getByRole('region', { name: 'General' })).toBeVisible();
  // Not-sure doses link to Dose Edit (5 → 4).
  await expect(page.getByRole('region', { name: 'Doses marked not sure' }).getByRole('link')).toHaveAttribute('href', /\/dose\/mmr\/2$/);
});

test('scenario 10: a 5-year-old gets the school and childcare card and guide; nothing says "required"', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Leo');
  await page.getByRole('link', { name: /School and childcare/ }).click();

  await expect(page).toHaveURL(/\/vaccines\/guides\/school-and-childcare$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Vaccines for school and childcare' })).toBeVisible();
  await expect(page.getByText('Rotavirus, HPV and hepatitis A', { exact: false })).toBeVisible();
  await expect(page.getByText(/required/i).filter({ visible: true })).toHaveCount(0);
  const hc = page.getByRole('main').getByRole('link', { name: /HealthyChildren\.org/ });
  await expect(hc).toHaveAttribute('href', 'https://www.healthychildren.org');
  await expect(hc).toHaveAttribute('target', '_blank');
  await expect(page.getByText(/Placeholder text/)).toHaveCount(0);
});

test('Vaccines & Guides: Vaccines tab (default) has search and A–Z; Guides tab lists guides; the tab survives a guide and back', async ({ page }) => {
  await logIn(page);
  await page.getByRole('link', { name: 'Vaccines', exact: true }).click(); // the tab bar label is unchanged
  await expect(page.getByRole('heading', { level: 1, name: 'Vaccines & Guides' })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Vaccines and guides' });
  await expect(tabs.getByRole('tab')).toHaveText(['Vaccines', 'Guides']);
  await expect(tabs.getByRole('tab', { name: 'Vaccines' })).toHaveAttribute('aria-selected', 'true');

  const list = page.getByRole('region', { name: 'All vaccines, A–Z' }).getByRole('link');
  await expect(list).toHaveCount(16);
  await expect(list.first()).toContainText('Chickenpox (varicella)');
  await expect(page.getByRole('link', { name: /BCG/ })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search vaccines' }).fill('polio');
  await expect(page.getByRole('region', { name: 'Results' }).getByRole('link')).toHaveText([/Polio \(IPV\)/]);
  await expect(page.getByRole('link', { name: 'Catching up on missed doses' })).toHaveCount(0); // guides are in the other tab

  await tabs.getByRole('tab', { name: 'Guides' }).click();
  await expect(page).toHaveURL(/\/vaccines\?tab=guides$/);
  await expect(page.getByRole('tabpanel', { name: 'Guides' }).getByRole('link')).toHaveCount(8);
  await expect(page.getByRole('searchbox', { name: 'Search vaccines' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Catching up on missed doses' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Catching up on missed doses' })).toBeVisible();
  await page.getByRole('link', { name: /All guides/ }).click();
  await expect(page.getByRole('tab', { name: 'Guides' }).filter({ visible: true })).toHaveAttribute('aria-selected', 'true');
});

test('Vaccine detail: Back returns to the page and tab it was opened from, or to All vaccines', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await showSchedule(page);
  const panel = page.getByRole('tabpanel', { name: 'Schedule' });
  await panel.getByRole('link', { name: 'Hepatitis B', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hepatitis B' })).toBeVisible();
  await page.getByRole('link', { name: '← Back' }).click();
  await expect(page).toHaveURL(/\/child\/[^/?]+\?tab=schedule&view=list$/);
  await expect(page.getByRole('tab', { name: 'Schedule' }).filter({ visible: true })).toHaveAttribute('aria-selected', 'true');

  // Opened directly: nowhere in the app to go back to, so it goes to All vaccines.
  await page.goto('/vaccines/hepb');
  await expect(page.getByRole('heading', { level: 1, name: 'Hepatitis B' })).toBeVisible();
  await page.getByRole('link', { name: '← Back' }).click();
  await expect(page).toHaveURL(/\/vaccines$/);
});

test('Vaccine detail: doses and spacing, links, Add Record prefiltered, Add a question', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await page.getByRole('link', { name: 'Vaccines', exact: true }).click();
  await page.getByRole('region', { name: 'All vaccines, A–Z' }).getByRole('link', { name: /^Diphtheria, tetanus and whooping cough \(DTaP\)/ }).click();

  await expect(page.getByText('At least 4 weeks after dose 1').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /AAP vaccine fact sheet/ })).toHaveAttribute('href', 'https://www.aap.org/IZFactSheets');
  await expect(page.getByText(/will be linked here/)).toHaveCount(0);

  // Add a question: Home's question popup, with this page's child and vaccine preselected (6a → 5).
  await page.getByRole('button', { name: 'Add a question' }).click();
  const dialog = page.getByTestId('question-dialog');
  await expect(dialog.getByRole('radio', { name: 'Maya' })).toBeChecked();
  await expect(dialog.getByRole('combobox', { name: 'Vaccine (optional)' })).toHaveValue('dtap');
  await dialog.getByRole('textbox', { name: 'Your question' }).fill('Is the DTaP booster sore for long?');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Question added for Maya.')).toBeVisible();
  await page.getByRole('link', { name: 'Visit Prep', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Questions and notes' }).getByRole('region', { name: 'Diphtheria, tetanus and whooping cough (DTaP)' }),
  ).toContainText('Is the DTaP booster sore for long?');

  // Add Record, prefiltered (6a → 4a).
  await page.goBack();
  await page.getByRole('link', { name: 'Add Record' }).click();
  await expect(page).toHaveURL(/\/add\?vaccine=dtap&from=%2Fvaccines%2Fdtap$/);
  // Opened for one vaccine: no search or scan, just that vaccine's doses.
  await expect(page.getByText('Diphtheria, tetanus and whooping cough (DTaP)').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search vaccines' }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Scan a record' }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add a Custom Vaccine' }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Dose 3/ })).toBeChecked();
});

test('Cancel on Add to record, then Back on the vaccine page, returns to the schedule it came from', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  await showSchedule(page);
  await page.getByRole('tabpanel', { name: 'Schedule' }).getByRole('link', { name: 'Hepatitis B', exact: true }).click();
  await expect(page).toHaveURL(/\/vaccines\/hepb$/);
  await page.getByRole('link', { name: 'Add Record' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/add\?vaccine=hepb&from=%2Fvaccines%2Fhepb$/);
  await page.getByRole('link', { name: 'Cancel' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/vaccines\/hepb$/);
  await page.getByRole('link', { name: '← Back' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/child\/[^/?]+\?tab=schedule&view=list$/);
});

test('Add Record opens Add to record for that page\'s vaccine, even after another vaccine page', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Maya');
  for (const [name, title] of [
    [/^Haemophilus influenzae type b \(Hib\)/, 'Haemophilus influenzae type b (Hib)'],
    [/^Polio \(IPV\)/, 'Polio (IPV)'],
  ] as const) {
    await page.getByRole('link', { name: 'Vaccines', exact: true }).click();
    await page.getByRole('region', { name: 'All vaccines, A–Z' }).getByRole('link', { name }).filter({ visible: true }).click();
    await page.getByRole('link', { name: 'Add Record' }).filter({ visible: true }).click();
    await expect(page.getByRole('main').getByText(title, { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('link', { name: 'Cancel' }).filter({ visible: true }).click();
  }
});

test('"No child" on the Vaccines tab hides the child module', async ({ page }) => {
  await logIn(page);
  await page.getByRole('link', { name: 'Vaccines', exact: true }).click();
  await page.getByRole('link', { name: /^Hepatitis B/ }).click();
  await expect(page.getByRole('region', { name: "Maya's doses" })).toBeVisible();
  await pickChild(page, 'No child');
  await expect(page.getByRole('region', { name: /'s doses$/ })).toHaveCount(0);
  await expect(currentChild(page, 'No child')).toBeVisible();
  await pick(page, 'Leo');
  await expect(page.getByRole('region', { name: "Leo's doses" })).toBeVisible();
});

test('About the child (with past reactions) is on Visit Prep just above Pediatrician, not on the child page', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Ava');
  await expect(page.getByRole('region', { name: 'About Ava' }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Visit Prep', exact: true }).click();
  const about = page.getByRole('region', { name: 'About Ava' }).filter({ visible: true });
  await expect(about.getByRole('term')).toHaveText(['Past reactions']);
  await expect(about.getByRole('definition')).toHaveText(['Fever of 101°F the day after her 4-month shots.']);
  const headings = await page.getByRole('heading', { level: 2 }).filter({ visible: true }).allTextContents();
  expect(headings.slice(-2)).toEqual(['About Ava', 'Pediatrician']);
});

test('Visit Prep: set the appointment, see what is likely due, add / edit / resolve questions', async ({ page }) => {
  await logIn(page, 'one-child');
  await page.getByRole('link', { name: 'Visit Prep', exact: true }).click();

  // Maya's fixture appointment is in 9 days; change it.
  const appt = page.getByRole('region', { name: 'Next appointment' });
  await expect(appt).toContainText(short(inDays(9)));
  await appt.getByRole('button', { name: 'Change' }).click();
  await fillDate(page, 'Appointment date', parts(inDays(-1)));
  await appt.getByRole('button', { name: 'Save' }).click();
  await expect(appt.getByText('Choose today or a later date.')).toBeVisible();
  await fillDate(page, 'Appointment date', parts(inDays(20)));
  await appt.getByRole('button', { name: 'Save' }).click();
  await expect(appt).toContainText(short(inDays(20)));
  const due = page.getByRole('region', { name: 'Likely due at this visit' });
  await expect(due).toContainText('Hepatitis B');
  await expect(due).toContainText('Influenza (flu)');

  // Pediatrician: the number is the call link; no Call button. Print just says "Print".
  const ped = page.getByRole('region', { name: 'Pediatrician' });
  await expect(ped.getByRole('link', { name: '(312) 555-0142' })).toHaveAttribute('href', 'tel:3125550142');
  await expect(ped.getByRole('link', { name: 'Call' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print', exact: true }).filter({ visible: true })).toBeVisible();

  const qs = page.getByRole('region', { name: 'Questions and notes' });
  // Add a general question: "Add a question +" beside the title opens Home's popup, with Maya picked.
  const add = qs.getByRole('button', { name: 'Add a question' });
  const [hb, ab] = [await qs.getByRole('heading', { level: 2, name: 'Questions and notes' }).boundingBox(), await add.boundingBox()];
  expect(Math.abs(hb!.y + hb!.height / 2 - (ab!.y + ab!.height / 2))).toBeLessThan(12); // same line…
  expect(ab!.x + ab!.width).toBeGreaterThan(page.viewportSize()!.width - 40); // …at the right
  await expect(qs.getByRole('textbox')).toHaveCount(0); // no form on the page
  await add.click();
  const d = page.getByTestId('question-dialog');
  await expect(d.getByRole('radio', { name: 'Maya' })).toBeChecked();
  await d.getByRole('textbox', { name: 'Your question' }).fill('Can we spread out the shots?');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Question added for Maya.')).toBeVisible();
  await expect(qs.getByRole('region', { name: 'General' })).toContainText('Can we spread out the shots?');

  // Edit it.
  await qs.getByRole('button', { name: 'Edit: Can we spread out the shots?' }).click();
  await qs.getByRole('textbox', { name: 'Question', exact: true }).fill('Can we spread out the shots over two visits?');
  await qs.getByRole('button', { name: 'Save' }).click();
  await expect(qs).toContainText('Can we spread out the shots over two visits?');

  // Add an answer (optional): shown under the question.
  await qs.getByRole('button', { name: 'Add answer: Can we spread out the shots over two visits?' }).click();
  await qs.getByRole('textbox', { name: 'Answer (optional)' }).fill('Yes, if we come back within a month.');
  await qs.getByRole('button', { name: 'Save' }).click();
  await expect(qs).toContainText('Answer: Yes, if we come back within a month.');
  await expect(qs.getByRole('button', { name: 'Edit answer: Can we spread out the shots over two visits?' })).toBeVisible();

  // Resolve it: it leaves Visit Prep (resolved questions aren't listed here) for the Past questions page.
  await qs.getByRole('checkbox', { name: 'Mark resolved: Can we spread out the shots over two visits?' }).click();
  await expect(qs.getByRole('region', { name: 'General' })).toHaveCount(0);
  await expect(qs.getByRole('checkbox', { name: /^Reopen:/ })).toHaveCount(0);
  await qs.getByRole('link', { name: /^Past questions \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/\/visit-prep\/past\?child=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Past Questions for Maya' })).toBeVisible();
  const general = page.getByRole('region', { name: 'General' }).filter({ visible: true });
  await expect(general).toContainText('Can we spread out the shots over two visits?');
  await expect(general).toContainText('Answer: Yes, if we come back within a month.');
  await expect(general.getByRole('checkbox', { name: 'Reopen: Can we spread out the shots over two visits?' })).toBeChecked();
  // Not a tab: Visit Prep stays the active tab. Back returns to Visit Prep.
  await expect(page.getByRole('link', { name: 'Visit Prep', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: '← Back' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/visit-prep\?child=/);
});

test('Home: no past questions link; each question has Add answer, and the answer shows on Home and Visit Prep', async ({ page }) => {
  await logIn(page);
  const oq = page.getByRole('region', { name: 'Open Questions' });
  await expect(oq.getByRole('link', { name: /past questions/i })).toHaveCount(0);
  await oq.getByRole('button', { name: 'Add answer: Can she get the flu shot at the 6-month visit too?' }).click();
  await oq.getByRole('textbox', { name: 'Answer (optional)' }).fill('Yes, at the same visit.');
  await oq.getByRole('button', { name: 'Save' }).click();
  await expect(oq).toContainText('Answer: Yes, at the same visit.');
  await expect(oq.getByRole('button', { name: 'Edit answer: Can she get the flu shot at the 6-month visit too?' })).toBeVisible();
  // Tapping the answer link doesn't check the question off.
  await expect(oq.getByRole('checkbox', { name: 'Can she get the flu shot at the 6-month visit too?' })).not.toBeChecked();

  await page.getByRole('link', { name: "Prepare for Maya's visit" }).click();
  await expect(page.getByRole('region', { name: 'Questions and notes' }).filter({ visible: true })).toContainText('Answer: Yes, at the same visit.');
  // The sample past question (with its answer) is on the Past questions page.
  await page.getByRole('link', { name: /^Past questions \(\d+\)$/ }).filter({ visible: true }).click();
  const general = page.getByRole('region', { name: 'General' }).filter({ visible: true });
  await expect(general).toContainText('Should we bring her vaccine card to every visit?');
  await expect(general).toContainText('Answer: Yes. Bring it so the office can add each new dose.');
});

test('guide links into the app use the selected child; guides follow the language setting', async ({ page }) => {
  await logIn(page);
  await openChild(page, 'Leo');
  await page.goto('/vaccines/guides/finding-old-records');
  await mockReady(page);
  const leoId = await page.evaluate(async () => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string }>;
    return kids.find((k) => k.name === 'Leo')!.id;
  });
  await pick(page, 'Leo');
  await expect(page.getByRole('link', { name: 'Scan a record' })).toHaveAttribute('href', `/child/${leoId}/add/scan`);

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Español' }).click();
  await expect(page.getByRole('radio', { name: 'Español' })).toBeChecked();
  await page.goto('/vaccines/guides/catch-up');
  await expect(page.getByRole('heading', { level: 1, name: 'Ponerse al día con las dosis que faltan' })).toBeVisible();
});
