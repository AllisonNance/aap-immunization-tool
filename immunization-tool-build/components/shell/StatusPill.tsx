'use client';
// Overall child status (SPEC.md §7, §9): icon + text + border pattern.
import { useTranslations } from 'next-intl';
import type { ChildStatus } from '@/lib/schedule/types';
import { AlertIcon, CheckIcon, ClockIcon, QuestionIcon } from './icons';
import s from './shell.module.css';

export type { ChildStatus };

const icon = {
  onTrack: CheckIcon,
  dueSoon: ClockIcon,
  overdue: AlertIcon,
  needsInfo: QuestionIcon,
};

export function StatusPill({ status }: { status: ChildStatus }) {
  const t = useTranslations('status');
  const Icon = icon[status];
  return (
    <span className={`${s.pill} ${s[status]}`}>
      <Icon />
      {t(status)}
    </span>
  );
}
