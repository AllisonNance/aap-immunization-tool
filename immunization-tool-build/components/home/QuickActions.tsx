'use client';
// Home quick actions: Record, Appointment and Question, each opening a popup.
// Record picks the child, then goes to Add to record (4a) for that child.
// Appointment and Question are saved right in the popup (no redirect) to the
// child's account data, so they show on that child's schedule page (2) and in
// Visit Prep (5); a toast above the tab bar confirms it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { AlertIcon, PlusIcon } from '@/components/shell/icons';
import { Modal } from '@/components/ui/Modal';
import { Toast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { useCreateQuestion, useUpdateChild } from '@/lib/api/hooks';
import type { SetUpChild } from '@/lib/api/schemas';
import { catalog } from '@/lib/data';
import { checkDateInput, compareISO, emptyDateInput, isoToDateInput, todayISO, type DateInput } from '@/lib/dates';
import s from './home.module.css';

type Which = 'record' | 'appointment' | 'question';

export function QuickActions({ kids }: { kids: SetUpChild[] }) {
  const t = useTranslations('home.quick');
  const router = useRouter();
  const [open, setOpen] = useState<Which | null>(null);
  const [saved, setSaved] = useState<{ text: string; child: SetUpChild; n: number } | null>(null);

  function start(which: Which) {
    setSaved(null);
    // One child: nothing to choose, go straight to their record page.
    if (which === 'record' && kids.length === 1) return router.push(`/child/${kids[0].id}/add?from=%2F`);
    setOpen(which);
  }

  return (
    <>
      <div className={s.quick} role="group" aria-label={t('label')}>
        {(['record', 'appointment', 'question'] as const).map((w) => (
          <button key={w} type="button" className={`btn ${s.quickBtn}`} aria-haspopup="dialog" onClick={() => start(w)}>
            {t(w)}
            <PlusIcon />
          </button>
        ))}
      </div>
      {saved && (
        // Keyed per save, so a second save restarts the timer.
        <Toast key={saved.n} onDone={() => setSaved(null)}>
          {saved.text} <Link href={`/child/${saved.child.id}`}>{t('viewSchedule', { name: saved.child.name })}</Link>
        </Toast>
      )}

      {open === 'record' && <RecordDialog kids={kids} onClose={() => setOpen(null)} />}
      {open === 'appointment' && (
        <AppointmentDialog
          kids={kids}
          onClose={() => setOpen(null)}
          onSaved={(child, text) => {
            setOpen(null);
            setSaved((p) => ({ child, text, n: (p?.n ?? 0) + 1 }));
          }}
        />
      )}
      {open === 'question' && (
        <QuestionDialog
          kids={kids}
          onClose={() => setOpen(null)}
          onSaved={(child, text) => {
            setOpen(null);
            setSaved((p) => ({ child, text, n: (p?.n ?? 0) + 1 }));
          }}
        />
      )}
    </>
  );
}

/** Record: choose the child, then go to their Add to record page (the editing banner shows the child). */
function RecordDialog({ kids, onClose }: { kids: SetUpChild[]; onClose(): void }) {
  const t = useTranslations('home.quick');
  const router = useRouter();
  const promptId = useId();
  return (
    <Modal title={t('recordTitle')} onClose={onClose} testId="record-dialog">
      <div role="group" aria-labelledby={promptId} className={s.pickList}>
        <p id={promptId} className={s.pickPrompt}>
          {t('recordPrompt')}
        </p>
        <ul>
          {kids.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="btn btn-block"
                onClick={() => {
                  onClose();
                  router.push(`/child/${c.id}/add?from=%2F`);
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

/** Which child: radio cards; preselected when there's only one. */
function ChildChoice(props: { legend: string; kids: SetUpChild[]; value: string; onChange(id: string): void; error?: string; firstRef?: React.Ref<HTMLInputElement> }) {
  const { legend, kids, value, onChange, error, firstRef } = props;
  const name = useId();
  return (
    <fieldset className={s.choiceSet} aria-describedby={error ? `${name}-err` : undefined}>
      <legend className={s.fieldLabel}>{legend}</legend>
      <div className={s.choices}>
        {kids.map((c, i) => (
          <label key={c.id} className={s.choice}>
            <input ref={i === 0 ? firstRef : undefined} type="radio" name={name} value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-err`} className={s.fieldError}>
          <AlertIcon />
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Buttons({ busy, onCancel }: { busy: boolean; onCancel(): void }) {
  const t = useTranslations('home.quick');
  return (
    <>
      <button type="button" className="btn" onClick={onCancel}>
        {t('cancel')}
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? t('saving') : t('save')}
      </button>
    </>
  );
}

const upcoming = (iso?: string) => (iso && compareISO(iso, todayISO()) >= 0 ? iso : undefined);

/** Appointment: child + month / day / year of the next appointment, saved in place. */
function AppointmentDialog({ kids, onClose, onSaved }: { kids: SetUpChild[]; onClose(): void; onSaved(child: SetUpChild, text: string): void }) {
  const t = useTranslations('home.quick');
  const tVisit = useTranslations('visitPrep');
  const tErr = useTranslations('errors');
  const text = useScheduleText();
  const update = useUpdateChild();
  const uid = useId();
  const [childId, setChildId] = useState(kids.length === 1 ? kids[0].id : '');
  const child = kids.find((c) => c.id === childId);
  const [date, setDate] = useState<DateInput>(() => {
    const iso = upcoming(child?.nextAppointment);
    return iso ? isoToDateInput(iso) : emptyDateInput;
  });
  const [errors, setErrors] = useState<{ child?: string; date?: string }>({});
  const childRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLSelectElement | HTMLInputElement>(null);

  function pick(id: string) {
    setChildId(id);
    setErrors((e) => ({ ...e, child: undefined }));
    // Start from that child's next appointment, if one is set.
    const iso = upcoming(kids.find((c) => c.id === id)?.nextAppointment);
    setDate(iso ? isoToDateInput(iso) : emptyDateInput);
  }

  function submit() {
    const next: typeof errors = {};
    if (!child) next.child = t('errors.childRequired');
    const c = checkDateInput(date);
    let iso: string | undefined;
    if (c.kind === 'empty' || c.kind === 'incomplete') next.date = tVisit('errors.dateRequired');
    else if (c.kind === 'invalid') next.date = tVisit('errors.dateInvalid');
    else if (compareISO(c.iso, todayISO()) < 0) next.date = tVisit('errors.inPast');
    else iso = c.iso;
    setErrors(next);
    if (!child || !iso) {
      (next.child ? childRef : dateRef).current?.focus();
      return;
    }
    const when = iso;
    update.mutate(
      { id: child.id, patch: { nextAppointment: when, updatedAt: child.updatedAt } },
      { onSuccess: () => onSaved(child, t('appointmentSaved', { name: child.name, date: text.date(when) })) },
    );
  }

  const conflict = update.error instanceof ApiError && update.error.isConflict;
  return (
    <Modal
      title={t('appointmentTitle')}
      onClose={onClose}
      testId="appointment-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={<Buttons busy={update.isPending} onCancel={onClose} />}
    >
      <ChildChoice legend={t('appointmentChild')} kids={kids} value={childId} onChange={pick} error={errors.child} firstRef={childRef} />
      <div>
        <DateFields
          legend={t('appointmentDate')}
          value={date}
          firstRef={dateRef}
          onChange={(v) => {
            setDate(v);
            setErrors((e) => ({ ...e, date: undefined }));
          }}
          invalid={!!errors.date}
          describedBy={errors.date ? `${uid}-date-err` : undefined}
        />
        {errors.date && (
          <p id={`${uid}-date-err`} className={s.fieldError}>
            <AlertIcon />
            {errors.date}
          </p>
        )}
      </div>
      {update.isError && (
        <p role="alert" className={s.formError}>
          {conflict ? t('errors.conflict') : tErr('saveFailed')}
        </p>
      )}
    </Modal>
  );
}

/**
 * Question: child, an optional vaccine, and the question; saved in place.
 * Also opened from a vaccine page (6a) with that page's child and vaccine preselected.
 */
export function QuestionDialog(props: {
  kids: SetUpChild[];
  onClose(): void;
  onSaved(child: SetUpChild, text: string): void;
  initialChildId?: string;
  initialVaccineId?: string;
  origin?: 'manual' | 'vaccineDetail';
}) {
  const { kids, onClose, onSaved, initialChildId, initialVaccineId, origin = 'manual' } = props;
  const t = useTranslations('home.quick');
  const tErr = useTranslations('errors');
  const text = useScheduleText();
  const uid = useId();
  const [childId, setChildId] = useState(initialChildId ?? (kids.length === 1 ? kids[0].id : ''));
  const child = kids.find((c) => c.id === childId);
  const create = useCreateQuestion(childId);
  const [vaccineId, setVaccineId] = useState(initialVaccineId ?? '');
  const [question, setQuestion] = useState('');
  const [errors, setErrors] = useState<{ child?: string; question?: string }>({});
  const childRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const next: typeof errors = {};
    if (!child) next.child = t('errors.childRequired');
    if (!question.trim()) next.question = t('errors.questionRequired');
    setErrors(next);
    if (!child || next.question) {
      (next.child ? childRef : questionRef).current?.focus();
      return;
    }
    create.mutate(
      { text: question.trim(), vaccineId: vaccineId || undefined, origin },
      { onSuccess: () => onSaved(child, t('questionSaved', { name: child.name })) },
    );
  }

  return (
    <Modal
      title={t('questionTitle')}
      onClose={onClose}
      testId="question-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={<Buttons busy={create.isPending} onCancel={onClose} />}
    >
      <ChildChoice
        legend={t('questionChild')}
        kids={kids}
        value={childId}
        onChange={(id) => {
          setChildId(id);
          setErrors((e) => ({ ...e, child: undefined }));
        }}
        error={errors.child}
        firstRef={childRef}
      />
      <div className={s.field}>
        <label htmlFor={`${uid}-vaccine`} className={s.fieldLabel}>
          {t('vaccine')}
        </label>
        <select id={`${uid}-vaccine`} className={s.select} value={vaccineId} onChange={(e) => setVaccineId(e.target.value)}>
          <option value="">{t('vaccineNone')}</option>
          {catalog.vaccines.map((v) => (
            <option key={v.id} value={v.id}>
              {text.vaccineName(v.id)}
            </option>
          ))}
        </select>
      </div>
      <div className={s.field}>
        <label htmlFor={`${uid}-question`} className={s.fieldLabel}>
          {t('questionLabel')}
        </label>
        <textarea
          ref={questionRef}
          id={`${uid}-question`}
          className={s.textarea}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            setErrors((x) => ({ ...x, question: undefined }));
          }}
          aria-invalid={!!errors.question || undefined}
          aria-describedby={errors.question ? `${uid}-question-err` : undefined}
        />
        {errors.question && (
          <p id={`${uid}-question-err`} className={s.fieldError}>
            <AlertIcon />
            {errors.question}
          </p>
        )}
      </div>
      {create.isError && (
        <p role="alert" className={s.formError}>
          {tErr('saveFailed')}
        </p>
      )}
    </Modal>
  );
}
