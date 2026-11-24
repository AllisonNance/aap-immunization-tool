'use client';
// The text of a reminder (SPEC.md §6.8): what's due with its age window, the
// pediatrician's number, and a deep link to the child's page.
import { useTranslations } from 'next-intl';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import type { SetUpChild } from '@/lib/api/schemas';
import type { DoseState } from '@/lib/schedule';

export function useReminderText() {
  const t = useTranslations('reminders');
  const text = useScheduleText();
  return (child: SetUpChild, doses: DoseState[], origin: string) => {
    const deepLink = `${origin}/child/${child.id}`;
    const due = doses
      .map((d) => t('doseItem', { vaccine: text.vaccineShort(d.vaccineId), n: d.doseNumber, window: text.windowLabel(d.vaccineId, d.doseNumber) }))
      .join(', ');
    const parts = [t('messageIntro', { name: child.name }), t('messageDue', { list: due })];
    const ped = child.pediatrician;
    if (ped?.phone) parts.push(ped.name ? t('messageCallName', { doctor: ped.name, phone: ped.phone }) : t('messageCall', { phone: ped.phone }));
    parts.push(t('messageLink', { link: deepLink }));
    return { body: parts.join(' '), deepLink };
  };
}
