'use client';
// A dose's state as a chip: icon + text + border pattern, never color alone (SPEC.md §9).
import type { ComponentType, SVGProps } from 'react';
import { AlertIcon, CalendarIcon, CheckIcon, ClockIcon, DashIcon, PauseIcon, QuestionIcon, ShieldIcon, XIcon } from '@/components/shell/icons';
import type { DoseStateKind, SeasonalStateKind } from '@/lib/schedule';
import s from './schedule.module.css';

type Kind = DoseStateKind | SeasonalStateKind;

const icons: Record<Kind, ComponentType<SVGProps<SVGSVGElement>>> = {
  received: CheckIcon,
  dueNow: ClockIcon,
  upcoming: CalendarIcon,
  overdue: AlertIcon,
  notEntered: DashIcon,
  needsInfo: QuestionIcon,
  postponed: PauseIcon,
  exempt: ShieldIcon,
  notGiven: XIcon,
  declined: XIcon,
  noLongerRecommended: DashIcon,
  dueThisSeason: ClockIcon,
  receivedThisSeason: CheckIcon,
  outOfSeason: CalendarIcon,
  notYetEligible: CalendarIcon,
  askPediatrician: QuestionIcon,
};

export function DoseChip({ state, label }: { state: Kind; label: string }) {
  const Icon = icons[state];
  return (
    <span className={`${s.chip} ${s[`chip_${state}`] ?? ''}`} data-state={state}>
      <Icon />
      {label}
    </span>
  );
}
