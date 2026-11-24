// The API client against the MSW mock: contract, seeding, auth and 409s (SPEC.md §5a, §5b).
import { describe, expect, it } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { addAge, addDays, todayISO } from '@/lib/dates';

async function signIn(key = 'demo-family') {
  await api.session.login(key);
}

describe('mock API', () => {
  it('rejects calls without a session', async () => {
    await expect(api.account.get()).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
  });

  it('seeds demo-family with the four scenario children, DOBs relative to today', async () => {
    await signIn();
    const kids = await api.children.list();
    expect(kids.map((k) => k.name)).toEqual(['Maya', 'Leo', 'Ava', 'Sofía']);
    const maya = kids[0];
    // ageToday: 6 months + 5 days
    expect(maya.dateOfBirth).toBe(addDays(addAge(todayISO(), { value: 6, unit: 'months' }, -1), -5));
    expect(maya.nextAppointment).toBe(addDays(todayISO(), 9));
  });

  it("returns a child's record and links Sofía's not-sure question to her MMR dose", async () => {
    await signIn();
    const sofia = (await api.children.list()).find((c) => c.name.startsWith('Sofía'))!;
    const record = await api.children.record(sofia.id);
    expect(record.customVaccines.map((c) => c.nameAsWritten)).toContain('BCG');
    const mmr2 = record.doses.find((d) => d.vaccineId === 'mmr' && d.doseNumber === 2)!;
    expect(mmr2.status).toBe('notSure');
    const qs = await api.questions.list(sofia.id);
    expect(qs.find((q) => q.origin === 'notSure')?.doseRecordId).toBe(mmr2.id);
  });

  it('gives Leo no history', async () => {
    await signIn();
    const leo = (await api.children.list()).find((c) => c.name.startsWith('Leo'))!;
    expect((await api.children.record(leo.id)).doses).toEqual([]);
  });

  it("hides another account's child (404)", async () => {
    await signIn('demo-family');
    const mayaId = (await api.children.list())[0].id;
    await signIn('spanish-family');
    await expect(api.children.get(mayaId)).rejects.toMatchObject({ kind: 'notFound' });
  });

  it('rejects stale writes with 409', async () => {
    await signIn();
    const [maya] = await api.children.list();
    const saved = await api.children.patch(maya.id, { priorReactions: 'None', updatedAt: maya.updatedAt });
    expect(saved.priorReactions).toBe('None');
    const stale = api.children.patch(maya.id, { priorReactions: 'Other', updatedAt: maya.updatedAt });
    await expect(stale).rejects.toBeInstanceOf(ApiError);
    await expect(stale).rejects.toMatchObject({ kind: 'conflict', status: 409 });
  });

  it('offers My Account children for a new family', async () => {
    await signIn('new-family');
    const account = await api.account.get();
    expect(account.onboardingComplete).toBe(false);
    expect(account.agreementVersionAccepted).toBeUndefined();
    expect(await api.children.list()).toEqual([]);
    const profile = await api.account.myAccountChildren();
    expect(profile.map((c) => c.name)).toEqual(['Maya', 'Ava', 'Sofía']);
  });

  it('seeds one-child with just Maya, fully set up', async () => {
    await signIn('one-child');
    const account = await api.account.get();
    expect(account.onboardingComplete).toBe(true);
    const kids = await api.children.list();
    expect(kids.map((k) => k.name)).toEqual(['Maya']);
    expect((await api.children.record(kids[0].id)).doses.length).toBeGreaterThan(0);
  });

  it('scans return the OCR fixture with every flag type', async () => {
    await signIn();
    const sofia = (await api.children.list()).find((c) => c.name.startsWith('Sofía'))!;
    const scan = await api.scans.upload(sofia.id, [new Blob(['x'], { type: 'image/jpeg' })]);
    const flags = new Set(scan.extracted.flatMap((e) => e.flags));
    expect([...flags].sort()).toEqual(['ambiguousDate', 'beforeBirth', 'duplicate', 'intervalTooShort', 'unrecognized']);
    expect(scan.extracted.filter((e) => e.dateAmbiguous).every((e) => e.parsedDate === undefined)).toBe(true);
  });

  it('logs out', async () => {
    await signIn();
    await api.session.logout();
    await expect(api.account.get()).rejects.toMatchObject({ kind: 'unauthorized' });
  });
});
