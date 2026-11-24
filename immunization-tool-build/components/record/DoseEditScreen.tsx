'use client';
// Screen 4 · Dose Edit (SPEC.md §6.4). A chip with the child's name sits above
// the vaccine name (no editing banner, no switcher: the child is locked). Status: Received (date checked against DOB, minimum age and
// interval), Not sure (where to look + auto question), Postponed (target date;
// later doses shift), Not given, Exemption (optionally the rest of the series),
// and Planned (a date for an upcoming dose). Also reaction notes and a note for
// the doctor (a question). Save, Cancel, Delete entry.
import { NotFoundState, useGate } from '@/components/states/States';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { use, useId, useRef, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import { DoseChip } from '@/components/schedule/DoseChip';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { AlertIcon } from '@/components/shell/icons';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { api, ApiError } from '@/lib/api';
import { queryKeys, useChildRecord, useQuestions } from '@/lib/api/hooks';
import type { ChildRecord, CustomVaccineEntry, DoseStatus, Question, SetUpChild } from '@/lib/api/schemas';
import { schedule } from '@/lib/data';
import { isoToDateInput, todayISO, type DateInput } from '@/lib/dates';
import { formatMonthYear } from '@/lib/i18n';
import type { DoseState } from '@/lib/schedule';
import { useChildSchedule } from '@/lib/schedule/useChildSchedule';
import { validateDoseForm, type DoseFormValues } from '@/lib/validation/dose';
import s from './record.module.css';

type Params = Promise<{
  childId: string;
  vaccineId: string;
  doseNumber: string;
}>;

export function DoseEditScreen({ params }: { params: Params }) {
  const { childId, vaccineId, doseNumber } = use(params);
  const n = Number(doseNumber);
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const sched = useChildSchedule(child);
  const recordQ = useChildRecord(child?.id);
  const questionsQ = useQuestions(child?.id);
  const record = recordQ.data;
  const questions = questionsQ.data;
  const t = useTranslations('states');
  const gate = useGate([recordQ, questionsQ], !child || !sched || !record || !questions);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    return <NotFoundState title={t('doseNotFound')} href={`/child/${childId}`} linkLabel={t('backToChild')} />;
  }
  if (gate || !child || !sched || !record || !questions) return gate;
  const doseState = sched.series.find((x) => x.vaccineId === vaccineId)?.doses.find((d) => d.doseNumber === n);
  // Remount when the saved record changes (e.g. after a reload on conflict).
  const rec = doseState?.record ?? record.doses.find((r) => r.vaccineId === vaccineId && r.doseNumber === n);
  return <DoseForm key={rec?.updatedAt ?? 'new'} child={child} record={record} questions={questions} vaccineId={vaccineId} n={n} doseState={doseState} />;
}

// The form's choices, in order ("Declined" just above "Not sure", which is last). "Delayed" (postponed) takes a new
// date and moves the doses that follow; there's no separate "plan a date".
const STATUSES: Exclude<DoseStatus, 'planned'>[] = ['received', 'postponed', 'notGiven', 'exemption', 'declined', 'notSure'];

function DoseForm(props: { child: SetUpChild; record: ChildRecord; questions: Question[]; vaccineId: string; n: number; doseState?: DoseState }) {
  const { child, record, questions, vaccineId, n, doseState } = props;
  const t = useTranslations('dose');
  const tErr = useTranslations('errors');
  const text = useScheduleText();
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const uid = useId();
  const base = `/child/${child.id}`;
  // Back to the tab the dose was opened from (the Schedule tab passes ?back=schedule).
  const back = search.get('back') === 'schedule' ? `${base}?tab=schedule${search.get('view') === 'list' ? '&view=list' : ''}` : base;

  const rec = doseState?.record ?? record.doses.find((r) => r.vaccineId === vaccineId && r.doseNumber === n);
  const exemptionHere = record.exemptions.find((e) => e.vaccineId === vaccineId && e.fromDoseNumber === n);
  const scheduleDose = schedule.series.find((x) => x.vaccineId === vaccineId)?.doses.find((d) => d.dose === n);
  // Previous received dose of this vaccine (for the minimum interval).
  const previousDate = record.doses
    .filter((r) => r.vaccineId === vaccineId && r.doseNumber < n && r.status === 'received' && r.dateGiven)
    .sort((a, b) => b.doseNumber - a.doseNumber)[0]?.dateGiven;
  // An older "planned" entry (a date with no effect on spacing) opens as Delayed with that date.
  const legacyPlanned = rec?.status === 'planned';

  const [values, setValues] = useState<DoseFormValues>(() => ({
    status: legacyPlanned ? 'postponed' : (rec?.status ?? 'received'),
    dateGiven: isoToDateInput(rec?.dateGiven),
    postponedUntil: isoToDateInput(legacyPlanned ? rec?.customTargetDate : rec?.postponedUntil),
    applyToRest: rec?.status === 'exemption' ? !!exemptionHere : true,
    reactionNotes: rec?.reactionNotes ?? '',
    doctorNote: '',
  }));
  const [submitted, setSubmitted] = useState(false);
  // Received as one of the child's custom vaccines (e.g. from a record from another country).
  const customs = record.customVaccines;
  const [customId, setCustomId] = useState(() => (rec?.customVaccineId && customs.some((c) => c.id === rec.customVaccineId) ? rec.customVaccineId : ''));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstDateRef = useRef<HTMLSelectElement | HTMLInputElement>(null);

  const result = validateDoseForm(values, {
    dob: child.dateOfBirth,
    today: todayISO(),
    dose: scheduleDose,
    previousDate,
  });
  const errors = submitted ? result.errors : {};
  const set = <K extends keyof DoseFormValues>(k: K, v: DoseFormValues[K]) => setValues((x) => ({ ...x, [k]: v }));
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: queryKeys.record(child.id) }), qc.invalidateQueries({ queryKey: queryKeys.questions(child.id) })]);

  const save = useMutation({
    mutationFn: async () => {
      const { status } = values;
      const fields = {
        status,
        source: rec?.source ?? ('manual' as const),
        ...(status === 'received'
          ? {
              dateGiven: result.dates.dateGiven,
              reactionNotes: values.reactionNotes.trim() || undefined,
              customVaccineId: customId || undefined,
            }
          : {}),
        ...(status === 'postponed' ? { postponedUntil: result.dates.postponedUntil } : {}),
      };
      // Same status: update in place. A different status: replace the entry, so
      // fields from the old status don't linger.
      let saved;
      if (rec && rec.status === status) {
        saved = await api.doses.patch(child.id, rec.id, {
          ...fields,
          reactionNotes: status === 'received' ? values.reactionNotes.trim() : undefined,
          updatedAt: rec.updatedAt,
        });
      } else {
        if (rec) await api.doses.remove(child.id, rec.id);
        saved = await api.doses.create(child.id, {
          vaccineId,
          doseNumber: n,
          ...fields,
        });
      }

      // Exemption from this dose onward (rule 5).
      if (status === 'exemption' && values.applyToRest && !exemptionHere) {
        await api.exemptions.create(child.id, { vaccineId, fromDoseNumber: n });
      } else if ((status !== 'exemption' || !values.applyToRest) && exemptionHere) {
        await api.exemptions.remove(child.id, exemptionHere.id);
      }

      // Not sure → a question for the pediatrician (once per dose).
      if (
        status === 'notSure' &&
        !questions.some(
          (q) =>
            q.origin === 'notSure' &&
            !q.resolved &&
            q.vaccineId === vaccineId &&
            (q.doseRecordId === rec?.id || q.doseRecordId === saved.id || !q.doseRecordId),
        )
      ) {
        await api.questions.create(child.id, {
          text: t('notSureQuestion', {
            vaccine: text.vaccineName(vaccineId),
            n,
            name: child.name,
          }),
          vaccineId,
          doseRecordId: saved.id,
          origin: 'notSure',
        });
      }
      // Note for the doctor → a question.
      if (values.doctorNote.trim()) {
        await api.questions.create(child.id, {
          text: values.doctorNote.trim(),
          vaccineId,
          doseRecordId: saved.id,
          origin: 'doseNote',
        });
      }
    },
    onSettled: refresh,
    onSuccess: () => router.push(back),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (rec) await api.doses.remove(child.id, rec.id);
      if (exemptionHere) await api.exemptions.remove(child.id, exemptionHere.id);
    },
    onSettled: refresh,
    onSuccess: () => router.push(back),
  });

  const conflict = save.error instanceof ApiError && save.error.isConflict;
  const busy = save.isPending || remove.isPending;

  function onSave() {
    setSubmitted(true);
    if (!result.valid) {
      firstDateRef.current?.focus();
      return;
    }
    save.mutate();
  }

  const dateError = (code?: string) =>
    code && (
      <p className={s.error} id={`${uid}-date-error`}>
        <AlertIcon />
        {t(`errors.${code as 'dateRequired'}`)}
      </p>
    );

  return (
    <form
      className={s.screen}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <header>
        <p className={s.childChip} data-testid="child-chip">
          {child.name}
        </p>
        <h1>
          {text.vaccineName(vaccineId)} · {text.doseLabel(n)}
        </h1>
        <div className={s.headRow}>
          {scheduleDose && <p className={s.sub}>{text.windowLabel(vaccineId, n)}</p>}
          {doseState && <DoseChip state={doseState.state} label={text.stateLabel(doseState, child.name)} />}
        </div>
      </header>

      <fieldset className={s.statusGroup} disabled={busy}>
        <legend className={s.label}>{t('statusLegend')}</legend>
        {STATUSES.map((st) => (
          <label key={st} className={s.radioRow}>
            <input type="radio" name={`${uid}-status`} value={st} checked={values.status === st} onChange={() => set('status', st)} />
            <span>{t(`status.${st}`)}</span>
          </label>
        ))}
      </fieldset>

      {values.status === 'received' && (
        <div className={s.panel}>
          {customs.length > 0 && (
            <div className={s.field}>
              <label htmlFor={`${uid}-custom`} className={s.label}>
                {t('customLabel')}
              </label>
              <select
                id={`${uid}-custom`}
                className={s.input}
                value={customId}
                aria-describedby={customId ? `${uid}-custom-note` : undefined}
                onChange={(e) => {
                  const id = e.target.value;
                  setCustomId(id);
                  // Use that entry's date (its day may be unknown: then fill month and year).
                  const cv = customs.find((c) => c.id === id);
                  if (cv) set('dateGiven', customDateInput(cv));
                }}
              >
                <option value="">{t('customNone')}</option>
                {customs.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {customOption(cv, text.date, text.locale)}
                  </option>
                ))}
              </select>
              {customId && (
                <p id={`${uid}-custom-note`} className={s.warning}>
                  <AlertIcon />
                  {t('customNote')}
                </p>
              )}
            </div>
          )}
          <DateFields
            legend={t('dateGiven')}
            firstRef={firstDateRef}
            value={values.dateGiven}
            onChange={(v) => set('dateGiven', v)}
            invalid={!!errors.dateGiven}
            describedBy={errors.dateGiven ? `${uid}-date-error` : undefined}
          />
          {dateError(errors.dateGiven)}
          {result.warnings.map((w) => (
            <p key={w} className={s.warning}>
              <AlertIcon />
              {t(`warnings.${w as 'beforeMinimumAge'}`)}
            </p>
          ))}
          <div className={s.field}>
            <label htmlFor={`${uid}-reaction`} className={s.label}>
              {t('reactionNotes')}
            </label>
            <textarea id={`${uid}-reaction`} className={s.textarea} value={values.reactionNotes} onChange={(e) => set('reactionNotes', e.target.value)} />
          </div>
        </div>
      )}

      {values.status === 'notSure' && (
        <div className={s.panel}>
          <p className={s.label}>{t('whereToLook')}</p>
          <ul>
            {(['pediatrician', 'registry', 'healthDept', 'schools', 'babyBook'] as const).map((k) => (
              <li key={k}>{t(`places.${k}`)}</li>
            ))}
          </ul>
          <p>{t('notSureQuestionNote')}</p>
          <Link href={`${base}/add/scan`} className="btn">
            {t('scanShortcut')}
          </Link>
        </div>
      )}

      {values.status === 'postponed' && (
        <div className={s.panel}>
          <p>{t('postponedHelp')}</p>
          <DateFields
            legend={t('postponedUntil')}
            firstRef={firstDateRef}
            value={values.postponedUntil}
            onChange={(v) => set('postponedUntil', v)}
            invalid={!!errors.postponedUntil}
            describedBy={errors.postponedUntil ? `${uid}-date-error` : undefined}
          />
          {dateError(errors.postponedUntil)}
        </div>
      )}

      {values.status === 'exemption' && (
        <div className={s.panel}>
          <label className={s.check}>
            <input type="checkbox" checked={values.applyToRest} onChange={(e) => set('applyToRest', e.target.checked)} />
            <span>{t('applyToRest')}</span>
          </label>
        </div>
      )}


      <div className={s.field}>
        <label htmlFor={`${uid}-note`} className={s.label}>
          {t('doctorNote')}
        </label>
        <textarea id={`${uid}-note`} className={s.textarea} value={values.doctorNote} onChange={(e) => set('doctorNote', e.target.value)} />
        <p className={s.hint}>{t('doctorNoteHint')}</p>
      </div>

      <p className={s.helper}>
        {t('comboHelper')} <Link href="/vaccines/guides/combination-vaccines">{t('comboLink')}</Link>
      </p>

      {conflict && (
        <p role="alert" className={s.formError}>
          {t('conflict')}
        </p>
      )}
      {(save.isError && !conflict) || remove.isError ? (
        <p role="alert" className={s.formError}>
          {tErr('saveFailed')}
        </p>
      ) : null}

      {rec && (
        <div>
          {confirmDelete ? (
            <div className={s.confirmBox} role="group" aria-label={t('deleteConfirm')}>
              <p>{t('deleteConfirm')}</p>
              <div className={s.actionsInner}>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  {t('keep')}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => remove.mutate()} disabled={busy}>
                  {t('deleteYes')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={s.dangerLink} onClick={() => setConfirmDelete(true)} disabled={busy}>
              {t('delete')}
            </button>
          )}
        </div>
      )}

      <div className={s.actions}>
        <div className={s.actionsInner}>
          <Link href={back} className="btn">
            {t('cancel')}
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {save.isPending ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </form>
  );
}

/** A custom vaccine's date as Dose Edit's date fields (day left blank when unknown). */
function customDateInput(cv: CustomVaccineEntry): DateInput {
  const { year, month, day } = cv.dateGiven;
  return { year: String(year), month: String(month), day: day ? String(day) : '' };
}

/** "BCG · Sep 27, 2014 · Mexico" (month and year only when the day is unknown). */
function customOption(cv: CustomVaccineEntry, date: (iso: string) => string, locale: 'en' | 'es') {
  const { year, month, day } = cv.dateGiven;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day ?? 1).padStart(2, '0')}`;
  return [cv.nameAsWritten, day ? date(iso) : formatMonthYear(iso, locale), cv.country].filter(Boolean).join(' · ');
}
