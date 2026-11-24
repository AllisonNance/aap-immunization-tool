'use client';
// Runs the (pure) schedule engine on the client against a child's record and
// the schedule data, so status updates instantly (SPEC.md §5a). The server
// stores records, not computed statuses.
import { useMemo } from 'react';
import { useChildRecord, useChildRecords } from '@/lib/api/hooks';
import type { ChildRecord, SetUpChild } from '@/lib/api/schemas';
import { schedule } from '@/lib/data';
import { todayISO } from '@/lib/dates';
import { computeChildSchedule } from './engine';
import type { ChildSchedule } from './types';

function compute(child: SetUpChild, record: ChildRecord, today: string): ChildSchedule {
  return computeChildSchedule({
    child: { dateOfBirth: child.dateOfBirth, createdAt: child.createdAt },
    doses: record.doses,
    exemptions: record.exemptions,
    customVaccines: record.customVaccines,
    schedule,
    today,
  });
}

export function useChildSchedule(child: SetUpChild | undefined): ChildSchedule | undefined {
  const { data: record } = useChildRecord(child?.id);
  const today = todayISO();
  return useMemo(() => (child && record ? compute(child, record, today) : undefined), [child, record, today]);
}

/** Schedules for several children (Home). Entries are undefined until that child's record loads. */
export function useChildSchedules(children: SetUpChild[]): Array<ChildSchedule | undefined> {
  const results = useChildRecords(children.map((c) => c.id));
  const today = todayISO();
  return children.map((c, i) => {
    const record = results[i]?.data;
    return record ? compute(c, record, today) : undefined;
  });
}
