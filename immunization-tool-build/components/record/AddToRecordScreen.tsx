'use client';
// Screen 4a · Add to Record (SPEC.md §6.4a): search the catalog (both
// languages, typo-tolerant), quick picks (due next), pick a
// vaccine then a dose (default: the next unrecorded one) → Dose Edit (4).
// With only one dose to offer (e.g. COVID-19 or flu with none recorded) the
// dose step is skipped and it goes straight to Dose Edit.
// Below the results: Scan a record (4b) and Add a custom vaccine (4d).
// Opened for one vaccine (?vaccine=, from its page): no search, scan or custom
// vaccine, just that vaccine's dose picker.
import { useGate } from '@/components/states/States';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNext } from '@/lib/guards';
import { useTranslations } from 'next-intl';
import { use, useEffect, useId, useState } from 'react';
import { DoseChip } from '@/components/schedule/DoseChip';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { ChevronRightIcon } from '@/components/shell/icons';
import { isPreviousInAppPage } from '@/components/shell/inAppHistory';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { useChildRecord } from '@/lib/api/hooks';
import type { DoseRecord } from '@/lib/api/schemas';
import { catalog, getVaccine } from '@/lib/data';
import type { ChildSchedule, DoseState } from '@/lib/schedule';
import { useChildSchedule } from '@/lib/schedule/useChildSchedule';
import { searchVaccines } from '@/lib/search/vaccines';
import s from './record.module.css';

const QUICK = 4;

/** Doses to offer for a vaccine: its series, or (flu, COVID…) recorded doses plus the next one. */
function dosesFor(vaccineId: string, sched: ChildSchedule, records: DoseRecord[]): Array<{ n: number; state?: DoseState }> {
  const series = sched.series.find((x) => x.vaccineId === vaccineId);
  if (series) return series.doses.map((d) => ({ n: d.doseNumber, state: d }));
  const recorded = [...new Set(records.filter((r) => r.vaccineId === vaccineId).map((r) => r.doseNumber))].sort((a, b) => a - b);
  return [...recorded, (recorded.at(-1) ?? 0) + 1].map((n) => ({ n }));
}

/** Default dose: the first one with nothing recorded. */
function nextUnrecorded(doses: Array<{ n: number; state?: DoseState }>, vaccineId: string, records: DoseRecord[]): number {
  const has = (n: number) => records.some((r) => r.vaccineId === vaccineId && r.doseNumber === n);
  return (doses.find((d) => !has(d.n)) ?? doses.at(-1))!.n;
}

export function AddToRecordScreen({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = use(params);
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const sched = useChildSchedule(child);
  const recordQ = useChildRecord(child?.id);
  const record = recordQ.data;
  // Next keeps this page mounted after leaving it, so its state would outlive the visit:
  // start over whenever it's opened with different parameters (?vaccine= from a vaccine page, ?from=).
  const search = useSearchParams();
  const gate = useGate([recordQ], !child || !sched || !record);
  if (gate || !child || !sched || !record) return gate;
  return <AddToRecord key={search.toString()} childId={child.id} childName={child.name} sched={sched} records={record.doses} />;
}

function AddToRecord({ childId, childName, sched, records }: { childId: string; childName: string; sched: ChildSchedule; records: DoseRecord[] }) {
  const t = useTranslations('addRecord');
  const text = useScheduleText();
  const router = useRouter();
  const search = useSearchParams();
  const prefill = search.get('vaccine');
  const from = safeNext(search.get('from'));
  const [query, setQuery] = useState(() => (prefill ? text.vaccineShort(prefill) : ''));
  const [picked, setPicked] = useState<string | null>(prefill);
  const [doseN, setDoseN] = useState<number | null>(null);
  const uid = useId();
  const base = `/child/${childId}`;

  const results = query.trim() ? searchVaccines(query, catalog.vaccines) : [];
  const all = sched.series.flatMap((x) => x.doses);
  const dueNext = all.filter((d) => d.state === 'overdue' || d.state === 'dueNow').slice(0, QUICK);
  const customHref = `${base}/add/custom${query.trim() ? `?name=${encodeURIComponent(query.trim())}` : ''}`;

  const pickedDoses = picked ? dosesFor(picked, sched, records) : [];
  const selectedDose = doseN ?? (picked ? nextUnrecorded(pickedDoses, picked, records) : null);
  const doseHref = (vaccineId: string, n: number) => `${base}/dose/${vaccineId}/${n}`;
  /** The one dose to offer, when there's nothing to choose between. */
  const onlyDose = (vaccineId: string) => {
    const doses = dosesFor(vaccineId, sched, records);
    return doses.length === 1 ? doses[0].n : null;
  };

  // Opened for a vaccine (?vaccine=, e.g. from its page) with a single dose: skip
  // this page. Replace, so Back doesn't land here and bounce forward again.
  const prefillOnly = prefill ? onlyDose(prefill) : null;
  useEffect(() => {
    if (prefill && prefillOnly !== null) router.replace(doseHref(prefill, prefillOnly));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit (the page is keyed by its URL)
  }, [prefill, prefillOnly]);
  if (prefillOnly !== null) return null; // on the way to Dose Edit

  // Opened for one vaccine (from its page): no search, scan or custom vaccine, just that vaccine's doses.
  // Otherwise the bottom bar has Cancel only; Add a Custom Vaccine is below the search.
  const forVaccine = prefill ? getVaccine(prefill) : undefined;

  const actionBar = (
    <>
      {/* Fixed above the tab bar, over the page content. */}
      <div className={s.addBar} data-testid="add-bar">
        <div className={s.actionsInner}>
          {/* Back to where Add to record was opened from (Home, a vaccine page…), else the child's schedule. */}
          {/* Going back in history when it's the page just before, so that page's own Back still works. */}
          <Link
            href={from ?? base}
            className="btn"
            onClick={(e) => {
              if (!isPreviousInAppPage(from ?? base)) return;
              e.preventDefault();
              router.back();
            }}
          >
            {t('cancel')}
          </Link>
        </div>
      </div>
    </>
  );

  const dosePicker = (vaccineId: string) => (
    <fieldset className={s.dosePicker}>
      <legend className={s.label}>{t('whichDose')}</legend>
      <div className={s.doseOptions}>
        {pickedDoses.map((d) => (
          <label key={d.n} className={s.doseOption}>
            <input type="radio" name={`${uid}-dose-${vaccineId}`} value={d.n} checked={selectedDose === d.n} onChange={() => setDoseN(d.n)} />
            <span>{text.doseLabel(d.n)}</span>
            {d.state && <DoseChip state={d.state.state} label={text.stateLabel(d.state, childName)} />}
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={() => router.push(doseHref(vaccineId, selectedDose!))}>
        {t('continue')}
      </button>
    </fieldset>
  );

  if (forVaccine) {
    return (
      <section className={`${s.screen} ${s.pageScreen}`}>
        <h1>{t('title', { name: childName })}</h1>
        <div className={s.pickedCard}>
          <div className={`${s.row} ${s.staticRow}`}>
            <span className={s.rowText}>
              <span className={s.rowTitle}>{text.vaccineName(forVaccine.id)}</span>
              <span className={s.rowSub}>{forVaccine.abbreviation}</span>
            </span>
          </div>
          {dosePicker(forVaccine.id)}
        </div>
        {actionBar}
      </section>
    );
  }

  return (
    <section className={`${s.screen} ${s.pageScreen}`}>
      <header className={s.titleRow}>
        <h1>{t('title', { name: childName })}</h1>
        <Link href={`${base}/add/scan`} className="btn">
          {t('scan')}
        </Link>
      </header>

      <div className={s.field}>
        <label htmlFor={`${uid}-q`} className={s.label}>
          {t('searchLabel')}
        </label>
        <input
          id={`${uid}-q`}
          type="search"
          className={s.input}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
            setDoseN(null);
          }}
        />
        <p className={s.hint}>{t('searchHint')}</p>
      </div>

      {/* Not in the catalog (e.g. given outside the US): a light link row, not a button. */}
      <section aria-labelledby={`${uid}-custom`} className={s.customPrompt}>
        <h2 id={`${uid}-custom`} className={s.h2}>
          {t('customTitle')}
        </h2>
        <p className={s.hint}>{t('customIntro')}</p>
        <Link href={customHref} className={s.linkRow}>
          <span>{t('addCustom')}</span>
          <ChevronRightIcon className={s.linkRowChevron} aria-hidden />
        </Link>
      </section>

      {!query.trim() && (
        <>
          {dueNext.length > 0 && (
            <section aria-labelledby={`${uid}-due`}>
              <h2 id={`${uid}-due`} className={s.h2}>
                {t('dueNext', { name: childName })}
              </h2>
              <ul className={s.list}>
                {dueNext.map((d) => (
                  <li key={`${d.vaccineId}-${d.doseNumber}`}>
                    <Link href={`${base}/dose/${d.vaccineId}/${d.doseNumber}`} className={s.row}>
                      <span className={s.rowText}>
                        <span className={s.rowTitle}>{text.vaccineName(d.vaccineId)}</span>
                        <span className={s.rowSub}>{text.doseLabel(d.doseNumber)}</span>
                      </span>
                      <DoseChip state={d.state} label={text.stateLabel(d, childName)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {query.trim() && (
        <section aria-labelledby={`${uid}-results`} aria-live="polite">
          <h2 id={`${uid}-results`} className={s.h2}>
            {t('results')}
          </h2>
          {results.length === 0 ? (
            <div className={s.empty}>
              <p>{t('noMatch', { query: query.trim() })}</p>
            </div>
          ) : (
            <ul className={s.list}>
              {results.map((v) => (
                <li key={v.id} className={picked === v.id ? s.pickedCard : undefined}>
                  <button
                    type="button"
                    className={s.row}
                    aria-expanded={onlyDose(v.id) === null ? picked === v.id : undefined}
                    onClick={() => {
                      const only = onlyDose(v.id);
                      if (only !== null) return router.push(doseHref(v.id, only));
                      setPicked(picked === v.id ? null : v.id);
                      setDoseN(null);
                    }}
                  >
                    <span className={s.rowText}>
                      <span className={s.rowTitle}>{text.vaccineName(v.id)}</span>
                      <span className={s.rowSub}>{v.abbreviation}</span>
                    </span>
                    <ChevronRightIcon className={`${s.chevron} ${picked === v.id ? s.chevronOpen : ''}`} />
                  </button>
                  {picked === v.id && dosePicker(v.id)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {actionBar}
    </section>
  );
}
