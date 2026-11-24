// MSW handlers for the HealthyChildren.org account API contract (SPEC.md §5a).
// The same handlers back the browser worker (dev) and the Node server (tests).
import { http, HttpResponse, type HttpHandler } from 'msw';
import { z, type ZodObject } from 'zod';
import {
  accountSchema,
  childPatchSchema,
  childSchema,
  newChildSchema,
  customVaccineEntrySchema,
  doseRecordSchema,
  exemptionSchema,
  extractedDoseSchema,
  questionSchema,
  reminderPrefsSchema,
  type Child,
  type ScanSession,
} from '@/lib/api/schemas';
import { DEFAULT_DEV_ACCOUNT, newId, nowStamp, type MockDb } from './db';
import { createMockMyAccountService, mockNotificationService, mockOcrService } from './services';

export interface MockStore {
  db: MockDb;
  /** Persist after every write so data survives a dev reload. */
  save(): void;
  reset(): void;
  /** Dev/test fault injection (paths to fail); kept across reloads by the browser worker. */
  faults?: { get(): string[]; set(paths: string[]): void };
}

// Paths start with */ so they match any origin (browser and Node).
const API = '*/api';

const reminderMessageSchema = z.object({
  accountId: z.string(),
  childId: z.string(),
  channel: z.enum(['sms', 'email']),
  to: z.string(),
  body: z.string(),
  deepLink: z.string(),
});

const error = (status: number, code: string, message?: string) =>
  HttpResponse.json({ error: code, message }, { status });

// Strip mock-only fields before data leaves the "server".
function out<T extends object>(row: T): Omit<T, 'sample' | 'key'> {
  const copy = { ...row } as Record<string, unknown>;
  delete copy.sample;
  delete copy.key;
  return copy as Omit<T, 'sample' | 'key'>;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const serverOwned = { id: true, createdAt: true, updatedAt: true, childId: true } as const;
const patchOf = <T extends ZodObject>(schema: T) =>
  schema.omit(serverOwned as never).partial().extend({ updatedAt: z.string() });

export function createHandlers(store: MockStore): HttpHandler[] {
  const db = () => store.db;

  function currentAccount() {
    const s = db().session;
    return s ? db().accounts.find((a) => a.id === s.accountId) : undefined;
  }

  type Account = NonNullable<ReturnType<typeof currentAccount>>;
  type ChildRow = MockDb['children'][number];
  type Fail = { fail: Response; account?: undefined; child?: undefined };

  /** Resolves the signed-in account (401 without a session). */
  function auth(): Fail | { fail?: undefined; account: Account };
  /** …and a child that account owns (404 otherwise). */
  function auth(childId: string): Fail | { fail?: undefined; account: Account; child: ChildRow };
  function auth(childId?: string): Fail | { fail?: undefined; account: Account; child?: ChildRow } {
    const account = currentAccount();
    if (!account) return { fail: error(401, 'unauthorized') };
    if (childId === undefined) return { account };
    const child = db().children.find((c) => c.id === childId && c.accountId === account.id);
    if (!child) return { fail: error(404, 'childNotFound') };
    return { account, child };
  }

  function applyPatch<T extends { updatedAt: string }>(row: T, patch: Partial<T> & { updatedAt: string }) {
    if (patch.updatedAt !== row.updatedAt) return error(409, 'conflict', 'This record was changed on another device.');
    Object.assign(row, patch, { updatedAt: nowStamp() });
    store.save();
    return null;
  }

  /** POST / PATCH / DELETE for a per-child collection. */
  function childCollection<K extends 'doses' | 'customVaccines' | 'exemptions' | 'questions'>(
    path: string,
    key: K,
    schema: ZodObject,
    opts: { patch: boolean; list?: boolean; defaults?: Record<string, unknown> },
  ): HttpHandler[] {
    const createSchema = schema.omit(serverOwned as never).extend(
      key === 'questions' ? { resolved: z.boolean().optional() } : {},
    );
    const handlers: HttpHandler[] = [
      http.post(`${API}/children/:childId/${path}`, async ({ params, request }) => {
        const a = auth(params.childId as string);
        if (a.fail) return a.fail;
        const parsed = createSchema.safeParse(await readJson(request));
        if (!parsed.success) return error(422, 'validation', parsed.error.message);
        const stamp = nowStamp();
        const row = { ...opts.defaults, ...parsed.data, id: newId(), childId: a.child.id, createdAt: stamp, updatedAt: stamp };
        (db()[key] as unknown[]).push(row);
        store.save();
        return HttpResponse.json(out(row), { status: 201 });
      }),
      http.delete(`${API}/children/:childId/${path}/:id`, ({ params }) => {
        const a = auth(params.childId as string);
        if (a.fail) return a.fail;
        const list = db()[key] as Array<{ id: string; childId: string }>;
        const i = list.findIndex((r) => r.id === params.id && r.childId === a.child.id);
        if (i < 0) return error(404, 'notFound');
        list.splice(i, 1);
        store.save();
        return new HttpResponse(null, { status: 204 });
      }),
    ];
    if (opts.patch) {
      const ps = patchOf(schema);
      handlers.push(
        http.patch(`${API}/children/:childId/${path}/:id`, async ({ params, request }) => {
          const a = auth(params.childId as string);
          if (a.fail) return a.fail;
          const row = (db()[key] as Array<{ id: string; childId: string; updatedAt: string }>).find(
            (r) => r.id === params.id && r.childId === a.child.id,
          );
          if (!row) return error(404, 'notFound');
          const parsed = ps.safeParse(await readJson(request));
          if (!parsed.success) return error(422, 'validation', parsed.error.message);
          return applyPatch(row, parsed.data as typeof row) ?? HttpResponse.json(out(row));
        }),
      );
    }
    if (opts.list) {
      handlers.push(
        http.get(`${API}/children/:childId/${path}`, ({ params }) => {
          const a = auth(params.childId as string);
          if (a.fail) return a.fail;
          return HttpResponse.json((db()[key] as Array<{ childId: string }>).filter((r) => r.childId === a.child.id).map(out));
        }),
      );
    }
    return handlers;
  }

  const myAccount = () => createMockMyAccountService(db().myAccountProfiles);
  // Dev/test fault injection: GET requests whose path contains one of these
  // fail with 500, so error states can be checked. In memory only.
  let memFaults: string[] = [];
  const faults = store.faults ?? { get: () => memFaults, set: (p: string[]) => void (memFaults = p) };

  return [
    http.get(`${API}/*`, ({ request }) => {
      const path = new URL(request.url).pathname;
      if (!path.includes('/__dev/') && faults.get().some((f) => path.includes(f))) return error(500, 'server', 'Injected failure (dev)');
      return undefined;
    }),
    http.put(`${API}/__dev/fail`, async ({ request }) => {
      const body = z.object({ paths: z.array(z.string()) }).safeParse(await readJson(request));
      if (!body.success) return error(422, 'validation');
      faults.set(body.data.paths);
      return new HttpResponse(null, { status: 204 });
    }),
    // ---- Session (mock AAP My Account sign-in) ----
    // Signs in to the sample account chosen on the dev "Choose sample data" page,
    // or to `accountKey` when given (Create account always uses new-family).
    http.post(`${API}/session`, async ({ request }) => {
      const body = z.object({ accountKey: z.string().optional() }).safeParse((await readJson(request)) ?? {});
      const key = (body.success && body.data.accountKey) || db().devSelectedAccount || DEFAULT_DEV_ACCOUNT;
      const account = db().accounts.find((a) => a.key === key);
      if (!account) return error(401, 'unauthorized', 'Unknown mock account');
      db().session = { accountId: account.id };
      store.save();
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${API}/session`, () => {
      db().session = null;
      store.save();
      return new HttpResponse(null, { status: 204 });
    }),

    // ---- Account ----
    http.get(`${API}/account`, () => {
      const a = auth();
      return a.fail ?? HttpResponse.json(out(a.account));
    }),
    http.patch(`${API}/account`, async ({ request }) => {
      const a = auth();
      if (a.fail) return a.fail;
      const parsed = accountSchema
        .pick({ locale: true, agreementVersionAccepted: true, agreementAcceptedAt: true, onboardingComplete: true })
        .partial()
        .extend({ updatedAt: z.string() })
        .safeParse(await readJson(request));
      if (!parsed.success) return error(422, 'validation', parsed.error.message);
      return applyPatch(a.account, parsed.data) ?? HttpResponse.json(out(a.account));
    }),
    http.get(`${API}/account/my-account-children`, async () => {
      const a = auth();
      if (a.fail) return a.fail;
      return HttpResponse.json(await myAccount().getProfileChildren(a.account.myAccountId));
    }),

    // ---- Children ----
    http.get(`${API}/children`, () => {
      const a = auth();
      if (a.fail) return a.fail;
      const rows = db().children.filter((c) => c.accountId === a.account.id).sort((x, y) => x.setupOrder - y.setupOrder);
      return HttpResponse.json(rows.map(out));
    }),
    http.post(`${API}/children`, async ({ request }) => {
      const a = auth();
      if (a.fail) return a.fail;
      const parsed = z.array(newChildSchema).min(1).safeParse(await readJson(request));
      if (!parsed.success) return error(422, 'validation', parsed.error.message);
      const stamp = nowStamp();
      const created = parsed.data.map(
        (c): Child & { sample: true } => ({ ...c, sample: true, id: newId(), accountId: a.account.id, createdAt: stamp, updatedAt: stamp }),
      );
      db().children.push(...created);
      store.save();
      return HttpResponse.json(created.map(out), { status: 201 });
    }),
    http.get(`${API}/children/:childId`, ({ params }) => {
      const a = auth(params.childId as string);
      return a.fail ?? HttpResponse.json(out(a.child));
    }),
    http.patch(`${API}/children/:childId`, async ({ params, request }) => {
      const a = auth(params.childId as string);
      if (a.fail) return a.fail;
      const parsed = childPatchSchema.safeParse(await readJson(request));
      if (!parsed.success) return error(422, 'validation', parsed.error.message);
      // The merged record must still be valid (a set-up child needs name + DOB).
      const merged = childSchema.safeParse({ ...out(a.child), ...parsed.data, updatedAt: a.child.updatedAt });
      if (!merged.success) return error(422, 'validation', merged.error.issues[0]?.message);
      return applyPatch(a.child, parsed.data) ?? HttpResponse.json(out(a.child));
    }),
    http.delete(`${API}/children/:childId`, ({ params }) => {
      const a = auth(params.childId as string);
      if (a.fail) return a.fail;
      const id = a.child.id;
      const d = db();
      d.children = d.children.filter((c) => c.id !== id);
      d.doses = d.doses.filter((r) => r.childId !== id);
      d.customVaccines = d.customVaccines.filter((r) => r.childId !== id);
      d.exemptions = d.exemptions.filter((r) => r.childId !== id);
      d.questions = d.questions.filter((r) => r.childId !== id);
      d.scans = d.scans.filter((r) => r.childId !== id);
      for (const r of d.reminders) delete r.perChild[id];
      store.save();
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API}/children/:childId/record`, ({ params }) => {
      const a = auth(params.childId as string);
      if (a.fail) return a.fail;
      const mine = <T extends { childId: string }>(rows: T[]) => rows.filter((r) => r.childId === a.child.id).map(out);
      return HttpResponse.json({
        doses: mine(db().doses),
        customVaccines: mine(db().customVaccines),
        exemptions: mine(db().exemptions),
      });
    }),

    // ---- Per-child collections ----
    ...childCollection('doses', 'doses', doseRecordSchema, { patch: true }),
    ...childCollection('custom-vaccines', 'customVaccines', customVaccineEntrySchema, { patch: true }),
    ...childCollection('exemptions', 'exemptions', exemptionSchema, { patch: false }),
    ...childCollection('questions', 'questions', questionSchema, { patch: true, list: true, defaults: { resolved: false } }),

    // ---- Scans (mock OCR) ----
    http.post(`${API}/children/:childId/scans`, async ({ params, request }) => {
      const a = auth(params.childId as string);
      if (a.fail) return a.fail;
      const form = await request.formData().catch(() => null);
      const count = form?.getAll('images').length ?? 0;
      if (count === 0) return error(422, 'validation', 'At least one image is required');
      // Images are not kept by the mock; only placeholder blob keys.
      const images = Array.from({ length: count }, () => `mock-blob-${newId()}`);
      const stamp = nowStamp();
      const scan: ScanSession & { sample: true } = {
        sample: true,
        id: newId(),
        childId: a.child.id,
        images,
        extracted: await mockOcrService.extract({ childDateOfBirth: a.child.dateOfBirth ?? '', images }),
        status: 'pending',
        createdAt: stamp,
        updatedAt: stamp,
      };
      db().scans.push(scan);
      store.save();
      return HttpResponse.json(out(scan), { status: 201 });
    }),
    http.get(`${API}/children/:childId/scans/:scanId`, ({ params }) => {
      const a = auth(params.childId as string);
      if (a.fail) return a.fail;
      const scan = db().scans.find((s) => s.id === params.scanId && s.childId === a.child.id);
      return scan ? HttpResponse.json(out(scan)) : error(404, 'notFound');
    }),
    http.post(`${API}/children/:childId/scans/:scanId/commit`, async ({ params, request }) => {
      const a = auth(params.childId as string);
      if (a.fail) return a.fail;
      const scan = db().scans.find((s) => s.id === params.scanId && s.childId === a.child.id && s.status === 'pending');
      if (!scan) return error(404, 'notFound');
      const parsed = z.object({ extracted: z.array(extractedDoseSchema) }).safeParse(await readJson(request));
      if (!parsed.success) return error(422, 'validation', parsed.error.message);
      const stamp = nowStamp();
      const base = { sample: true as const, childId: a.child.id, source: 'scan' as const, scanId: scan.id, createdAt: stamp, updatedAt: stamp };
      let dosesAdded = 0;
      const customVaccines: Array<MockDb['customVaccines'][number]> = [];
      for (const e of parsed.data.extracted) {
        if (e.decision === 'confirm' && e.matchedVaccineId && e.parsedDate) {
          const recorded = db().doses.filter((d) => d.childId === a.child.id && d.vaccineId === e.matchedVaccineId);
          db().doses.push({
            ...base,
            id: newId(),
            vaccineId: e.matchedVaccineId,
            doseNumber: e.doseNumber ?? Math.max(0, ...recorded.map((d) => d.doseNumber)) + 1,
            status: 'received',
            dateGiven: e.parsedDate,
          });
          dosesAdded++;
        } else if (e.decision === 'custom' && e.parsedDate) {
          const [year, month, day] = e.parsedDate.split('-').map(Number);
          const entry = { ...base, id: newId(), nameAsWritten: e.rawName, dateGiven: { year, month, day }, pediatricianConfirmed: false };
          db().customVaccines.push(entry);
          customVaccines.push(entry);
        }
      }
      const customVaccinesAdded = customVaccines.length;
      scan.extracted = parsed.data.extracted;
      scan.status = 'reviewed';
      scan.images = []; // not kept after review (SPEC.md §10)
      scan.updatedAt = stamp;
      store.save();
      return HttpResponse.json({ dosesAdded, customVaccinesAdded, customVaccines: customVaccines.map(out) });
    }),
    http.delete(`${API}/children/:childId/scans/:scanId`, ({ params }) => {
      const a = auth(params.childId as string);
      if (a.fail) return a.fail;
      const scan = db().scans.find((s) => s.id === params.scanId && s.childId === a.child.id);
      if (!scan) return error(404, 'notFound');
      scan.status = 'discarded';
      scan.images = [];
      scan.updatedAt = nowStamp();
      store.save();
      return new HttpResponse(null, { status: 204 });
    }),

    // ---- Reminders ----
    http.get(`${API}/reminders`, () => {
      const a = auth();
      if (a.fail) return a.fail;
      let prefs = db().reminders.find((r) => r.accountId === a.account.id);
      if (!prefs) {
        prefs = { sample: true, accountId: a.account.id, sms: { enabled: false }, email: { enabled: false }, leadTimeDays: 14, perChild: {}, updatedAt: nowStamp() };
        db().reminders.push(prefs);
        store.save();
      }
      return HttpResponse.json(out(prefs));
    }),
    http.put(`${API}/reminders`, async ({ request }) => {
      const a = auth();
      if (a.fail) return a.fail;
      const parsed = reminderPrefsSchema.safeParse(await readJson(request));
      if (!parsed.success || parsed.data.accountId !== a.account.id) return error(422, 'validation');
      const prefs = db().reminders.find((r) => r.accountId === a.account.id);
      if (prefs) {
        const conflict = applyPatch(prefs, parsed.data);
        return conflict ?? HttpResponse.json(out(prefs));
      }
      const created = { ...parsed.data, sample: true as const, updatedAt: nowStamp() };
      db().reminders.push(created);
      store.save();
      return HttpResponse.json(out(created));
    }),

    // ---- Dev only: reseed the mock; choose which sample account Log in uses ----
    http.post(`${API}/__dev/reset`, () => {
      store.reset();
      return new HttpResponse(null, { status: 204 });
    }),
    // Mock NotificationService: log reminders instead of sending (SPEC.md §6.8).
    http.post(`${API}/__dev/reminders`, async ({ request }) => {
      const a = auth();
      if (a.fail) return a.fail;
      const parsed = z.array(reminderMessageSchema).safeParse(await readJson(request));
      if (!parsed.success) return error(422, 'validation', parsed.error.message);
      const mine = parsed.data.filter((m) => m.accountId === a.account.id);
      for (const m of mine) await mockNotificationService.send(m);
      const sentAt = nowStamp();
      db().sentReminders = [...mine.map((m) => ({ ...m, sentAt })), ...(db().sentReminders ?? [])].slice(0, 50);
      store.save();
      return HttpResponse.json({ sent: mine.length });
    }),
    http.get(`${API}/__dev/reminders`, () => {
      const a = auth();
      if (a.fail) return a.fail;
      return HttpResponse.json((db().sentReminders ?? []).filter((m) => m.accountId === a.account.id));
    }),
    http.get(`${API}/__dev/sample-account`, () =>
      HttpResponse.json({ accountKey: db().devSelectedAccount ?? DEFAULT_DEV_ACCOUNT }),
    ),
    http.put(`${API}/__dev/sample-account`, async ({ request }) => {
      const body = z.object({ accountKey: z.string() }).safeParse(await readJson(request));
      if (!body.success || !db().accounts.some((a) => a.key === body.data.accountKey)) return error(422, 'validation');
      db().devSelectedAccount = body.data.accountKey;
      store.save();
      return HttpResponse.json({ accountKey: body.data.accountKey });
    }),
  ];
}
