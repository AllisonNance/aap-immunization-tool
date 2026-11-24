'use client';
// Screen 4c · Review Scan (SPEC.md §6.4c). Nothing is saved until Save.
// Each extracted dose: name as printed, the matched vaccine, the date, a
// confidence indicator and plain-language flags; Confirm, Edit (vaccine, dose,
// date), Remove or Make custom. Save stays disabled while a kept dose has an
// unresolved ambiguous date or a date before birth. Duplicates start removed.
import { NotFoundState, useGate } from '@/components/states/States';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { use, useId, useRef, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import s from '@/components/record/record.module.css';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { AlertIcon } from '@/components/shell/icons';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { api, ApiError } from '@/lib/api';
import { queryKeys, useChildRecord } from '@/lib/api/hooks';
import type { ChildRecord, ScanSession, SetUpChild } from '@/lib/api/schemas';
import { catalog, schedule } from '@/lib/data';
import { checkDateInput, isoToDateInput, todayISO } from '@/lib/dates';
import { forgetScanImages, scanImages } from '@/lib/scan/images';
import {
  assignDoseNumbers,
  confidenceLevel,
  initReview,
  itemBlockers,
  itemFlags,
  reviewSummary,
  toCommit,
  type Decision,
  type ReviewContext,
  type ReviewItem,
} from '@/lib/scan/review';
import scan from './scan.module.css';

export function ReviewScanScreen({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = use(params);
  const search = useSearchParams();
  const scanId = search.get('scan');
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const recordQ = useChildRecord(child?.id);
  const sessionQ = useQuery({
    queryKey: ['scan', childId, scanId],
    queryFn: () => api.scans.get(childId, scanId!),
    enabled: !!scanId,
    retry: false,
  });
  const record = recordQ.data;
  const session = sessionQ.data;
  const tStates = useTranslations('states');
  // No scan in the URL, or one that's been saved / discarded.
  const gone =
    !scanId || (sessionQ.error instanceof ApiError && sessionQ.error.kind === 'notFound') || session?.status === 'reviewed' || session?.status === 'discarded';
  const gate = useGate(gone ? [recordQ] : [recordQ, sessionQ], !child || !record || (!gone && !session));
  if (gone) {
    return <NotFoundState title={tStates('scanGone')} body={tStates('scanGoneBody')} href={`/child/${childId}`} linkLabel={tStates('backToChild')} />;
  }
  if (gate || !child || !record || !session) return gate;
  return <Review key={session.id} child={child} record={record} session={session} />;
}

function Review({ child, record, session }: { child: SetUpChild; record: ChildRecord; session: ScanSession }) {
  const t = useTranslations('review');
  const tErr = useTranslations('errors');
  const tCustom = useTranslations('custom');
  const router = useRouter();
  const qc = useQueryClient();
  const base = `/child/${child.id}`;
  const ctx: ReviewContext = {
    dob: child.dateOfBirth,
    today: todayISO(),
    doses: record.doses,
    schedule,
  };
  const [items, setItems] = useState<ReviewItem[]>(() => initReview(session.extracted, ctx));
  const [tried, setTried] = useState(false);
  const summary = reviewSummary(items, ctx);
  const images = scanImages(session.id);

  const update = (key: string, patch: Partial<ReviewItem>) =>
    setItems((list) => {
      const next = list.map((i) => (i.key === key ? { ...i, ...patch } : i));
      // A new vaccine needs a fresh dose number.
      return 'vaccineId' in patch || ('date' in patch && !('doseNumber' in patch))
        ? assignDoseNumbers(
            next.map((i) => (i.key === key ? { ...i, doseNumber: undefined } : i)),
            ctx,
          )
        : next;
    });

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: queryKeys.record(child.id) }), qc.invalidateQueries({ queryKey: queryKeys.questions(child.id) })]);

  const save = useMutation({
    mutationFn: async () => {
      const result = await api.scans.commit(child.id, session.id, toCommit(items));
      // Each custom vaccine gets its question for the pediatrician (as in 4d).
      for (const cv of result.customVaccines) {
        await api.questions.create(child.id, {
          text: tCustom('autoQuestion', { name: cv.nameAsWritten }),
          customVaccineId: cv.id,
          origin: 'customVaccine',
        });
      }
      return result;
    },
    onSettled: refresh,
    onSuccess: (r) => {
      forgetScanImages(session.id);
      router.replace(`${base}?scanAdded=${r.dosesAdded}&scanCustom=${r.customVaccinesAdded}`);
    },
  });

  const discard = useMutation({
    mutationFn: () => api.scans.discard(child.id, session.id),
    onSuccess: () => {
      forgetScanImages(session.id);
      router.replace(base);
    },
  });

  const busy = save.isPending || discard.isPending;

  return (
    <section className={s.screen}>
      <header>
        <h1>{t('title')}</h1>
        <p className={s.sub}>{t('intro')}</p>
      </header>

      <SourceImages urls={images} />

      <ul className={scan.items}>
        {items.map((item) => (
          <ReviewCard key={item.key} item={item} ctx={ctx} child={child} showBlockers={tried} onChange={(p) => update(item.key, p)} />
        ))}
      </ul>

      {save.isError && (
        <p role="alert" className={s.formError}>
          {tErr('saveFailed')}
        </p>
      )}

      <div className={s.actions}>
        <div className={scan.bottomBar}>
          <p aria-live="polite">
            {summary.blocked > 0 ? t('needsAttention', { count: summary.blocked }) : t('willAdd', { doses: summary.doses, custom: summary.custom })}
          </p>
          <div className={s.actionsInner}>
            <button type="button" className="btn" onClick={() => discard.mutate()} disabled={busy}>
              {t('discard')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              // Disabled while anything kept is unresolved (SPEC.md §6.4c).
              disabled={!summary.canSave || busy}
              onClick={() => {
                setTried(true);
                save.mutate();
              }}
            >
              {save.isPending ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
      <Link href={`${base}/add/scan`} className={s.textLink}>
        {t('rescan')}
      </Link>
    </section>
  );
}

function ReviewCard(props: { item: ReviewItem; ctx: ReviewContext; child: SetUpChild; showBlockers: boolean; onChange(patch: Partial<ReviewItem>): void }) {
  const { item, ctx, child, onChange } = props;
  const t = useTranslations('review');
  const locale = useLocale();
  const text = useScheduleText();
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const flags = itemFlags(item, ctx);
  const blockers = itemBlockers(item, ctx);
  const removed = item.decision === 'remove';
  // A removed item still explains why it's removed when it's a duplicate.
  const visibleFlags = removed ? flags.filter((f) => f === 'duplicate') : flags;
  // The edit panel keeps its own in-progress date; it applies once complete.
  const [dateInput, setDateInput] = useState(() => isoToDateInput(item.date));
  const vaccine = item.vaccineId ? text.vaccineName(item.vaccineId) : undefined;
  const level = confidenceLevel(item.confidence);
  const monthDay = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));

  const flagText = (f: string) => {
    switch (f) {
      case 'unrecognized':
        return t('flags.unrecognized', { raw: item.rawName });
      case 'ambiguousDate':
        return t('flags.ambiguousDate', {
          printed: item.rawDate.slice(0, 5),
          a: monthDay(item.dateOptions![0]),
          b: monthDay(item.dateOptions![1]),
        });
      case 'beforeBirth':
        return t('flags.beforeBirth', { name: child.name });
      case 'intervalTooShort':
        return t('flags.intervalTooShort', {
          vaccine: vaccine ?? item.rawName,
        });
      case 'duplicate':
        return t('flags.duplicate', {
          vaccine: vaccine ?? item.rawName,
          name: child.name,
        });
      default:
        return f;
    }
  };
  const blocking = (f: string) => !removed && (f === 'ambiguousDate' || f === 'beforeBirth' || (f === 'unrecognized' && item.decision === 'confirm'));
  const seriesDoses = schedule.series.find((x) => x.vaccineId === item.vaccineId)?.doses.length ?? 6;

  return (
    <li
      className={`${scan.item} ${blockers.length ? scan.itemBlocked : ''} ${removed ? scan.itemRemoved : ''}`}
      aria-labelledby={`${uid}-name`}
      data-testid="review-item"
    >
      <div className={scan.itemHead}>
        <div>
          <span className={scan.raw}>{t('asPrinted', { raw: item.rawName })}</span>
          <p id={`${uid}-name`} className={scan.match}>
            {vaccine
              ? item.doseNumber && !removed
                ? `${vaccine} · ${text.doseLabel(item.doseNumber)}`
                : vaccine
              : item.decision === 'custom'
                ? t('customName', { raw: item.rawName })
                : t('noMatch')}
          </p>
          <p className={scan.meta}>
            {item.date ? text.date(item.date) : t('dateUnclear')} · {t('printed', { raw: item.rawDate })}
          </p>
        </div>
        <span className={scan.confidence}>
          <span className={scan.bars} aria-hidden>
            <span data-on="true" />
            <span data-on={level !== 'low'} />
            <span data-on={level === 'high'} />
          </span>
          {t(`confidence.${level}`)}
        </span>
      </div>

      {visibleFlags.length > 0 && (
        <ul className={scan.flags}>
          {visibleFlags.map((f) => (
            <li key={f} className={`${scan.flag} ${blocking(f) ? scan.flagBlocking : ''}`}>
              <AlertIcon />
              <span>{flagText(f)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Ambiguous date: which reading? */}
      {item.dateOptions && !removed && (
        <fieldset className={scan.choice}>
          <legend className={s.label}>{t('whichDate')}</legend>
          <div className={scan.segments}>
            {item.dateOptions.map((d) => (
              <label key={d} className={scan.segment}>
                <input type="radio" name={`${uid}-date`} checked={item.date === d} onChange={() => onChange({ date: d, edited: true })} />
                <span>{text.date(d)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className={scan.choice}>
        <legend className="visually-hidden">{t('decisionLegend', { raw: item.rawName })}</legend>
        <div className={scan.segments}>
          {(['confirm', 'remove', 'custom'] as Decision[]).map((d) => (
            <label key={d} className={scan.segment}>
              <input type="radio" name={`${uid}-decision`} checked={item.decision === d} onChange={() => onChange({ decision: d, edited: true })} />
              <span>{t(`decision.${d}`)}</span>
            </label>
          ))}
          <button type="button" className={s.dangerLink} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
            {t('edit')}
          </button>
        </div>
      </fieldset>

      {editing && (
        <div className={scan.editPanel}>
          <div className={scan.row2}>
            <div className={s.field} style={{ flex: 2, minWidth: 180 }}>
              <label htmlFor={`${uid}-vaccine`} className={s.label}>
                {t('vaccine')}
              </label>
              <select
                id={`${uid}-vaccine`}
                className={scan.select}
                value={item.vaccineId ?? ''}
                onChange={(e) =>
                  onChange({
                    vaccineId: e.target.value || undefined,
                    edited: true,
                  })
                }
              >
                <option value="">{t('noMatch')}</option>
                {catalog.vaccines.map((v) => (
                  <option key={v.id} value={v.id}>
                    {text.vaccineName(v.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.field} style={{ flex: 1, minWidth: 100 }}>
              <label htmlFor={`${uid}-dose`} className={s.label}>
                {t('dose')}
              </label>
              <select
                id={`${uid}-dose`}
                className={scan.select}
                value={item.doseNumber ?? ''}
                disabled={!item.vaccineId}
                onChange={(e) => onChange({ doseNumber: Number(e.target.value), edited: true })}
              >
                {Array.from({ length: seriesDoses }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {text.doseLabel(n)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DateFields
            legend={t('date')}
            value={dateInput}
            onChange={(v) => {
              setDateInput(v);
              const c = checkDateInput(v);
              if (c.kind === 'valid') onChange({ date: c.iso, edited: true });
            }}
          />
        </div>
      )}
    </li>
  );
}

/** The scanned pages, viewable and zoomable. */
function SourceImages({ urls }: { urls: string[] }) {
  const t = useTranslations('review');
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  if (!urls.length) return <p className={scan.noImage}>{t('noImage')}</p>;
  return (
    <section aria-label={t('pagesLabel')}>
      <ul className={scan.pages}>
        {urls.map((url, i) => (
          <li key={url} className={scan.page}>
            <button
              type="button"
              className={scan.thumbButton}
              onClick={() => {
                setOpen(i);
                setZoom(1);
                dialog.current?.showModal();
              }}
              aria-label={t('viewPage', { n: i + 1 })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local photo preview */}
              <img src={url} alt="" className={scan.thumb} />
            </button>
            <span className={scan.pageLabel}>{t('page', { n: i + 1 })}</span>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} className={scan.viewer} aria-label={t('viewer')} onClose={() => setOpen(null)}>
        <div className={scan.viewerBar}>
          <div>
            <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label={t('zoomOut')}>
              −
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label={t('zoomIn')}>
              +
            </button>
          </div>
          <button type="button" onClick={() => dialog.current?.close()}>
            {t('close')}
          </button>
        </div>
        <div className={scan.viewerBody}>
          {open !== null && (
            /* eslint-disable-next-line @next/next/no-img-element -- a local photo preview */
            <img src={urls[open]} alt={t('pageAlt', { n: open + 1 })} style={{ width: `${zoom * 100}%` }} />
          )}
        </div>
      </dialog>
    </section>
  );
}
