'use client';
// The child's schedule with a Timeline / List toggle (SPEC.md §6.2, §9).
// Timeline is the default: doses grouped by recommended age, marking where the
// child is now. List has one row per vaccine (alphabetical) with each dose's state. Every dose links to Dose Edit (screen 4).
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ChildSchedule, DoseState } from '@/lib/schedule';
import { ListIcon, TimelineIcon } from '@/components/shell/icons';
import { DoseChip } from './DoseChip';
import s from './schedule-view.module.css';
import { useScheduleText } from './useScheduleText';

type View = 'list' | 'timeline';

export function ScheduleView({ schedule, childId, childName }: { schedule: ChildSchedule; childId: string; childName: string }) {
  const t = useTranslations('child');
  // Timeline by default; List is kept in the URL (?view=list) so it survives a trip to Dose Edit.
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view: View = search.get('view') === 'list' ? 'list' : 'timeline';
  function setView(v: View) {
    const next = new URLSearchParams(search);
    if (v === 'list') next.set('view', 'list');
    else next.delete('view');
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div>
      {/* A small view switch, left-aligned, with icons so it doesn't read as another set of tabs. */}
      <div className={s.toggleRow}>
        <div className={s.toggle} role="group" aria-label={t('viewLabel')}>
          {(['timeline', 'list'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'list' ? <ListIcon /> : <TimelineIcon />}
              {v === 'list' ? t('viewList') : t('viewTimeline')}
            </button>
          ))}
        </div>
      </div>
      {view === 'list' ? <ListView schedule={schedule} childId={childId} childName={childName} /> : <TimelineView schedule={schedule} childId={childId} childName={childName} />}
    </div>
  );
}

function DoseLink({ dose, childId, childName, showVaccine }: { dose: DoseState; childId: string; childName: string; showVaccine?: boolean }) {
  const text = useScheduleText();
  const label = text.stateLabel(dose, childName);
  return (
    // Accessible name = the visible text, with the vaccine name hidden in front
    // where it isn't shown (WCAG 2.5.3): "Hepatitis B Dose 1 Given Mar 20, 2025".
    <Link href={`/child/${childId}/dose/${dose.vaccineId}/${dose.doseNumber}?back=schedule${showVaccine ? '' : '&view=list'}`} className={s.dose}>
      <span className={s.doseName}>
        {showVaccine ? `${text.vaccineShort(dose.vaccineId)} · ` : <span className="visually-hidden">{text.vaccineName(dose.vaccineId)} </span>}
        {text.doseLabel(dose.doseNumber)}
      </span>
      <DoseChip state={dose.state} label={label} />
    </Link>
  );
}

function ListView({ schedule, childId, childName }: { schedule: ChildSchedule; childId: string; childName: string }) {
  const text = useScheduleText();
  return (
    <ul className={s.rows}>
      {/* Alphabetical by the vaccine's name in the current language. */}
      {[...schedule.series]
        .sort((a, b) => text.vaccineName(a.vaccineId).localeCompare(text.vaccineName(b.vaccineId), text.locale, { sensitivity: 'base' }))
        .map((series) => (
          <li key={series.vaccineId} className={s.vaccineRow}>
            <Link href={`/vaccines/${series.vaccineId}`} className={s.vaccineName}>
              {text.vaccineName(series.vaccineId)}
            </Link>
            <ul className={s.doses}>
              {series.doses.map((d) => (
                <li key={d.doseNumber}>
                  <DoseLink dose={d} childId={childId} childName={childName} />
                </li>
              ))}
            </ul>
          </li>
        ))}
    </ul>
  );
}

function TimelineView({ schedule, childId, childName }: { schedule: ChildSchedule; childId: string; childName: string }) {
  const t = useTranslations('child');
  const text = useScheduleText();

  // Group by recommended age window, in date order; doses timed from an earlier
  // dose with no date yet go last.
  const doses = schedule.series.flatMap((x) => x.doses);
  const dated = doses.filter((d) => d.windowStart).sort((a, b) => a.windowStart!.localeCompare(b.windowStart!));
  const groups: Array<{ label: string; start: string; doses: DoseState[] }> = [];
  for (const d of dated) {
    const label = text.windowLabel(d.vaccineId, d.doseNumber);
    const g = groups.find((x) => x.label === label);
    if (g) g.doses.push(d);
    else groups.push({ label, start: d.windowStart!, doses: [d] });
  }
  const undated = doses.filter((d) => !d.windowStart);
  const nowIndex = groups.findIndex((g) => g.start > schedule.today);

  return (
    <ol className={s.timeline}>
      {groups.map((g, i) => (
        <li key={g.label} className={s.stage}>
          {i === nowIndex && (
            <p className={s.now} aria-label={t('nowLabel')}>
              {t('now')}
            </p>
          )}
          <h3 className={s.stageLabel}>{g.label}</h3>
          <ul className={s.doses}>
            {g.doses.map((d) => (
              <li key={`${d.vaccineId}-${d.doseNumber}`}>
                <DoseLink dose={d} childId={childId} childName={childName} showVaccine />
              </li>
            ))}
          </ul>
        </li>
      ))}
      {nowIndex === -1 && (
        <li className={s.stage}>
          <p className={s.now}>{t('now')}</p>
        </li>
      )}
      {undated.length > 0 && (
        <li className={s.stage}>
          <h3 className={s.stageLabel}>{t('relativeGroup')}</h3>
          <ul className={s.doses}>
            {undated.map((d) => (
              <li key={`${d.vaccineId}-${d.doseNumber}`}>
                <DoseLink dose={d} childId={childId} childName={childName} showVaccine />
              </li>
            ))}
          </ul>
        </li>
      )}
    </ol>
  );
}
