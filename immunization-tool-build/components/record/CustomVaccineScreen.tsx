'use client';
// Screen 4d · Custom Vaccine (SPEC.md §6.4d): a vaccine not in the US catalog
// (e.g. BCG given abroad). Date given by month name + optional day + year, so
// day-first and month-first dates can't be confused. A new entry has a
// checkbox (checked by default) to add a question for the pediatrician about
// how it fits the schedule. Shown under "Other vaccines" on the child page, apart
// from the AAP schedule (it never changes AAP statuses).
import { NotFoundState, useGate } from '@/components/states/States';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { use, useId, useRef, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import { AlertIcon } from '@/components/shell/icons';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { api, ApiError } from '@/lib/api';
import { queryKeys, useChildRecord } from '@/lib/api/hooks';
import type { CustomVaccineEntry, SetUpChild } from '@/lib/api/schemas';
import { emptyDateInput, todayISO, type DateInput } from '@/lib/dates';
import { validateCustomVaccine } from '@/lib/validation/dose';
import s from './record.module.css';

type Params = Promise<{ childId: string; entryId?: string }>;

export function CustomVaccineScreen({ params }: { params: Params }) {
  const { childId, entryId } = use(params);
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const recordQ = useChildRecord(child?.id);
  const record = recordQ.data;
  const t = useTranslations('states');
  const gate = useGate([recordQ], !child || !record);
  if (gate || !child || !record) return gate;
  const entry = entryId ? record.customVaccines.find((c) => c.id === entryId) : undefined;
  if (entryId && !entry) {
    return <NotFoundState title={t('entryNotFound')} href={`/child/${childId}`} linkLabel={t('backToChild')} />;
  }
  return <CustomForm key={entry?.updatedAt ?? 'new'} child={child} entry={entry} />;
}

function CustomForm({ child, entry }: { child: SetUpChild; entry?: CustomVaccineEntry }) {
  const t = useTranslations('custom');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const uid = useId();
  const base = `/child/${child.id}`;

  const [nameAsWritten, setName] = useState(entry?.nameAsWritten ?? search.get('name') ?? '');
  const [country, setCountry] = useState(entry?.country ?? '');
  const [dateGiven, setDate] = useState<DateInput>(() =>
    entry
      ? {
          year: String(entry.dateGiven.year),
          month: String(entry.dateGiven.month),
          day: entry.dateGiven.day ? String(entry.dateGiven.day) : '',
        }
      : emptyDateInput,
  );
  const [doseNotes, setDoseNotes] = useState(entry?.doseNotes ?? '');
  const [doctorNote, setDoctorNote] = useState('');
  // New entries only: ask the pediatrician how it fits the schedule (checked by default).
  const [askFit, setAskFit] = useState(true);
  const [confirmed, setConfirmed] = useState(entry?.pediatricianConfirmed ?? false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLSelectElement | HTMLInputElement>(null);

  const result = validateCustomVaccine({ nameAsWritten, dateGiven }, { dob: child.dateOfBirth, today: todayISO() });
  const errors = submitted ? result.errors : {};
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: queryKeys.record(child.id) }), qc.invalidateQueries({ queryKey: queryKeys.questions(child.id) })]);

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        nameAsWritten: nameAsWritten.trim(),
        country: country.trim() || undefined,
        dateGiven: result.parts!,
        doseNotes: doseNotes.trim() || undefined,
        pediatricianConfirmed: confirmed,
        source: entry?.source ?? ('manual' as const),
      };
      const saved = entry
        ? await api.customVaccines.patch(child.id, entry.id, {
            ...fields,
            updatedAt: entry.updatedAt,
          })
        : await api.customVaccines.create(child.id, fields);
      if (!entry && askFit) {
        // The "how does it fit" question (SPEC.md §6.4d adds it always; here the caregiver can opt out).
        await api.questions.create(child.id, {
          text: fields.country
            ? t('autoQuestionCountry', {
                name: fields.nameAsWritten,
                country: fields.country,
              })
            : t('autoQuestion', { name: fields.nameAsWritten }),
          customVaccineId: saved.id,
          origin: 'customVaccine',
        });
      }
      if (doctorNote.trim()) {
        await api.questions.create(child.id, {
          text: doctorNote.trim(),
          customVaccineId: saved.id,
          origin: 'customVaccine',
        });
      }
    },
    onSettled: refresh,
    onSuccess: () => router.push(base),
  });

  const remove = useMutation({
    mutationFn: () => api.customVaccines.remove(child.id, entry!.id),
    onSettled: refresh,
    onSuccess: () => router.push(base),
  });

  const conflict = save.error instanceof ApiError && save.error.isConflict;
  const busy = save.isPending || remove.isPending;

  function onSave() {
    setSubmitted(true);
    if (!result.valid) {
      (result.errors.nameAsWritten ? nameRef : dateRef).current?.focus();
      return;
    }
    save.mutate();
  }

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
        <h1>{entry ? t('titleEdit') : t('title')}</h1>
        <p className={s.sub}>{t('intro')}</p>
      </header>

      <fieldset
        className={s.statusGroup}
        disabled={busy}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div className={s.field}>
          <label htmlFor={`${uid}-name`} className={s.label}>
            {t('nameAsWritten')}
          </label>
          <input
            ref={nameRef}
            id={`${uid}-name`}
            className={s.input}
            autoComplete="off"
            value={nameAsWritten}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.nameAsWritten}
            aria-describedby={`${uid}-name-hint${errors.nameAsWritten ? ` ${uid}-name-error` : ''}`}
          />
          <p id={`${uid}-name-hint`} className={s.hint}>
            {t('nameHint')}
          </p>
          {errors.nameAsWritten && (
            <p id={`${uid}-name-error`} className={s.error}>
              <AlertIcon />
              {t(`errors.${errors.nameAsWritten}`)}
            </p>
          )}
        </div>

        <div className={s.field}>
          <label htmlFor={`${uid}-country`} className={s.label}>
            {t('country')}
          </label>
          <input id={`${uid}-country`} className={s.input} autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>

        <div className={s.field}>
          <DateFields
            legend={t('dateGiven')}
            dayOptional
            firstRef={dateRef}
            value={dateGiven}
            onChange={setDate}
            invalid={!!errors.dateGiven}
            describedBy={errors.dateGiven ? `${uid}-date-error` : undefined}
          />
          {errors.dateGiven && (
            <p id={`${uid}-date-error`} className={s.error}>
              <AlertIcon />
              {t(`errors.${errors.dateGiven}`)}
            </p>
          )}
        </div>

        <div className={s.field}>
          <label htmlFor={`${uid}-notes`} className={s.label}>
            {t('doseNotes')}
          </label>
          <textarea
            id={`${uid}-notes`}
            className={s.textarea}
            value={doseNotes}
            onChange={(e) => setDoseNotes(e.target.value)}
            aria-describedby={`${uid}-notes-hint`}
          />
          <p id={`${uid}-notes-hint`} className={s.hint}>
            {t('doseNotesHint')}
          </p>
        </div>

        <div className={s.field}>
          <label htmlFor={`${uid}-doctor`} className={s.label}>
            {t('doctorNote')}
          </label>
          <textarea id={`${uid}-doctor`} className={s.textarea} value={doctorNote} onChange={(e) => setDoctorNote(e.target.value)} />
          <p className={s.hint}>{t('doctorNoteHint')}</p>
        </div>

        {!entry && (
          <label className={s.check}>
            <input type="checkbox" checked={askFit} onChange={(e) => setAskFit(e.target.checked)} />
            <span>{t('askFit')}</span>
          </label>
        )}

        {entry && (
          <label className={s.check}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>{t('pediatricianConfirmed')}</span>
          </label>
        )}
      </fieldset>

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

      {entry &&
        (confirmDelete ? (
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
        ))}

      <div className={s.actions}>
        <div className={s.actionsInner}>
          <Link href={entry ? base : `${base}/add`} className="btn">
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
