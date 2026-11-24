'use client';
// Screen 6a · Vaccine Detail (SPEC.md §6.6): what it protects against, doses
// and spacing with age windows, combination forms, side effects, reasons to
// postpone, external links, and a module for the selected child (their doses
// → Dose Edit; Add to record prefiltered; Add a question).
import { useGate } from '@/components/states/States';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canGoBackInApp } from '@/components/shell/inAppHistory';
import { useLocale, useTranslations } from 'next-intl';
import { use, useId, useState } from 'react';
import { DoseChip } from '@/components/schedule/DoseChip';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { QuestionDialog } from '@/components/home/QuickActions';
import { PlusIcon } from '@/components/shell/icons';
import { Toast } from '@/components/ui/Toast';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { useChildRecord } from '@/lib/api/hooks';
import type { SetUpChild } from '@/lib/api/schemas';
import { getVaccine, schedule } from '@/lib/data';
import type { Age } from '@/lib/dates';
import { useChildSchedule } from '@/lib/schedule/useChildSchedule';
import s from './vaccines.module.css';

export function VaccineDetailScreen({ params }: { params: Promise<{ vaccineId: string }> }) {
  const { vaccineId } = use(params);
  const t = useTranslations('vaccines');
  const tAge = useTranslations('age');
  const locale = useLocale() as 'en' | 'es';
  const text = useScheduleText();
  const { selected } = useSelectedChild();
  const router = useRouter();
  const vaccine = getVaccine(vaccineId);
  const series = schedule.series.find((x) => x.vaccineId === vaccineId);

  if (!vaccine) {
    return (
      <section className={s.screen}>
        <h1>{t('notFound')}</h1>
        <Link href="/vaccines" className="btn btn-primary">
          {t('allVaccines')}
        </Link>
      </section>
    );
  }

  const age = (a: Age) => tAge(a.unit, { count: a.value });
  const facts: Array<[string, string]> = [
    [t('sideEffects'), vaccine.commonSideEffects[locale]],
    [t('reasonsToPostpone'), vaccine.reasonsToPostpone[locale]],
    [t('combinations'), vaccine.givenWith[locale]],
  ];

  return (
    <article className={s.screen}>
      <header>
        {/* Back to the page (and tab) they came from; opened directly, to All vaccines. */}
        <Link
          href="/vaccines"
          className={s.back}
          onClick={(e) => {
            if (!canGoBackInApp()) return;
            e.preventDefault();
            router.back();
          }}
        >
          ← {t('back')}
        </Link>
        <h1>{vaccine.name[locale]}</h1>
        <p className={s.lede}>
          <strong>{t('protectsAgainst')}</strong> {vaccine.protectsAgainst[locale]}
        </p>
      </header>

      {selected && <ChildModule child={selected} vaccineId={vaccineId} />}

      <section className={s.section}>
        <h2 className={s.h2}>{t('dosesTitle')}</h2>
        <p>{vaccine.dosesSummary[locale]}</p>
        {series && (
          <ol className={s.doseTable}>
            {series.doses.map((d) => (
              <li key={d.dose}>
                <span className={s.rowTitle}>{text.doseLabel(d.dose)}</span>
                <span>{text.windowLabel(vaccineId, d.dose)}</span>
                {d.minimumIntervalFromPrevious && (
                  <span className={s.rowSub}>
                    {t('minInterval', {
                      interval: age(d.minimumIntervalFromPrevious),
                      dose: d.dose - 1,
                    })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {facts.map(([title, body]) => (
        <section key={title} className={s.section}>
          <h2 className={s.h2}>{title}</h2>
          <p>{body}</p>
        </section>
      ))}

      {vaccine.productNames.length > 0 && (
        <section className={s.section}>
          <h2 className={s.h2}>{t('brands')}</h2>
          <p>{vaccine.productNames.join(', ')}</p>
        </section>
      )}

      <section className={s.section}>
        <h2 className={s.h2}>{t('learnMore')}</h2>
        <ul className={s.links}>
          {vaccine.links.healthyChildren && (
            <li>
              <a href={vaccine.links.healthyChildren} target="_blank" rel="noopener noreferrer">
                {t('healthyChildren')}
                <span className="visually-hidden"> ({t('newTab')})</span>
              </a>
            </li>
          )}
          {vaccine.links.aapFactSheet && (
            <li>
              <a href={vaccine.links.aapFactSheet} target="_blank" rel="noopener noreferrer">
                {t('factSheet')}
                <span className="visually-hidden"> ({t('newTab')})</span>
              </a>
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}

/** The selected child's doses of this vaccine, plus Add Record + and Add a question (Home's question popup). */
function ChildModule({ child, vaccineId }: { child: SetUpChild; vaccineId: string }) {
  const t = useTranslations('vaccines');
  const text = useScheduleText();
  const sched = useChildSchedule(child);
  const recordQ = useChildRecord(child.id);
  const record = recordQ.data;
  const tQuick = useTranslations('home.quick');
  const { children } = useSelectedChild();
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState<{ text: string; child: SetUpChild; n: number } | null>(null);
  const uid = useId();
  const gate = useGate([recordQ], !sched || !record);
  if (gate || !sched || !record) return gate;

  const doses = sched.series.find((x) => x.vaccineId === vaccineId)?.doses;
  const seasonal = sched.seasonal.find((x) => x.vaccineId === vaccineId);
  const recorded = record.doses.filter((d) => d.vaccineId === vaccineId).sort((a, b) => a.doseNumber - b.doseNumber);
  const base = `/child/${child.id}`;

  return (
    <section className={s.childModule} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className={s.h2}>
        {t('childDoses', { name: child.name })}
      </h2>
      {doses ? (
        <ul className={s.childDoses}>
          {doses.map((d) => (
            <li key={d.doseNumber}>
              <Link href={`${base}/dose/${vaccineId}/${d.doseNumber}`} className={s.doseRow}>
                <span>{text.doseLabel(d.doseNumber)}</span>
                <DoseChip state={d.state} label={text.stateLabel(d, child.name)} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {seasonal && <DoseChip state={seasonal.state} label={text.seasonalLabel(seasonal.state)} />}
          {recorded.length > 0 && (
            <ul className={s.childDoses}>
              {recorded.map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/dose/${vaccineId}/${r.doseNumber}`} className={s.doseRow}>
                    <span>{text.doseLabel(r.doseNumber)}</span>
                    {r.dateGiven && <DoseChip state="received" label={text.date(r.dateGiven)} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className={s.moduleActions}>
        <Link href={`${base}/add?vaccine=${vaccineId}&from=${encodeURIComponent(`/vaccines/${vaccineId}`)}`} className={`btn ${s.actionBtn}`}>
          {t('recordVaccine')}
          <PlusIcon />
        </Link>
        <button
          type="button"
          className={`btn ${s.actionBtn}`}
          aria-haspopup="dialog"
          onClick={() => {
            setSaved(null);
            setAsking(true);
          }}
        >
          {t('addQuestion')}
        </button>
      </div>

      {/* The same popup as Home's "Question +", with this page's child and vaccine preselected. */}
      {asking && (
        <QuestionDialog
          kids={children}
          initialChildId={child.id}
          initialVaccineId={vaccineId}
          origin="vaccineDetail"
          onClose={() => setAsking(false)}
          onSaved={(c, msg) => {
            setAsking(false);
            setSaved((p) => ({ child: c, text: msg, n: (p?.n ?? 0) + 1 }));
          }}
        />
      )}
      {saved && (
        // Keyed per save, so a second save restarts the timer.
        <Toast key={saved.n} onDone={() => setSaved(null)}>
          {saved.text} <Link href={`/child/${saved.child.id}`}>{tQuick('viewSchedule', { name: saved.child.name })}</Link>
        </Toast>
      )}
    </section>
  );
}
