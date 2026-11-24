'use client';
// Screen 3 · Edit Child (SPEC.md §6.3). First name, birth month + year, medical
// conditions, pediatrician, records from abroad, the Child Setup answers, and
// prior reactions. A birth-date change that makes recorded doses look wrong
// (before birth, too early, too close together) is listed before saving
// (§7 rule 11). Remove child has an in-page confirmation.
import { useGate } from '@/components/states/States';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { use, useId, useRef, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import s from '@/components/record/record.module.css';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { AlertIcon } from '@/components/shell/icons';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { api, ApiError } from '@/lib/api';
import { queryKeys, useChildRecord, useUpdateChild } from '@/lib/api/hooks';
import type { ChildRecord, SetUpChild } from '@/lib/api/schemas';
import { schedule } from '@/lib/data';
import { isoToDateInput, todayISO } from '@/lib/dates';
import { computeChildSchedule } from '@/lib/schedule';
import { validateChildBasics } from '@/lib/validation/child';
import { formatPhone, validatePhone } from '@/lib/validation/contact';

export function EditChildScreen({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = use(params);
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const recordQ = useChildRecord(child?.id);
  const record = recordQ.data;
  const gate = useGate([recordQ], !child || !record);
  if (gate || !child || !record) return gate;
  return <EditForm key={child.updatedAt} child={child} record={record} />;
}

type YesNo = '' | 'yes' | 'no';

function EditForm({ child, record }: { child: SetUpChild; record: ChildRecord }) {
  const t = useTranslations('editChild');
  const tSetup = useTranslations('childSetup');
  const tErr = useTranslations('errors');
  const text = useScheduleText();
  const router = useRouter();
  const qc = useQueryClient();
  const update = useUpdateChild();
  const uid = useId();
  const base = `/child/${child.id}`;

  const [name, setName] = useState(child.name);
  const [birth, setBirth] = useState(() => ({
    ...isoToDateInput(child.dateOfBirth),
    day: '',
  }));
  const [conditions, setConditions] = useState(child.medicalConditions ?? '');
  const [pedName, setPedName] = useState(child.pediatrician?.name ?? '');
  const [pedPhone, setPedPhone] = useState(child.pediatrician?.phone ?? '');
  const [pedPractice, setPedPractice] = useState(child.pediatrician?.practice ?? '');
  const [abroad, setAbroad] = useState<YesNo>(child.recordsFromAbroad === undefined ? '' : child.recordsFromAbroad ? 'yes' : 'no');
  const [alternate, setAlternate] = useState<'' | 'yes' | 'no' | 'notSure'>(child.alternateSchedule ?? '');
  const [lived, setLived] = useState<YesNo>(child.livedOutsideUs ?? '');
  const [reactions, setReactions] = useState(child.priorReactions ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLSelectElement | HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const today = todayISO();
  const basics = validateChildBasics({ name, birth }, today);
  const phoneError = pedPhone.trim() ? validatePhone(pedPhone) : null;
  const showErrors = submitted ? basics.errors : {};
  // Keep a full date on file if the month and year didn't change.
  const sameMonth = basics.dobISO && child.dateOfBirth.slice(0, 7) === basics.dobISO.slice(0, 7);
  const newDob = sameMonth ? child.dateOfBirth : basics.dobISO;

  // Rule 11: doses that become invalid with the new birth date.
  const affected = (() => {
    if (!newDob || newDob === child.dateOfBirth) return [];
    const run = (dob: string) =>
      computeChildSchedule({
        child: { dateOfBirth: dob, createdAt: child.createdAt },
        doses: record.doses,
        exemptions: record.exemptions,
        schedule,
        today,
      }).invalidDoses;
    const before = new Set(run(child.dateOfBirth).map((d) => `${d.vaccineId}-${d.doseNumber}`));
    return run(newDob).filter((d) => !before.has(`${d.vaccineId}-${d.doseNumber}`));
  })();
  const needsAck = affected.length > 0 && acknowledged !== newDob;

  const remove = useMutation({
    mutationFn: () => api.children.remove(child.id),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: queryKeys.record(child.id) });
      qc.removeQueries({ queryKey: queryKeys.questions(child.id) });
      await qc.invalidateQueries({ queryKey: queryKeys.children });
      router.replace('/');
    },
  });

  function onSave() {
    setSubmitted(true);
    if (!basics.valid || phoneError) {
      (basics.errors.name ? nameRef : basics.errors.birth ? birthRef : phoneRef).current?.focus();
      return;
    }
    if (needsAck) {
      setAcknowledged(newDob!); // first press shows the list; the next saves
      return;
    }
    const pediatrician =
      pedName.trim() || pedPhone.trim() || pedPractice.trim()
        ? {
            name: pedName.trim() || undefined,
            phone: pedPhone.trim() ? formatPhone(pedPhone) : undefined,
            practice: pedPractice.trim() || undefined,
          }
        : undefined;
    update.mutate(
      {
        id: child.id,
        patch: {
          name: name.trim(),
          dateOfBirth: newDob,
          dateOfBirthPrecision: sameMonth ? child.dateOfBirthPrecision : 'month',
          medicalConditions: conditions.trim(),
          pediatrician: pediatrician ?? {},
          recordsFromAbroad: abroad ? abroad === 'yes' : undefined,
          alternateSchedule: alternate || undefined,
          livedOutsideUs: lived || undefined,
          priorReactions: reactions.trim(),
          updatedAt: child.updatedAt,
        },
      },
      { onSuccess: () => router.push(base) },
    );
  }

  const conflict = update.error instanceof ApiError && update.error.isConflict;
  const busy = update.isPending || remove.isPending;
  const radios = (legend: string, value: string, set: (v: never) => void, options: string[]) => (
    <fieldset className={s.statusGroup}>
      <legend className={s.label}>{legend}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {options.map((o) => (
          <label key={o} className={s.radioRow} style={{ margin: 0 }}>
            <input type="radio" name={`${uid}-${legend}`} checked={value === o} onChange={() => set(o as never)} />
            <span>{tSetup(o as 'yes')}</span>
          </label>
        ))}
      </div>
    </fieldset>
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
        <h1>{t('title', { name: child.name })}</h1>
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
            {tSetup('name')}
          </label>
          <input
            ref={nameRef}
            id={`${uid}-name`}
            className={s.input}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!showErrors.name}
            aria-describedby={showErrors.name ? `${uid}-name-err` : undefined}
          />
          {showErrors.name && (
            <p id={`${uid}-name-err`} className={s.error}>
              <AlertIcon />
              {tSetup(showErrors.name)}
            </p>
          )}
        </div>

        <div className={s.field}>
          <DateFields
            legend={tSetup('birth')}
            monthYearOnly
            firstRef={birthRef}
            value={birth}
            onChange={(v) => {
              setBirth(v);
              setAcknowledged(null);
            }}
            invalid={!!showErrors.birth}
            describedBy={showErrors.birth ? `${uid}-birth-err` : undefined}
          />
          {showErrors.birth && (
            <p id={`${uid}-birth-err`} className={s.error}>
              <AlertIcon />
              {tSetup(showErrors.birth)}
            </p>
          )}
          {affected.length > 0 && (
            <div className={s.confirmBox} role="alert">
              <p>{t('dobWarning', { count: affected.length })}</p>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                {affected.map((d) => (
                  <li key={`${d.vaccineId}-${d.doseNumber}`}>
                    {text.vaccineName(d.vaccineId)} · {text.doseLabel(d.doseNumber)}
                    {d.record?.dateGiven ? ` (${text.date(d.record.dateGiven)})` : ''}: {d.issues.map((i) => t(`issues.${i}`)).join(', ')}
                  </li>
                ))}
              </ul>
              <p className={s.helper}>{t('dobWarningHelp')}</p>
            </div>
          )}
        </div>

        <div className={s.field}>
          <label htmlFor={`${uid}-cond`} className={s.label}>
            {t('conditions')}
          </label>
          <textarea id={`${uid}-cond`} className={s.textarea} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </div>

        <fieldset
          className={s.statusGroup}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <legend className={s.label}>{t('pediatrician')}</legend>
          <div className={s.field}>
            <label htmlFor={`${uid}-pn`}>{t('pedName')}</label>
            <input id={`${uid}-pn`} className={s.input} value={pedName} onChange={(e) => setPedName(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor={`${uid}-pp`}>{t('pedPractice')}</label>
            <input id={`${uid}-pp`} className={s.input} value={pedPractice} onChange={(e) => setPedPractice(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor={`${uid}-ph`}>{t('pedPhone')}</label>
            <input
              ref={phoneRef}
              id={`${uid}-ph`}
              className={s.input}
              type="tel"
              autoComplete="off"
              value={pedPhone}
              onChange={(e) => setPedPhone(e.target.value)}
              aria-invalid={submitted && !!phoneError}
              aria-describedby={submitted && phoneError ? `${uid}-ph-err` : undefined}
            />
            {submitted && phoneError && (
              <p id={`${uid}-ph-err`} className={s.error}>
                <AlertIcon />
                {t('phoneInvalid')}
              </p>
            )}
          </div>
        </fieldset>

        {radios(t('recordsFromAbroad'), abroad, setAbroad, ['yes', 'no'])}
        {radios(tSetup('scheduleQuestion', { name: name.trim() || child.name }), alternate, setAlternate, ['yes', 'no', 'notSure'])}
        {radios(tSetup('abroadQuestion', { name: name.trim() || child.name }), lived, setLived, ['yes', 'no'])}

        <div className={s.field}>
          <label htmlFor={`${uid}-react`} className={s.label}>
            {t('reactions')}
          </label>
          <textarea id={`${uid}-react`} className={s.textarea} value={reactions} onChange={(e) => setReactions(e.target.value)} />
        </div>
      </fieldset>

      {conflict && (
        <p role="alert" className={s.formError}>
          {t('conflict')}
        </p>
      )}
      {(update.isError && !conflict) || remove.isError ? (
        <p role="alert" className={s.formError}>
          {tErr('saveFailed')}
        </p>
      ) : null}

      {confirmRemove ? (
        <div className={s.confirmBox} role="group" aria-label={t('removeConfirm', { name: child.name })}>
          <p>{t('removeConfirm', { name: child.name })}</p>
          <div className={s.actionsInner}>
            <button type="button" className="btn" onClick={() => setConfirmRemove(false)} disabled={busy}>
              {t('keep')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => remove.mutate()} disabled={busy}>
              {t('removeYes')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={s.dangerLink} onClick={() => setConfirmRemove(true)} disabled={busy}>
          {t('remove', { name: child.name })}
        </button>
      )}

      <div className={s.actions}>
        <div className={s.actionsInner}>
          <Link href={base} className="btn">
            {t('cancel')}
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {update.isPending ? t('saving') : affected.length && !needsAck ? t('saveAnyway') : t('save')}
          </button>
        </div>
      </div>
    </form>
  );
}
