// Which doses a reminder covers (SPEC.md §6.8). Pure: the screen turns the
// result into localized text; the mock NotificationService "sends" it.
import { addDays, compareISO } from '@/lib/dates';
import type { ChildSchedule, DoseState } from '@/lib/schedule';

export const LEAD_TIMES = [7, 14, 30] as const;

/** Overdue and due-now doses, plus upcoming ones whose window opens within the lead time. */
export function reminderDoses(schedule: ChildSchedule, leadTimeDays: number): DoseState[] {
  const horizon = addDays(schedule.today, leadTimeDays);
  return schedule.series
    .flatMap((s) => s.doses)
    .filter(
      (d) =>
        d.state === 'overdue' ||
        d.state === 'dueNow' ||
        (d.state === 'upcoming' && !!d.windowStart && compareISO(d.windowStart, horizon) <= 0),
    );
}

export interface ReminderPlan {
  childId: string;
  doses: DoseState[];
  channels: Array<'sms' | 'email'>;
}

/** Reminders to send now: children with reminders on, something to say, and an opted-in channel. */
export function planReminders(args: {
  children: Array<{ id: string; schedule?: ChildSchedule }>;
  prefs: { sms: { enabled: boolean; phone?: string }; email: { enabled: boolean; address?: string }; leadTimeDays: number; perChild: Record<string, boolean> };
}): ReminderPlan[] {
  const { prefs } = args;
  const channels = [...(prefs.sms.enabled && prefs.sms.phone ? (['sms'] as const) : []), ...(prefs.email.enabled && prefs.email.address ? (['email'] as const) : [])];
  if (!channels.length) return [];
  return args.children
    .filter((c) => prefs.perChild[c.id] && c.schedule)
    .map((c) => ({ childId: c.id, doses: reminderDoses(c.schedule!, prefs.leadTimeDays), channels: [...channels] }))
    .filter((p) => p.doses.length > 0);
}
