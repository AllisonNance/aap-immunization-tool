'use client';
// Screen 2 · Single Child Page (SPEC.md §6.2). Everything is computed on the
// client from the child's record by the schedule engine. Print/download is
// part of milestone 8.
import { useGate } from '@/components/states/States';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { use, useId, useRef } from 'react';
import { DoseChip } from '@/components/schedule/DoseChip';
import { ScheduleView } from '@/components/schedule/ScheduleView';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { ChevronRightIcon, PlusIcon } from '@/components/shell/icons';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { Toast } from '@/components/ui/Toast';
import { useChildRecord } from '@/lib/api/hooks';
import type { CustomVaccineEntry, SetUpChild } from '@/lib/api/schemas';
import { ageBetween, todayISO } from '@/lib/dates';
import { formatMonthYear } from '@/lib/i18n';
import type { ChildSchedule, DoseState } from '@/lib/schedule';
import { useChildSchedule } from '@/lib/schedule/useChildSchedule';
import s from './child.module.css';

export function ChildScreen({ params }: { params: Promise<{ childId: string }> }) {
  // This route instance's own param (Next keeps earlier pages mounted, hidden).
  const { childId } = use(params);
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const sched = useChildSchedule(child);
  const recordQ = useChildRecord(child?.id);
  const gate = useGate([recordQ], !child || !sched);
  if (gate || !child || !sched) return gate; // (an unknown child shows the shell's not-found)
  return <ChildPage child={child} sched={sched} />;
}

function ChildPage({ child, sched }: { child: SetUpChild; sched: ChildSchedule }) {
  const t = useTranslations('child');
  const text = useScheduleText();
  const { data: record } = useChildRecord(child.id);

  const all = sched.series.flatMap((x) => x.doses);
  const dueNow = all.filter((d) => d.state === 'dueNow');
  const upcoming = all.filter((d) => d.state === 'upcoming' && d.windowStart).sort((a, b) => a.windowStart!.localeCompare(b.windowStart!));
  const comingNext = upcoming.filter((d) => d.windowStart === upcoming[0]?.windowStart);
  const noRecords = (record?.doses.length ?? 0) === 0;
  const years = ageBetween(child.dateOfBirth, todayISO()).years;
  const isSchoolAge = years >= 4 && years <= 6;
  const base = `/child/${child.id}`;
  const search = useSearchParams();
  const router = useRouter();
  const view: View = search.get('tab') === 'schedule' ? 'schedule' : 'overview';
  const uid = useId();
  const tabIds = { overviewTab: `${uid}-t-o`, scheduleTab: `${uid}-t-s`, overviewPanel: `${uid}-p-o`, schedulePanel: `${uid}-p-s` };


  return (
    <div className={s.page}>
      <div className={s.top}>
        <header className={s.titleRow}>
          <h1 className={s.title}>{child.name}</h1>
          <div className={s.titleActions}>
            <Link href={`${base}/add?from=${encodeURIComponent(base)}`} className="btn btn-primary">
              {t('recordVaccine')}
              <PlusIcon />
            </Link>
            <Link href={`${base}/record`} className="btn">
              {t('print')}
            </Link>
          </div>
        </header>

        <ViewTabs
          label={t('viewsLabel', { name: child.name })}
          selected={view}
          onSelect={(v) => router.replace(v === 'schedule' ? `${base}?tab=schedule` : base, { scroll: false })}
          ids={tabIds}
        />
      </div>

      <ScanSummary base={base} />

      {view === 'overview' ? (
        <div role="tabpanel" id={tabIds.overviewPanel} aria-labelledby={tabIds.overviewTab} className={s.panel}>
          {/* Status summary */}
          <section aria-label={t('summaryLabel')}>
            <dl className={s.summary}>
              {(
                [
                  ['due', t('due')],
                  ['overdue', t('overdue')],
                  ['needsInfo', t('needsInfo')],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className={`${s.stat} ${key === 'overdue' && sched.counts.overdue ? s.statAlert : ''}`}>
                  <dt>{label}</dt>
                  <dd>{sched.counts[key]}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Prompt cards: Add past vaccines (no dose records yet) and School and childcare (ages 4–6). */}
          {(noRecords || isSchoolAge) && (
            <div className={s.cards}>
              {noRecords && (
                <Link href={`${base}/add?from=${encodeURIComponent(base)}`} className={s.promptCard}>
                  <span className={s.promptTitle}>{t('addPastTitle')}</span>
                  <span className={s.promptBody}>{t('addPastBody')}</span>
                  <ChevronRightIcon className={s.promptChevron} />
                </Link>
              )}
              {/* Never lists "required" vaccines. */}
              {isSchoolAge && (
                <Link href="/vaccines/guides/school-and-childcare" className={s.promptCard}>
                  <span className={s.promptTitle}>{t('schoolTitle')}</span>
                  <span className={s.promptBody}>{t('schoolBody', { name: child.name })}</span>
                  <ChevronRightIcon className={s.promptChevron} />
                </Link>
              )}
            </div>
          )}

          {/* Catch-up path: only doses whose range has ended, from the first missed. */}
          {sched.catchUp.length > 0 && (
            <section className={s.section} aria-labelledby={`${child.id}-catchup`}>
              <h2 id={`${child.id}-catchup`}>{t('catchUpTitle')}</h2>
              <p className={s.muted}>{t('catchUpIntro', { name: child.name })}</p>
              <ol className={s.catchUp}>
                {sched.catchUp.map((c) => (
                  <li key={`${c.vaccineId}-${c.doseNumber}`}>
                    {/* To the vaccine's page, like Due now (Add Record + is there). */}
                    <Link href={`/vaccines/${c.vaccineId}`} className={s.row}>
                      <span className={s.rowMain}>
                        <span className={s.rowTitle}>
                          {text.vaccineName(c.vaccineId)} · {text.doseLabel(c.doseNumber)}
                        </span>
                        <span className={s.rowSub}>
                          {c.earliestDate <= sched.today
                            ? t('canGiveNow')
                            : t('canGiveFrom', {
                                date: text.monthYear(c.earliestDate),
                              })}
                        </span>
                      </span>
                      <DoseChip state="overdue" label={text.stateLabel({ state: 'overdue' } as DoseState)} />
                    </Link>
                  </li>
                ))}
              </ol>
              <Link href="/vaccines/guides/catch-up" className={s.textLink}>
                {t('catchUpGuide')}
              </Link>
            </section>
          )}

          {/* Due now */}
          <section className={s.section} aria-labelledby={`${child.id}-due`}>
            <h2 id={`${child.id}-due`}>{t('dueNowTitle')}</h2>
            {dueNow.length ? <DoseList doses={dueNow} base={base} childName={child.name} /> : <p className={s.muted}>{t('nothingDue')}</p>}
          </section>

          {/* Coming next */}
          {comingNext.length > 0 && (
            <section className={s.section} aria-labelledby={`${child.id}-next`}>
              <h2 id={`${child.id}-next`}>{t('comingNextTitle')}</h2>
              <DoseList doses={comingNext} base={base} childName={child.name} />
            </section>
          )}

          {/* Seasonal and conditional vaccines: never due/overdue. */}
          {sched.seasonal.length > 0 && (
            <section className={s.section} aria-labelledby={`${child.id}-season`}>
              <h2 id={`${child.id}-season`}>{t('seasonTitle')}</h2>
              <ul className={s.plainList}>
                {sched.seasonal.map((x) => (
                  <li key={x.vaccineId} className={s.rowStatic}>
                    <Link href={`/vaccines/${x.vaccineId}`} className={`${s.rowTitle} target-link`}>
                      {text.vaccineName(x.vaccineId)}
                    </Link>
                    <DoseChip state={x.state} label={text.seasonalLabel(x.state)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Other vaccines: custom entries, apart from the AAP schedule until confirmed. */}
          {(record?.customVaccines.length ?? 0) > 0 && (
            <section className={s.section} aria-labelledby={`${child.id}-other`}>
              <h2 id={`${child.id}-other`}>{t('otherTitle')}</h2>
              <p className={s.muted}>{t('otherIntro')}</p>
              <ul className={s.plainList}>
                {record!.customVaccines.map((cv) => (
                  <li key={cv.id}>
                    <Link href={`${base}/add/custom/${cv.id}`} className={s.row}>
                      <span className={s.rowMain}>
                        <span className={s.rowTitle}>{cv.nameAsWritten}</span>
                        <span className={s.rowSub}>{customSubtitle(cv, text.date, text.locale, t)}</span>
                      </span>
                      <DoseChip
                        state={cv.pediatricianConfirmed ? 'received' : 'needsInfo'}
                        label={cv.pediatricianConfirmed ? t('confirmed') : t('unconfirmed')}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      ) : (
        <div role="tabpanel" id={tabIds.schedulePanel} aria-labelledby={tabIds.scheduleTab} className={s.panel}>
          <ScheduleView schedule={sched} childId={child.id} childName={child.name} />
        </div>
      )}
    </div>
  );
}

type View = 'overview' | 'schedule';

/** Overview / Schedule tabs (WAI-ARIA tabs: arrow keys, Home/End move between them). */
function ViewTabs(props: {
  label: string;
  selected: View;
  onSelect(v: View): void;
  ids: { overviewTab: string; scheduleTab: string; overviewPanel: string; schedulePanel: string };
}) {
  const { label, selected, onSelect, ids } = props;
  const t = useTranslations('child');
  const views: View[] = ['overview', 'schedule'];
  const refs = useRef<Record<View, HTMLButtonElement | null>>({ overview: null, schedule: null });
  function onKey(e: React.KeyboardEvent, v: View) {
    const i = views.indexOf(v);
    const next =
      e.key === 'ArrowRight'
        ? views[(i + 1) % views.length]
        : e.key === 'ArrowLeft'
          ? views[(i - 1 + views.length) % views.length]
          : e.key === 'Home'
            ? views[0]
            : e.key === 'End'
              ? views[views.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className={s.tabs}>
      {views.map((v) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[v] = el;
          }}
          type="button"
          role="tab"
          id={v === 'overview' ? ids.overviewTab : ids.scheduleTab}
          aria-selected={selected === v}
          aria-controls={v === 'overview' ? ids.overviewPanel : ids.schedulePanel}
          tabIndex={selected === v ? 0 : -1}
          className={s.tab}
          onClick={() => onSelect(v)}
          onKeyDown={(e) => onKey(e, v)}
        >
          {t(v === 'overview' ? 'overviewTab' : 'scheduleTab')}
        </button>
      ))}
    </div>
  );
}

/** After Review Scan saves: a temporary toast, "3 doses added, 1 custom vaccine" (SPEC.md §6.4c). */
function ScanSummary({ base }: { base: string }) {
  const t = useTranslations('child');
  const search = useSearchParams();
  const router = useRouter();
  const doses = search.get('scanAdded');
  if (doses === null) return null;
  return (
    // Closing it (or its timer) drops the summary from the URL, keeping the tab.
    <Toast onDone={() => router.replace(search.get('tab') === 'schedule' ? `${base}?tab=schedule` : base, { scroll: false })}>
      {t('scanAdded', {
        doses: Number(doses),
        custom: Number(search.get('scanCustom') ?? 0),
      })}
    </Toast>
  );
}

/** Due now / Coming next rows: vaccine, dose, age window, one-line why. */
function DoseList({ doses, base, childName }: { doses: DoseState[]; base: string; childName: string }) {
  const t = useTranslations('child');
  const text = useScheduleText();
  return (
    <ul className={s.plainList}>
      {doses.map((d) => (
        <li key={`${d.vaccineId}-${d.doseNumber}`} className={s.doseItem}>
          <div className={s.doseHead}>
            <Link href={`/vaccines/${d.vaccineId}`} className={`${s.rowTitle} target-link`}>
              {text.vaccineName(d.vaccineId)}
            </Link>
            <DoseChip state={d.state} label={text.stateLabel(d, childName)} />
          </div>
          <p className={s.rowSub}>
            {text.doseLabel(d.doseNumber)} · {text.windowLabel(d.vaccineId, d.doseNumber)}
          </p>
          <p className={s.why}>{text.vaccineWhy(d.vaccineId)}</p>
          <Link href={`${base}/dose/${d.vaccineId}/${d.doseNumber}`} className={s.textLink}>
            {d.state === 'upcoming' ? t('customizeTiming') : t('recordDose')}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function customSubtitle(cv: CustomVaccineEntry, date: (iso: string) => string, locale: 'en' | 'es', t: ReturnType<typeof useTranslations<'child'>>) {
  const { year, month, day } = cv.dateGiven;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day ?? 1).padStart(2, '0')}`;
  const when = day ? date(iso) : formatMonthYear(iso, locale);
  return cv.country ? t('givenIn', { country: cv.country, date: when }) : when;
}
