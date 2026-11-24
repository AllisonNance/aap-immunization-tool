import { describe, expect, it } from 'vitest';
import { schedule } from '@/lib/data';
import { formatPhone, validateEmailAddress, validatePhone } from '@/lib/validation/contact';
import { computeChildSchedule } from '@/lib/schedule';
import { planReminders, reminderDoses } from '@/lib/reminders';

describe('reminder contact fields', () => {
  it('accepts US phone numbers in common forms', () => {
    for (const p of ['(312) 555-0199', '312-555-0199', '312.555.0199', '3125550199', '+1 312 555 0199']) expect(validatePhone(p)).toBeNull();
    expect(formatPhone('+1 312 555 0199')).toBe('(312) 555-0199');
  });
  it('rejects missing or malformed numbers', () => {
    expect(validatePhone('')).toBe('phoneRequired');
    expect(validatePhone('555-0199')).toBe('phoneInvalid');
    expect(validatePhone('312 555 01AB')).toBe('phoneInvalid');
  });
  it('checks email addresses', () => {
    expect(validateEmailAddress('')).toBe('emailRequired');
    expect(validateEmailAddress('parent@example')).toBe('emailInvalid');
    expect(validateEmailAddress(' parent@example.com ')).toBeNull();
  });
});

describe('what a reminder covers', () => {
  // Born Nov 1; 2-month doses open Jan 1. Today Dec 20.
  const sched = computeChildSchedule({
    child: { dateOfBirth: '2025-11-01', createdAt: '2025-11-01T00:00:00.000Z' },
    doses: [
      { id: 'a', childId: 'c', vaccineId: 'hepb', doseNumber: 1, status: 'received', dateGiven: '2025-11-01', source: 'manual', createdAt: 'x', updatedAt: 'x' } as never,
    ],
    exemptions: [],
    schedule,
    today: '2025-12-20',
  });

  it('includes due-now doses and upcoming ones inside the lead time', () => {
    const ids = (lead: number) => reminderDoses(sched, lead).map((d) => `${d.vaccineId}${d.doseNumber}`);
    expect(ids(7)).toEqual(['hepb2']);
    expect(ids(14)).toEqual(expect.arrayContaining(['hepb2', 'dtap1', 'rotavirus1']));
  });

  it('sends only for children with reminders on and an opted-in channel', () => {
    const prefs = { sms: { enabled: true, phone: '(312) 555-0199' }, email: { enabled: false }, leadTimeDays: 14, perChild: { c: true, d: false } };
    const children = [
      { id: 'c', schedule: sched },
      { id: 'd', schedule: sched },
    ];
    expect(planReminders({ children, prefs }).map((p) => [p.childId, p.channels])).toEqual([['c', ['sms']]]);
    expect(planReminders({ children, prefs: { ...prefs, sms: { enabled: false } } })).toEqual([]);
  });
});
