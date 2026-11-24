# AAP Immunization Tool: Build Spec

Version 1.1 · Nov 23, 2026 · Source: AAP Immunization Tool Design Brief (Oct 29, 2026) and IA v1.1

## 1. What we're building

A mobile-first web app for parents and caregivers. For every child it answers four questions: what has been given, what is due, why it matters, and what to do next.

It should feel like a calm, accurate guide, not a medical record system. It must work well on a phone and be fully available in English and Spanish.

### In v1

- Login (AAP My Account, mocked), agreement, onboarding for one or more children
- Home overview of all children
- Child page with status, schedule (timeline and list), catch-up path, and history prompts
- Add to Record: search vaccines, scan a photo of a record, add a custom (non-US) vaccine
- Per-dose editing with statuses: Received, Not sure, Postponed, Not given, Non-medical exemption
- Visit Prep: questions and notes for the pediatrician
- Vaccine index, vaccine detail pages and guides, linking to HealthyChildren.org and AAP fact sheets
- Settings: language, children, reminder preferences (text/email opt-in)
- Print/download of schedule and record (personal copy, not official)

### Out of v1 (do not build)

- School-required vaccine flags. Use the "Why vaccines matter for school and childcare" guide instead.
- Combo product mapping (entering a product name and auto-splitting it). Caregivers log each component vaccine.
- Multi-child combined view
- Location-targeted outbreak guidance
- Real integrations with My Account, the HealthyChildren.org account API, SMS/email providers, OCR, or state registries (mock them behind interfaces shaped like the real services)

## 2. Tech stack (default, change if the team decides otherwise)

- Next.js (App Router) + TypeScript, strict mode
- Tailwind CSS with design tokens in one theme file
- Data lives on the caregiver's HealthyChildren.org account, not in the browser (see §5a). The app reads and writes through a typed API client; the prototype runs against a mock API with the same contract.
- TanStack Query for server state (fetching, caching in memory, optimistic updates)
- i18n: next-intl (or equivalent) with `en` and `es` message files
- Zod for validation schemas shared by forms, the API client and the mock API
- Vitest for unit tests, Playwright for end-to-end tests, MSW (Mock Service Worker) for the mock API in dev and tests
- Installable as a PWA (manifest + app shell). No child data is kept offline.

## 3. Information architecture

### Bottom tab bar

Home · Visit Prep · Vaccines · Settings

- Shown on every logged-in screen except full-screen forms (1c, 3, 4, 4a–4d).
- Hidden on forms so a tab tap can't drop unsaved edits.

### Child selector

- Sits at the top of every logged-in screen except 0, 1a, 1b and 1 Home.
- Shows the child's name, age and status.
- Switching children reloads the current screen for the new child. It does not navigate.
- On forms it is locked (read-only) and replaced by the editing banner.

### Editing banner

- "Editing for Maya, 6 months", pinned at the top of 1c, 3, 4 and 4a–4d.

### Screens and routes

| # | Screen | Route | Type | Tab |
|---|---|---|---|---|
| 0 | Log In Prompt | `/login` | Page | none |
| 1a | Agreement | `/onboarding/agreement` | Page | none |
| 1b | Add Children | `/onboarding/children` (also `/children/add`) | Page | none |
| 1c | Child Setup | `/onboarding/setup/[childId]` (also `/children/add/setup/[childId]`) | Form | none |
| 1 | Home | `/` | Page | Home |
| 2 | Single Child Page | `/child/[childId]` | Page | Home |
| 3 | Edit Child | `/child/[childId]/edit` | Form | Home |
| 4a | Add to Record | `/child/[childId]/add` | Form | Home |
| 4b | Scan a Record | `/child/[childId]/add/scan` | Form | Home |
| 4c | Review Scan | `/child/[childId]/add/scan/review` | Form | Home |
| 4d | Custom Vaccine | `/child/[childId]/add/custom` (and `/custom/[entryId]` to edit) | Form | Home |
| 4 | Dose Edit | `/child/[childId]/dose/[vaccineId]/[doseNumber]` | Form | Home |
| 5 | Visit Prep | `/visit-prep?child=[childId]` | Page | Visit Prep |
| 6 | Vaccines Index | `/vaccines` | Page | Vaccines |
| 6a | Vaccine Detail | `/vaccines/[vaccineId]` | Page | Vaccines |
| 7 | Vaccine Guide | `/vaccines/guides/[slug]` | Page | Vaccines |
| 8 | Settings & Reminders | `/settings` | Page | Settings |

### Route guards

- **Not logged in:** redirect to `/login?next=<original>`. After login, return to `next`. Reminder deep links rely on this.
- **Logged in, agreement not accepted (or terms version changed):** redirect to `/onboarding/agreement`.
- **Logged in, onboarding incomplete:** redirect to the first child whose setup is unfinished (see §6.4).
- **Child not on this account:** show a not-found page and offer Home.

## 4. Interlinking (contextual links beyond the tab bar)

Child context always carries across a link.

| From | To | Trigger |
|---|---|---|
| 0 Log In | 1a · 1 · 2 | First visit · returning · reminder deep link |
| 1a Agreement | 1b | Agree and continue |
| 1b Add Children | 1c | Continue (first selected child) |
| 1c Child Setup | 1c · 1 | Next child · Finish on the last child (or return to the origin when adding later) |
| 1 Home | 2 | Tap a child card |
| 1 Home | 4a | Add to record (choose child first) |
| 1 Home | 1b | Add a child |
| 1 Home | 7 (schedule changes) | Alert banner |
| 1 Home | 5 | Open-questions count |
| 2 Child | 4 | Tap any dose, customize timing |
| 2 Child | 4a | Add to record, "Add past vaccines" card |
| 2 Child | 3 | "Complete profile" card |
| 2 Child | 6a | Tap a vaccine name or "why" |
| 2 Child | 5 | Questions preview, Add a question |
| 2 Child | 7 catch-up | Catch-up path |
| 2 Child | 7 school | School and childcare card (ages 4–6) |
| 4a Add | 4 · 4b · 4d | Pick vaccine and dose · Scan a record · Can't find it / no match |
| 4b Scan | 4c | Photo taken or uploaded |
| 4c Review | 4d · 2 | Unrecognized vaccine · Save confirmed doses |
| 4d Custom | 5 | Save (auto-adds a question for the doctor) |
| 4 Dose | 5 · 4b · 7 combos | Not sure / note (auto-adds) · scan shortcut · helper text |
| 5 Visit Prep | 4 · 6a | Tap a "not sure" dose · tap a question's vaccine tag |
| 6 Index | 6a · 7 | Tap a vaccine or guide |
| 6a Detail | 4 · 4a · 5 · external | Tap a child's dose · Add to record (prefiltered) · Add a question · HealthyChildren.org / AAP fact sheet |
| 7 Guides | 4b · 4d · external | Finding old records · Vaccines given outside the US · HealthyChildren.org / state registries |
| 8 Settings | 3 · 1b · My Account | Children list · Add a child · external |
| Reminder (SMS/email) | 2 | Deep link to `/child/[childId]` |

## 5. Data model

TypeScript types. These are the shapes the HealthyChildren.org account API returns and accepts (§5a). IDs are UUIDs issued by the server, and every record carries `createdAt` and `updatedAt`.

```ts
type Locale = 'en' | 'es';

interface Account {
  id: string;
  myAccountId: string;            // from AAP My Account (mock)
  locale: Locale;                 // required
  agreementVersionAccepted?: string;
  agreementAcceptedAt?: string;
  onboardingComplete: boolean;
}

interface Child {
  id: string;
  accountId: string;
  source: 'myAccount' | 'manual';
  myAccountChildId?: string;
  name: string;                   // required
  dateOfBirth: string;            // ISO date, required
  setupComplete: boolean;         // false until confirmed in 1c
  setupOrder: number;             // order in the onboarding cycle
  medicalConditions?: string;     // optional, free text in v1
  pediatrician?: { name?: string; phone?: string; practice?: string };
  recordsFromAbroad?: boolean;
  priorReactions?: string;
  nextAppointment?: string;       // ISO date, caregiver-entered
}

type DoseStatus = 'received' | 'notSure' | 'postponed' | 'notGiven' | 'exemption';

interface DoseRecord {
  id: string;
  childId: string;
  vaccineId: string;              // from the catalog
  doseNumber: number;
  status: DoseStatus;
  dateGiven?: string;             // required when status = received
  postponedUntil?: string;        // target date when status = postponed
  customTargetDate?: string;      // parent-set timing for an upcoming dose
  reactionNotes?: string;
  source: 'manual' | 'scan';
  scanId?: string;
}

interface CustomVaccineEntry {
  id: string;
  childId: string;
  nameAsWritten: string;          // required
  country?: string;
  dateGiven: { year: number; month: number; day?: number }; // stored as parts, never a typed MM/DD string
  doseNotes?: string;             // fractional dose, brand, etc.
  pediatricianConfirmed: boolean; // default false
  source: 'manual' | 'scan';
  scanId?: string;
}

interface Exemption {               // brief: recorded per vaccine
  id: string;
  childId: string;
  vaccineId: string;
  fromDoseNumber: number;         // applies to this dose and the rest of the series
  note?: string;
}

interface Question {
  id: string;
  childId: string;
  text: string;
  vaccineId?: string;
  doseRecordId?: string;
  customVaccineId?: string;
  origin: 'manual' | 'notSure' | 'doseNote' | 'customVaccine' | 'vaccineDetail';
  resolved: boolean;
}

interface ReminderPrefs {
  accountId: string;
  sms: { enabled: boolean; phone?: string };
  email: { enabled: boolean; address?: string };
  leadTimeDays: number;           // e.g. 14 before a dose window opens
  perChild: Record<string, boolean>;
}

interface ScanSession {
  id: string;
  childId: string;
  images: string[];               // blob keys; caregiver can delete
  extracted: ExtractedDose[];
  status: 'pending' | 'reviewed' | 'discarded';
}

interface ExtractedDose {
  rawName: string;
  rawDate: string;
  matchedVaccineId?: string;
  parsedDate?: string;
  dateAmbiguous: boolean;         // e.g. 03/04
  confidence: number;             // 0–1
  flags: Array<'unrecognized' | 'ambiguousDate' | 'beforeBirth' | 'intervalTooShort' | 'duplicate'>;
  decision?: 'confirm' | 'remove' | 'custom';
}
```

## 5a. Data storage and API

All caregiver and child data is stored on the caregiver's HealthyChildren.org account, so it follows them across devices and browsers.

- **No child data in browser storage.** Don't put child records, dose records, questions or scan images in localStorage, sessionStorage, IndexedDB or cookies. Only the in-memory query cache may hold them, and it's cleared on log out.
- **Session:** the user signs in with AAP My Account, and the session is an HTTP-only cookie set by the server. The client never handles tokens directly.
- **API client:** `lib/api/` wraps every call, validates responses with Zod and returns typed results. Components never call `fetch` directly.
- **Mock API:** `mocks/` implements the same endpoints with MSW, backed by an in-memory store seeded from `data/fixtures/accounts.json` (see §5b). It must survive a page reload in dev (MSW handlers can persist to a dev-only file or the dev server). This is the one exception to the browser-storage rule, and it's mock-only.
- **Writes:** save on explicit actions (Save, Next child, Confirm). Use optimistic updates only for low-risk toggles (resolve a question, reminder switches). Show a clear error and keep the form values if a save fails.
- **Concurrency:** every record has an `updatedAt`. Writes send it back, and the API rejects stale writes with 409 (another device changed it). The UI reloads the record and tells the caregiver.

### Endpoints (contract for the mock and the real service)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/account` | Account, locale, agreement status, onboarding status |
| PATCH | `/api/account` | Locale, agreement acceptance, onboardingComplete |
| GET | `/api/account/my-account-children` | Children on the AAP My Account profile (for 1b) |
| GET | `/api/children` | Tracked children |
| POST | `/api/children` | Create children (batch, from 1b) |
| GET / PATCH / DELETE | `/api/children/:childId` | Read, update (1c, 3), remove |
| GET | `/api/children/:childId/record` | Doses, custom vaccines, exemptions for one child |
| POST / PATCH / DELETE | `/api/children/:childId/doses[/:doseId]` | Dose records |
| POST / PATCH / DELETE | `/api/children/:childId/custom-vaccines[/:id]` | Custom vaccine entries |
| POST / DELETE | `/api/children/:childId/exemptions[/:id]` | Exemptions |
| GET / POST / PATCH | `/api/children/:childId/questions[/:id]` | Visit Prep questions |
| POST | `/api/children/:childId/scans` | Upload images (multipart), start extraction |
| GET | `/api/children/:childId/scans/:scanId` | Extraction status and results |
| POST | `/api/children/:childId/scans/:scanId/commit` | Save confirmed doses from review |
| DELETE | `/api/children/:childId/scans/:scanId` | Discard a scan and its images |
| GET / PUT | `/api/reminders` | Reminder preferences |

The schedule engine still runs on the client against the downloaded record and the schedule data, so status updates instantly. The server stores records, not computed statuses.

## 5b. Sample children (fixtures)

`data/fixtures/accounts.json` seeds the mock API. Ages are relative (`ageToday`, `ageGiven`), so the fixtures never go stale. When seeding, compute each date of birth from today's date, and each dose date from the date of birth.

**Accounts**

| Key | Use |
|---|---|
| `demo-family` | Default dev login. Set up, with the 4 children below and SMS reminders on |
| `new-family` | First visit. My Account has Maya, Ava and Sofía to import; Leo can be added by hand. Tests onboarding and resume |
| `spanish-family` | The same 4 children with the locale set to Spanish |
| `one-child` | Set up with one child (Maya). Tests the single-child layout: the child selector has nothing to switch to, and Add to record skips picking a child. (Home's no-children empty state is reached by removing the child.) |

**Children (one per key scenario)**

| Child | Age | Shows |
|---|---|---|
| Maya | 6 months | On schedule. 6-month doses and HepB dose 3 are Due now, and nothing is overdue. Has an upcoming appointment and a question |
| Leo | 5 years | Added by hand with no history. Earlier doses read "Not entered", 4–6 year doses are Due now, and the School and childcare card shows, along with the Add past vaccines and Complete profile cards |
| Ava | 20 months | Behind. The Hib and PCV boosters and DTaP dose 4 are past their ranges, so Overdue with a catch-up path. HepA dose 2 is still in range, so Due now, not overdue. Has a prior reaction noted |
| Sofía | 12 years | Records from Mexico. BCG is listed as a custom vaccine. MMR dose 2 is Not sure, with an auto-added question. Tdap, MenACWY and HPV dose 2 are Due now. She has no rotavirus doses, which shows "No longer recommended at this age" |

`data/fixtures/scan-extraction.json` is the mock OCR result for a scan of Sofía's card. It includes one of each review flag (ambiguous date, unrecognized name, before birth, duplicate, too soon after the previous dose).

The expected statuses above double as end-to-end test assertions. If the schedule data changes, update the fixtures so each child still shows its scenario.

### Vaccine catalog and schedule (data files, not code)

Two seed files ship with this spec. Both are built from the **AAP Recommended Child and Adolescent Immunization Schedule, United States, 2026** (updated Sept 2, 2026): Table 1 for routine ages, Table 2 for catch-up minimum ages and intervals, and the Notes. Use them as-is for the prototype.

- `data/schedule/aap-2026.json`: the schedule the engine reads.
  - `series[]`: routine dose series for HepB, rotavirus, DTaP, Hib, PCV, IPV, MMR, varicella, HepA, Tdap, HPV and MenACWY. Each dose has:
    - `window.start` / `window.end`: the recommended age range, matching the Table 1 columns
    - `overdueFrom`: the first age at which the dose counts as overdue
    - `minimumAge`, `minimumIntervalFromPrevious`, `maximumAge` and a `note`
  - Each series has `catchUpThrough`: the last age with a catch-up bar in Table 1. After that the dose is no longer recommended and is not shown as overdue.
  - `annual[]`: influenza and COVID-19. These are seasonal and never overdue.
  - `conditional[]`: RSV antibody, MenB, dengue, mpox. These show "Talk with your pediatrician", never a due or overdue status.
  - Ages are `{ value, unit }` with units `days`, `weeks`, `months` or `years`, added to the DOB by calendar math.
  - Doses timed from the previous dose (HPV dose 2) use `windowRelativeToPrevious` and `overdueRelativeToPrevious`.
  - `rules` explains each convention in plain text.
- `data/vaccines/catalog.json`: 16 vaccines, each with:
  - EN/ES names, abbreviation and search aliases in both languages, product names
  - plain-language copy: what it protects against, dose summary, common side effects, reasons to postpone, what it's given with
  - links (AAP fact sheets URL; HealthyChildren.org links left `null` for AAP to fill in)
  - Every copy field has English and Spanish text. The UI shows one language at a time, chosen in Settings (and on the login and agreement screens before an account exists). There are no translation markers or mixed-language fallbacks in the UI.
- **All seed data is `"sample": true`.** The timing comes from the AAP 2026 schedule, but the overdue thresholds and plain-language copy were written for prototyping and need AAP clinical and editorial review. Show a dev-only "Sample schedule data" banner while any sample entry is loaded, and never present the prototype as medical guidance.
- Validate both files with Zod at build time and fail the build on schema errors.

## 6. Screen specs

For each screen: what it shows, the actions available, and its states. All copy goes in i18n files.

### 6.0 Log In Prompt (0)

- **Shows:** one or two lines on what the tool does, a language toggle (EN/ES), Log in with AAP My Account, and Create account.
- **Mock:** a fake My Account login that returns a test account with 0–3 children. Provide fixtures for each case.
- **Next:**
  - First visit → 1a.
  - Returning → `next` param, or 1.

### 6.1a Agreement

- **Shows:** a single agreement covering:
  - terms of use and privacy
  - how child data and scanned record photos are stored and used
  - reminders are sent only if opted in
  - the tool supports, but doesn't replace, the pediatrician's advice
- **Version:** stored as `AGREEMENT_VERSION`.
- **Actions:**
  - Required checkbox + "Agree and continue" (disabled until checked).
  - Links to the full terms and privacy policy.
  - Language toggle.
  - Decline → back to 0, logged out.
- **Behavior:** shown once. Shown again when `AGREEMENT_VERSION` changes.

### 6.1b Add Children

- **Shows:**
  - "From your account": children from My Account, each with name, DOB and a checkbox. None are pre-checked; the caregiver confirms each.
  - "Add a child not on your account": adds a blank manual entry to the list.
  - A count of children selected.
- **Actions:** select/deselect, add manual, remove manual, Continue (needs at least one child).
- **On Continue:** create a `Child` for each selected or added entry with `setupComplete: false` and `setupOrder` in list order, then go to 1c for the first one.
- **Reuse:** the same screen opens from Home and Settings ("Add a child"). There, already-tracked children are hidden or shown as "Already added", and Finish in 1c returns to where the caregiver started.

### 6.1c Child Setup (cycled)

- **Shows:** the editing banner, progress ("Child 2 of 3"), and a two-field form.
- **Fields:** name, date of birth. Both required, pre-filled for My Account children and blank for manual.
- **Validation:** name not empty; DOB a valid date, not in the future, not more than 21 years ago (warn, don't block).
- **Actions:**
  - Next child: saves this child (`setupComplete: true`) and opens the next unfinished child.
  - Back: previous child, values kept.
  - Finish on the last child: sets `onboardingComplete: true` and goes to 1.
- **Resume:** each profile saves on Next. If the caregiver leaves, the next login resumes at the first child with `setupComplete: false` (lowest `setupOrder`).
- **Not asked:** history, conditions, pediatrician, reactions.

### 6.1 Home

No child selector.

- **Shows:**
  - One card per child: name, age, a status pill (On track · Due soon · Overdue · Needs info), the next vaccines with their age window, and a "needs info" count.
  - An alert banner for schedule updates or seasonal vaccines.
  - The open-questions count.
- **Actions:** open a child, Add to record (pick a child first if there are several), Add a child.
- **Empty state:** if there are no children, prompt to add one (→ 1b).

### 6.2 Single Child Page

- **Shows:**
  - Status summary (counts of given, due, overdue, needs info).
  - Right after setup (no dose records yet), two cards:
    - "Add past vaccines" → 4a. Earlier doses show "Not entered", never "Overdue".
    - "Complete profile" → 3. Dismissible, and it reappears in Settings › Children.
  - Due now / Coming next: vaccine, dose number, age window, a one-line "why", and a note when doses are commonly given at the same visit.
  - Schedule with a Timeline / List toggle. One row per vaccine, showing each dose's state.
  - Other vaccines: custom entries, listed apart from the AAP schedule until marked pediatrician-confirmed.
  - Catch-up path when behind, starting from the missed dose (→ catch-up guide).
  - School and childcare card for ages 4–6 → school guide. It never lists "required" vaccines.
  - Prior reactions and conditions.
  - Pediatrician contact: the number shown as selectable text, plus a call link.
  - Open questions: up to 3, with a link to 5.
- **Actions:** Add to record, tap a dose (→ 4), Customize timing (→ 4), Print/download, Add a question.
- **Export:** a printable view and a PDF download of the schedule and record, labeled "Personal record, not an official immunization record", with a pointer to the pediatrician or state registry for an official copy.

### 6.3 Edit Child

- **Fields:** name*, DOB*, medical conditions, pediatrician (name, phone, practice; pre-filled from My Account when available), records from abroad (yes/no), prior reactions.
- **Validation:** DOB not in the future. If changing the DOB puts recorded doses before birth or outside their valid intervals, warn and list the affected doses before saving.
- **Actions:** Save, Cancel, Remove child (in-page confirmation step, no browser dialog).

### 6.4a Add to Record

- **Shows:**
  - A search field over the catalog (names, abbreviations and aliases in both languages; tolerant of typos).
  - Quick picks: due next and recently logged.
  - Below the results, "Scan a record" and "Can't find it? Add a custom vaccine". The custom option is also shown when a search has no matches.
- **Actions:**
  - Pick a vaccine, then the dose number (default: the next unrecorded dose) → 4.
  - Scan → 4b.
  - Custom → 4d (search text carried over as `nameAsWritten`).
- **Entry from 6a:** opens prefiltered to that vaccine.

### 6.4b Scan a Record

- **Shows:** photo tips (flat, good light, whole page), what works (US shot cards, records from other countries, registry printouts), and a privacy note.
- **Actions:**
  - Take photo: `<input type="file" accept="image/*" capture="environment">`, with upload from files as the fallback.
  - Add another page; remove a page.
  - Continue → 4c.
- **OCR:** goes through an `OcrService` interface. The mock returns fixture extractions, including at least one of each flag type.

### 6.4c Review Scan

Nothing is saved until the caregiver acts.

- **Shows:**
  - The source image, viewable and zoomable.
  - A list of extracted doses: name, date and a confidence indicator.
  - Flags with plain-language explanations:
    - unrecognized vaccine name
    - ambiguous date ("03/04 could be March 4 or April 3. Which is it?")
    - date before birth
    - too soon after the previous dose
    - already recorded
- **Per dose:** Confirm, Edit (vaccine, dose number, date), Remove, Make custom (→ 4d prefilled).
- **Rules:**
  - Save is disabled while any kept dose still has an unresolved `ambiguousDate` or `beforeBirth` flag.
  - Duplicates default to Remove.
- **Save confirmed:** creates `DoseRecord`s with `source: 'scan'`, then returns to 2 with a summary ("8 doses added, 1 custom vaccine").

### 6.4d Custom Vaccine

- **Fields:**
  - name as written* and country
  - date given: month picker by name + day (optional) + year*, so day-first and month-first dates can't be confused
  - dose notes (fractional dose, brand)
  - note for the doctor
- **Save:** creates a `CustomVaccineEntry` and auto-adds a `Question` (origin `customVaccine`), e.g. "Confirm how [name] given in [country] fits the schedule."
- **Display:** shown under Other vaccines on 2. Does not change AAP schedule status unless `pediatricianConfirmed` is set (see open questions).

### 6.4 Dose Edit

- **Shows:** the editing banner; vaccine and dose number; status; and fields that depend on the status.
- **Statuses:**
  - **Received:** date required. Validate against DOB, minimum age and minimum interval from the previous received dose. Block impossible dates; warn on unusual but possible ones.
  - **Not sure:** show where to look (pediatrician's office, state immunization registry, local health department, past schools or childcare, baby books) and a Scan a record shortcut. Auto-add a `Question` (origin `notSure`). The dose shows as Needs info.
  - **Postponed** (illness, fever): ask for a target date, then recalculate the doses that follow.
  - **Not given.**
  - **Non-medical exemption:** record an `Exemption`, with an option to apply it to the rest of the series.
- **Also:** reaction notes; note for the doctor (creates a `Question` with origin `doseNote`); custom target date for an upcoming dose.
- **Helper text:** "If your child got one shot that covered several vaccines, log each one", with a link to the combination vaccines guide. There is no combo product picker.
- **Actions:** Save, Cancel, Delete entry.

### 6.5 Visit Prep

- **Shows:**
  - the next appointment date (caregiver-entered)
  - vaccines likely due at that date
  - open questions and notes grouped by vaccine, then general
  - doses marked not sure
  - pediatrician contact
- **Actions:** add, edit or resolve a question; set the appointment date; print/download the list.

### 6.6 Vaccines Index and 6a Vaccine Detail

- **Index:** A–Z list, search, and a Guides list. Custom vaccines are not shown here.
- **Detail:**
  - what it protects against, doses and spacing, age windows, combination forms, boosters, side effects, reasons to postpone
  - external links to HealthyChildren.org and the AAP fact sheet
  - a child module: the selected child's doses for this vaccine
  - actions: Add to record, Add a question

### 6.7 Vaccine Guides

Markdown content per locale in `content/guides/[slug].[locale].md`:

- `catch-up`: catching up on missed doses
- `combination-vaccines`: combination vaccines and shots given at the same visit (explains logging each component)
- `postponed-doses`: when a dose is postponed
- `schedule-changes`: what changed in the latest AAP schedule (the Home alert links here)
- `school-and-childcare`: why vaccines matter for school and childcare. Covers all recommended vaccines, including ones schools may not require (rotavirus, HPV, hepatitis A), and links to HealthyChildren.org.
- `finding-old-records`: links to state immunization registries and to Scan a record
- `vaccines-outside-us`: how to add a custom vaccine and what to ask the pediatrician
- `costs-and-insurance`: a short note and a link out

All guide text is placeholder until AAP provides content. Mark it with a `sample` front-matter flag.

### 6.8 Settings & Reminders

- **Account:** language (EN/ES, applies everywhere), link to My Account, log out.
- **Children:** a list with edit (→ 3), remove, and Add a child (→ 1b).
- **Reminders:**
  - SMS and email opt-in, each with its contact field and validation
  - lead time
  - per-child on/off
  - a preview of a reminder message
- **Mock delivery:** `NotificationService` logs reminders to a dev panel instead of sending them. Each reminder includes what's due, the age window, the pediatrician's number, and a deep link to `/child/[childId]`.

## 7. Schedule engine (`lib/schedule/`)

A pure function. No UI or storage imports.

```ts
computeChildSchedule(input: {
  child: Child;
  doses: DoseRecord[];
  exemptions: Exemption[];
  schedule: ScheduleData;
  today: string;
}): ChildSchedule
```

It returns, per vaccine and dose, one state:

- `received`
Use `window` and `overdueFrom` from `data/schedule/aap-2026.json`; don't recompute thresholds in code.

- `dueNow` (the window is open: from the start of the recommended age range through its last day). A dose stays `dueNow` for the whole range, however late in the range it is. It is never shown as behind, late or missed while the range is open.
- `upcoming` (the window opens in the future, with dates)
- `overdue` (only after the recommended age range has fully ended, e.g. from the day after the child turns 19 months for a "6–18 months" dose, the dose isn't received, **and** the caregiver has entered history for this vaccine or this dose's window opened after the child was added)
- `notEntered` (the window is before tracking began and there's no record; never counted as overdue)
- `needsInfo` (not sure)
- `postponed` (with a target date)
- `exempt`
- `notGiven`

Plus:

- the child's overall status: `onTrack` | `dueSoon` | `overdue` | `needsInfo` (precedence: overdue > needsInfo > dueSoon > onTrack)
- a catch-up plan: the next dates for missed doses, from the schedule's catch-up rules and minimum intervals
- the vaccines due at a given date (used by Visit Prep)

### Rules to unit-test

1. **Age ranges aren't deadlines until they end.** A dose recommended across an age range (e.g. 6–18 months) is `dueNow` on every day of that range, including the last day, and becomes `overdue` only once the range has fully passed. Test the first day, the last day and the day after for range-based doses. The child's overall status can't be `overdue` because of a dose whose range is still open. The catch-up path only includes doses whose range has ended.
2. **Missing history is not missed.** A child added at age 5 with no records shows recommendations from now on, and earlier doses are `notEntered`.
3. **Received dates:** a date before birth, before the minimum age, or closer to the previous dose than the minimum interval is rejected or flagged.
4. **Postponed** shifts the following doses based on the minimum interval from the new target.
5. **Exemptions** apply from a dose onward and exclude those doses from overdue counts.
6. **Not sure** counts toward `needsInfo`, not `overdue`.
7. **Past catch-up age:** after a series' `catchUpThrough` (or rotavirus's maximum age), missing doses show "No longer recommended at this age", never `overdue`.
8. **Seasonal and conditional** vaccines (influenza, COVID-19, RSV antibody, MenB) never make a child `overdue`.
9. **Single-age doses** (e.g. "2 months") become overdue at the `overdueFrom` in the data (1 month after the recommended age, from Table 2's "more than 1 month behind").
10. **Custom vaccines** never change AAP dose states unless confirmed (behind a feature flag until decided).
11. **Changing the DOB** recomputes everything and surfaces doses that become invalid.

## 8. Content and i18n

- Message files: `messages/en.json`, `messages/es.json`. Write both for every string; the Spanish file is a full translation, not a fallback. Vaccine copy is localized in `data/vaccines/catalog.json`, and guides in `content/guides/[slug].es.md`.
- The language setting lives on the account (Settings › Account). Switching it changes the whole app immediately, including vaccine pages, guides, dates and reminder messages.
- A test fails the build if any key is missing from either message file.
- Dates are displayed with month names (e.g. "Mar 4, 2027"), never numeric-only.
- Ages read as "6 months" or "4 years". Age windows read as "6–18 months".
- Tone: plain, calm and reassuring. Explain without alarming. Status words: "On track", "Due soon", "Overdue", "Needs info".

## 9. Accessibility and mobile

- WCAG 2.2 AA; status pills pair an icon and text with color.
- 44px minimum touch targets. Bottom tab bar respects the safe-area insets.
- Forms: labels always visible, errors inline next to the field, and focus moves to the first error on submit.
- The timeline view has an equivalent list view, and the list is the default for screen readers.
- Respect `prefers-reduced-motion`.

## 10. Privacy and safety

- Treat all child data as sensitive. No analytics on field values.
- All child data is stored on the caregiver's HealthyChildren.org account (§5a), never in browser storage.
- Scanned images: uploaded to the account, kept only until the review is saved or discarded unless the caregiver chooses to keep them. The caregiver can delete them at any time from the child's record.
- Log out clears the in-memory cache and returns to 0.
- No real network calls to third parties in the prototype.

## 11. Acceptance criteria (Playwright scenarios)

1. **First run, two children.**
   - Log in → agree → select one account child, add one manual child → Continue.
   - Setup child 1 (pre-filled) → Next → setup child 2 → Finish.
   - Home shows two cards. Each child page shows "Add past vaccines" and "Complete profile".
2. **Resume setup.**
   - Leave after child 1.
   - Log in again → lands on Child Setup for child 2, with "Child 2 of 2".
3. **Routine (Maya, 6 months).** Home card is "Due soon" with vaccines and a window → child page Due now → vaccine detail → back → mark a dose Received with a valid date → status updates.
4. **New user (Leo, 5 years, no history).** No overdue doses. Earlier doses read "Not entered". Recommendations from age 5 onward are shown.
5. **Behind (Ava, 20 months).** A dose whose age range is still open shows "Due now", not "Overdue", on the last day of the range. The day after the range ends, with history entered, Home shows "Overdue", and the child page shows a catch-up path that names the missed dose.
6. **Unsure (Sofía, MMR dose 2).** Set a dose to Not sure → guidance shown → a question appears in Visit Prep → the child shows "Needs info".
7. **Multiple children.**
   - Open child A → open a Dose Edit → the banner names child A and the selector is locked.
   - Visit Prep → switch to child B → the list changes.
8. **Scan.**
   - Add to record → Scan → upload the fixture → Review shows the flags.
   - Save is blocked until the ambiguous date is resolved → resolve → turn an unrecognized item into a custom vaccine → save.
   - The child page shows the summary, and the custom vaccine appears under Other vaccines with a question in Visit Prep.
9. **Custom vaccine.** Search "BCG" (not in the US catalog) → no match → Add custom → date entered by month name → saved under Other vaccines.
10. **School card.** A child aged 5 shows the School and childcare card linking to the guide. No "required" labels appear anywhere.
11. **Reminder deep link.** While logged out, open `/child/[id]` → login → lands on that child's page.
12. **Language.** Switch to Spanish in Settings → every screen, vaccine page and guide is fully in Spanish, with no English text or translation markers. Switch back to English the same way.

## 12. Build order

1. **Foundation:** scaffold, tokens, i18n, the API client and MSW mock API (§5a) with fixtures, mock services, app shell with the tab bar, child selector and editing banner.
2. **Auth and onboarding:** 0, 1a, 1b, 1c, route guards and resume (scenarios 1, 2, 11).
3. **Schedule engine:** data schemas, sample seed data and all unit tests in §7.
4. **Home and child page:** 1 and 2 with statuses, timeline/list, catch-up path, and the post-setup cards (scenarios 3–5).
5. **Recording:** 4a, 4 and 4d, with validation (scenarios 6, 9).
6. **Scan:** 4b and 4c with the mock OCR (scenario 8).
7. **Visit Prep, Vaccines, Guides:** 5, 6, 6a, 7 (scenarios 7, 10).
8. **Settings, reminders, export:** 8, the reminder mock, print/PDF (scenario 12).
9. **Polish:** accessibility audit, Spanish review, empty and error states for every screen.

## 13. Open questions (build behind flags or with placeholders)

- Do custom vaccines ever count toward the AAP schedule after pediatrician confirmation? (`FEATURE_CUSTOM_COUNTS`, default off)
- Should Settings show the child selector, or only the Reminders section?
- Should Visit Prep offer an "All children" option? (Default: one child at a time.)
- On the Vaccines tab, can the selector be set to "No child"? (Default: yes, which hides the child module.)
- Can appointment dates come from the pediatrician, or are they always caregiver-entered? (Default: caregiver-entered.)
- What languages and record formats must scan support at launch, and how long are photos retained?
- Is upload from the photo library enough when the camera isn't available on mobile web? (Default: yes.)
- Should state registries be one general list, or detected by the caregiver's state? (Default: general list.)
- Who writes the agreement text, and who maintains guide content and the schedule-change alert?
- Clinical review of the sample schedule data: are the overdue thresholds right? (Ranges become overdue the day after they end. Single-age doses become overdue 1 month after the recommended age.) Should Hib and rotavirus series length depend on the product the caregiver enters?
- Is the HealthyChildren.org account the same login as AAP My Account, and does an account API already exist? The endpoint list in §5a is a proposed contract until the HealthyChildren.org team confirms it.
