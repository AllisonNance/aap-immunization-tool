// Milestone 4: Home (1) and the child page (2). SPEC.md §11 scenarios 3–5
// (scenario 3's vaccine detail and "mark Received" steps land with milestones 5 and 7).
import { expect, test, type Page } from '@playwright/test';
import { addAge, addDays } from '../lib/dates';
import { freshStart, logIn, switcher, showSchedule, pickChild, showOverview } from './helpers';

test.beforeEach(async ({ page }) => freshStart(page));

async function childId(page: Page, name: string): Promise<{ id: string; dateOfBirth: string }> {
  return page.evaluate(async (n) => {
    const kids = (await (await fetch('/api/children')).json()) as Array<{ id: string; name: string; dateOfBirth: string }>;
    return kids.find((k) => k.name === n)!;
  }, name);
}

const card = (page: Page, name: string) =>
  page.getByTestId('child-card').filter({ has: page.getByRole('link', { name, exact: true }) });

test('Home: one card per child with status, what is next and a needs-info count', async ({ page }) => {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Child Status' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'See what changed' })).toHaveAttribute('href', '/vaccines/guides/schedule-changes');
  await expect(page.getByRole('link', { name: /open questions for the pediatrician/ })).toHaveCount(0);

  await expect(card(page, 'Maya')).toContainText('Due soon');
  await expect(card(page, 'Ava')).toContainText('Overdue');
  await expect(card(page, 'Sofía')).toContainText('Needs info');
  await expect(card(page, 'Sofía')).toContainText('1 needs info');
  // No child selector on Home.
  await expect(switcher(page)).toHaveCount(0);
});

test('scenario 3 (Maya, 6 months): Due soon with vaccines and windows → child page Due now → vaccine link', async ({ page }) => {
  await logIn(page);
  const maya = card(page, 'Maya');
  // The card lists what's next with no "Due now" title and no age.
  await expect(maya).not.toContainText('Due now');
  await expect(maya.getByText('6 months', { exact: true })).toHaveCount(2); // RV and DTaP windows only, not her age
  await expect(maya).toContainText('HepB');
  await expect(maya).toContainText('6–18 months');

  await maya.click();
  const due = page.getByRole('region', { name: 'Due now' });
  await expect(due.getByRole('listitem').filter({ hasText: 'Hepatitis B' })).toContainText('Dose 3 · 6–18 months');
  await expect(due.getByRole('link', { name: 'Hepatitis B' })).toBeVisible();
  // No note under the Due now cards.
  await expect(due.getByText('These are often given at the same visit.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Catching up' })).toHaveCount(0);

  // Vaccine detail (screen 6a lands in milestone 7), then back.
  await due.getByRole('link', { name: 'Hepatitis B' }).click();
  await expect(page).toHaveURL(/\/vaccines\/hepb$/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Maya' })).toBeVisible();
});

test('scenario 4 (Leo, 5 years, no history): nothing overdue, earlier doses "Not entered", 4–6 year doses due', async ({ page }) => {
  await logIn(page);
  await expect(card(page, 'Leo')).not.toContainText('Overdue');
  await card(page, 'Leo').click();

  const summary = page.getByRole('region', { name: 'Vaccine summary' });
  await expect(summary.getByText('Overdue').locator('..')).toContainText('0');
  await showSchedule(page);
  await expect(page.getByRole('link', { name: 'Hepatitis B Dose 1 Not entered' })).toBeVisible();
  await expect(page.getByText('Not entered').filter({ visible: true }).first()).toBeVisible();
  await showOverview(page);
  const due = page.getByRole('region', { name: 'Due now' });
  await expect(due.getByText('Dose 5 · 4–6 years')).toBeVisible();

  // Prompt cards right after the counts: Add past vaccines (no records yet), then School and childcare (ages 4–6).
  // No "Complete profile" card.
  const addPast = page.getByRole('link', { name: /Add past vaccines/ });
  const school = page.getByRole('link', { name: /School and childcare/ });
  await expect(addPast).toHaveAttribute('href', /\/add\?from=%2Fchild%2F[^&]+$/);
  await expect(school).toHaveAttribute('href', '/vaccines/guides/school-and-childcare');
  await expect(page.getByRole('link', { name: /Complete Leo's profile/ })).toHaveCount(0);
  const [ab, sb, db] = [await addPast.boundingBox(), await school.boundingBox(), await due.boundingBox()];
  expect(sb!.y).toBeGreaterThan(ab!.y);
  expect(sb!.y).toBeLessThan(db!.y); // above Due now
  // No "required" anywhere.
  await expect(page.getByText(/required/i).filter({ visible: true })).toHaveCount(0);
});

test('scenario 5 (Ava, behind): Overdue on Home; catch-up path names the missed doses; a range is Due now on its last day', async ({ page }) => {
  await logIn(page);
  await expect(card(page, 'Ava')).toContainText('Overdue');
  await expect(card(page, 'Ava')).toContainText('DTaP');
  const ava = await childId(page, 'Ava');

  await card(page, 'Ava').click();
  const catchUp = page.getByRole('region', { name: 'Catching up' });
  await expect(catchUp).toContainText('(DTaP) · Dose 4');
  await expect(catchUp).toContainText('(Hib) · Dose 4');
  await expect(catchUp).toContainText('(PCV) · Dose 4');
  await expect(catchUp.getByRole('link', { name: 'How catching up works' })).toHaveAttribute('href', '/vaccines/guides/catch-up');
  // Each row opens the vaccine's page (like Due now), not Dose Edit.
  await expect(catchUp.getByRole('link', { name: /\(Hib\) · Dose 4/ })).toHaveAttribute('href', '/vaccines/hib');
  // HepA 2 is "12–23 months"-style range still open: Due now, not overdue, not in catch-up.
  await expect(catchUp).not.toContainText('Hepatitis A');
  await showSchedule(page);
  await expect(page.getByRole('link', { name: 'Hepatitis A Dose 2 Due now' })).toBeVisible();

  // Last day of HepA dose 2's range (overdue from 24 months): still Due now.
  const overdueDay = addAge(ava.dateOfBirth, { value: 24, unit: 'months' });
  await page.clock.setFixedTime(new Date(`${addDays(overdueDay, -1)}T12:00:00`));
  await page.reload();
  await expect(page.getByRole('link', { name: 'Hepatitis A Dose 2 Due now' })).toBeVisible();
  await showOverview(page);
  await expect(page.getByRole('region', { name: 'Catching up' })).not.toContainText('Hepatitis A');

  // The day after the range ends: overdue, and the catch-up path names it.
  await page.clock.setFixedTime(new Date(`${overdueDay}T12:00:00`));
  await page.reload();
  await expect(page.getByRole('region', { name: 'Catching up' })).toContainText('Hepatitis A · Dose 2');
  await showSchedule(page);
  await expect(page.getByRole('link', { name: 'Hepatitis A Dose 2 Overdue' })).toBeVisible();
  await page.goto('/');
  await expect(card(page, 'Ava')).toContainText('Overdue');
});

test('child page: other vaccines, about and this season (Sofía)', async ({ page }) => {
  await logIn(page);
  await card(page, 'Sofía').click();
  const other = page.getByRole('region', { name: 'Other vaccines' });
  await expect(other).toContainText('BCG');
  await expect(other).toContainText('Mexico');
  await expect(other).toContainText('Not yet confirmed');

  // The child page has no pediatrician, questions or appointment sections (they're in Visit Prep).
  await expect(page.getByRole('region', { name: 'Pediatrician', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Questions for the pediatrician' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Next appointment' })).toHaveCount(0);
  // Seasonal vaccines are listed apart and never overdue.
  await expect(page.getByRole('region', { name: 'This season' })).toContainText('Influenza (flu)');
});

test('schedule: Timeline is the default (switch on the left); List is one row per vaccine', async ({ page }) => {
  await logIn(page);
  await card(page, 'Maya').click();
  await page.getByRole('tab', { name: 'Schedule' }).filter({ visible: true }).click();
  const sched = page.getByRole('tabpanel', { name: 'Schedule' });
  const timeline = sched.getByRole('button', { name: 'Timeline' });
  const list = sched.getByRole('button', { name: 'List' });
  await expect(timeline).toHaveAttribute('aria-pressed', 'true');
  await expect(sched.getByRole('heading', { name: 'Birth' })).toBeVisible();
  await expect(sched.getByText('Now', { exact: true })).toBeVisible();
  // Every dose links to Dose Edit (screen 4). In the timeline the abbreviation is shown: "RV · Dose 3 Due now".
  await expect(sched.getByRole('link', { name: /RV · Dose 3 Due now/ })).toHaveAttribute('href', /\/dose\/rotavirus\/3\?back=schedule$/);
  // The switch sits at the left, Timeline first.
  const [panel, tb, lb] = [await sched.boundingBox(), await timeline.boundingBox(), await list.boundingBox()];
  expect(tb!.x - panel!.x).toBeLessThan(8);
  expect(lb!.x).toBeGreaterThan(tb!.x);

  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(sched.getByRole('link', { name: /Rotavirus Dose 3 Due now/ })).toBeVisible();
});

test('Home has no Add to record or Add a child button (Record + replaces it; adding a child is in Settings)', async ({ page }) => {
  await logIn(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'Add to record' })).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Add to record' })).toHaveCount(0);
  await expect(main.getByRole('link', { name: /Add a child/ })).toHaveCount(0);
});

test('Home with one child, and the empty state', async ({ page }) => {
  await logIn(page, 'one-child');
  const maya = await childId(page, 'Maya');
  // With one child, Record + goes straight to her record page (nothing to choose).
  await page.getByRole('button', { name: 'Add Record', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/child/${maya.id}/add\\?from=%2F$`));
  await page.goto('/');

  await page.evaluate((id) => fetch(`/api/children/${id}`, { method: 'DELETE' }), maya.id);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add your first child' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add a child' })).toHaveAttribute('href', '/children/add?from=%2F');
});

test('Home notices sit above the title, each can be closed, and stay closed', async ({ page }) => {
  await logIn(page);
  const schedule = page.getByTestId('notice-schedule').filter({ visible: true });
  const flu = page.getByTestId('notice-flu').filter({ visible: true });
  await expect(schedule).toContainText('The AAP updated its vaccine schedule on Sep 2, 2026.');
  await expect(flu).toContainText("It's flu season.");
  // Both come before the page title.
  const order = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const all = [...main.querySelectorAll<HTMLElement>('[data-testid^="notice-"], h1')].filter((el) => el.checkVisibility()).map((el) => (el.tagName === 'H1' ? 'h1' : el.getAttribute('data-testid')));
    return all;
  });
  expect(order).toEqual(['notice-schedule', 'notice-flu', 'h1']);

  await flu.getByRole('button', { name: 'Close notice' }).click();
  await expect(flu).toHaveCount(0);
  await expect(schedule).toBeVisible();
  await page.getByRole('link', { name: 'Vaccines', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('notice-flu').filter({ visible: true })).toHaveCount(0);
  await schedule.getByRole('button', { name: 'Close notice' }).click();
  await expect(schedule).toHaveCount(0);
});

test('Open Questions lists each child\'s open questions, with a way to Visit Prep', async ({ page }) => {
  await logIn(page);
  const section = page.getByRole('region', { name: 'Open Questions' });
  await expect(section.getByRole('heading', { level: 2, name: 'Open Questions' })).toBeVisible();
  const maya = section.getByRole('region', { name: 'Maya' });
  await expect(maya).toContainText('Influenza (flu)');
  await expect(maya).toContainText('Can she get the flu shot at the 6-month visit too?');
  // A child with no open questions isn't listed.
  await expect(section.getByRole('region', { name: 'Leo' })).toHaveCount(0);
  const mayaId = (await childId(page, 'Maya')).id;
  await expect(maya.getByRole('link', { name: "Prepare for Maya's visit" })).toHaveAttribute('href', `/visit-prep?child=${mayaId}`);
});

test('a question can be checked off from Home; it is resolved for Visit Prep too', async ({ page }) => {
  await logIn(page);
  const maya = page.getByRole('region', { name: 'Open Questions' }).getByRole('region', { name: 'Maya' });
  const box = maya.getByRole('checkbox', { name: /Can she get the flu shot/ });
  await box.check();
  await expect(box).toBeChecked();
  // Still listed (crossed out) so it can be unchecked; saved to the account.
  await expect(maya).toContainText('Can she get the flu shot');
  const mayaId = (await childId(page, 'Maya')).id;
  await expect
    .poll(() => page.evaluate(async (id) => ((await (await fetch(`/api/children/${id}/questions`)).json()) as Array<{ text: string; resolved: boolean }>).find((q) => q.text.startsWith('Can she get the flu shot'))?.resolved, mayaId))
    .toBe(true);
  // Unchecking reopens it.
  await box.uncheck();
  await expect
    .poll(() => page.evaluate(async (id) => ((await (await fetch(`/api/children/${id}/questions`)).json()) as Array<{ text: string; resolved: boolean }>).find((q) => q.text.startsWith('Can she get the flu shot'))?.resolved, mayaId))
    .toBe(false);
  // Resolved questions drop off Home next time; Maya had only this one, so she isn't listed.
  await box.check();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Open Questions' }).getByRole('region', { name: 'Maya' })).toHaveCount(0);
});

test('Open Questions says so when no child has an open question', async ({ page }) => {
  await logIn(page, 'one-child');
  const maya = await childId(page, 'Maya');
  await page.evaluate(async (id) => {
    const qs = (await (await fetch(`/api/children/${id}/questions`)).json()) as Array<{ id: string; updatedAt: string; resolved: boolean }>;
    for (const q of qs.filter((x) => !x.resolved)) {
      await fetch(`/api/children/${id}/questions/${q.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved: true, updatedAt: q.updatedAt }) });
    }
  }, maya.id);
  await page.reload();
  const section = page.getByRole('region', { name: 'Open Questions' });
  await expect(section).toContainText('No open questions.');
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(0);
});

test('child page: Add Record + and Print sit beside the name; no Given count', async ({ page }) => {
  await logIn(page);
  await card(page, 'Maya').click();
  const h1 = page.getByRole('heading', { level: 1, name: 'Maya' });
  const main = page.getByRole('main');
  const add = main.getByRole('link', { name: 'Add Record' });
  const print = main.getByRole('link', { name: 'Print', exact: true });
  await expect(add).toHaveAttribute('href', /\/add\?from=/);
  await expect(print).toHaveAttribute('href', /\/record$/);
  const [hb, ab, pb] = [await h1.boundingBox(), await add.boundingBox(), await print.boundingBox()];
  for (const b of [ab!, pb!]) {
    expect(Math.abs(hb!.y + hb!.height / 2 - (b.y + b.height / 2))).toBeLessThan(12);
    expect(b.x).toBeGreaterThan(hb!.x + hb!.width);
  }
  const summary = page.getByRole('region', { name: 'Vaccine summary' });
  await expect(summary.getByText('Given', { exact: true })).toHaveCount(0);
  await expect(summary.getByText('Due now', { exact: true })).toBeVisible();
});

test('child page tabs: Overview (default) and Schedule; arrow keys move between them; the tab is kept when switching child', async ({ page }) => {
  await logIn(page);
  await card(page, 'Maya').click();
  const tabs = page.getByRole('tablist', { name: "Maya's vaccines" });
  const overview = tabs.getByRole('tab', { name: 'Overview' });
  const schedule = tabs.getByRole('tab', { name: 'Schedule' });
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('tabpanel', { name: 'Overview' });
  for (const name of ['Due now', 'Coming next', 'This season']) {
    await expect(panel.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await expect(panel.getByRole('region', { name: 'Vaccine summary' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Schedule' })).toHaveCount(0);

  await overview.focus();
  await page.keyboard.press('ArrowRight');
  await expect(schedule).toBeFocused();
  await expect(schedule).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\?tab=schedule$/);
  await expect(page.getByRole('tabpanel', { name: 'Schedule' }).getByRole('link', { name: /RV · Dose 3 Due now/ })).toBeVisible(); // Timeline by default

  await pickChild(page, 'Leo');
  await expect(page.getByRole('heading', { level: 1, name: 'Leo' })).toBeVisible();
  await expect(page).toHaveURL(/\?tab=schedule$/);
  await expect(page.getByRole('tablist', { name: "Leo's vaccines" }).getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
});

test('schedule: past the age limit, the chip says why (Sofía, rotavirus)', async ({ page }) => {
  await logIn(page);
  await card(page, 'Sofía').click();
  await showSchedule(page);
  const panel = page.getByRole('tabpanel', { name: 'Schedule' });
  const rv = panel.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Rotavirus', exact: true }) });
  await expect(rv.getByRole('link', { name: 'Rotavirus Dose 1 Sofía is past the age limit for starting this vaccine' })).toBeVisible();
  // No separate notice under the vaccine name.
  await expect(rv.getByTestId('age-limit')).toHaveCount(0);
});

test('schedule List view is alphabetical by vaccine name', async ({ page }) => {
  await logIn(page);
  await card(page, 'Maya').click();
  await showSchedule(page);
  const names = async () =>
    page
      .getByRole('tabpanel', { name: /^(Schedule|Calendario)$/ })
      .locator('a[href^="/vaccines/"]')
      .allTextContents();
  const en = await names();
  expect(en[0]).toBe('Chickenpox (varicella)');
  expect(en).toEqual([...en].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
});
