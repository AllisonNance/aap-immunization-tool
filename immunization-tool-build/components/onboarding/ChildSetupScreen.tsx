'use client';
// Screen 1c · Child Setup, cycled (SPEC.md §6.1c, extended): the child's first
// name as the title, then first name, month + year of birth (no day), whether
// they're on a delayed or alternate schedule, whether they've lived outside the
// US, and reminders for this child. Each child saves on Next; leaving and
// logging in again resumes at the first unfinished child (the route guard).
// Back keeps unsaved values in the in-memory query cache only (never browser
// storage, SPEC.md §5a).
import { useGate } from '@/components/states/States';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { use, useId, useRef, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import { AlertIcon } from '@/components/shell/icons';
import { ApiError } from '@/lib/api/client';
import { useChildren, useCompleteOnboarding, useReminders, useSetChildReminders, useUpdateChild } from '@/lib/api/hooks';
import type { Child } from '@/lib/api/schemas';
import { isoToDateInput, todayISO, type DateInput } from '@/lib/dates';
import { safeNext } from '@/lib/guards';
import { validateChildBasics } from '@/lib/validation/child';
import { setupHref } from './AddChildrenScreen';
import s from './onboarding.module.css';

const draftKey = (id: string) => ['setupDraft', id] as const;

interface SetupValues {
  name: string;
  birth: DateInput; // month + year
  alternateSchedule: '' | 'yes' | 'no' | 'notSure';
  livedOutsideUs: '' | 'yes' | 'no';
  reminders: boolean;
}

export function ChildSetupScreen({ mode, params }: { mode: 'onboarding' | 'later'; params: Promise<{ childId: string }> }) {
  const t = useTranslations('childSetup');
  // This route instance's own params. useParams() follows the current URL, and
  // Next keeps the previous step mounted (hidden), so it would re-render as the
  // visible child and churn per-child form state.
  const { childId } = use(params);
  const search = useSearchParams();
  const childrenQ = useChildren();
  const remindersQ = useReminders();
  const children = childrenQ.data;
  const reminders = remindersQ.data;
  const [conflict, setConflict] = useState(false);
  const gate = useGate([childrenQ, remindersQ], !children || !reminders);

  if (gate || !children || !reminders) return gate;
  const start = mode === 'later' ? Number(search.get('start') ?? 0) : 0;
  const from = safeNext(search.get('from')) ?? '/';
  const cycle = [...children].filter((c) => c.setupOrder >= start).sort((a, b) => a.setupOrder - b.setupOrder);
  const index = cycle.findIndex((c) => c.id === childId);
  if (index < 0) return null; // the shell shows not-found for unknown ids

  const child = cycle[index];
  const nav = { start, from };
  return (
    // Remount on a new child, or when a reload after 409 brings a newer record.
    <SetupForm
      key={`${child.id}:${child.updatedAt}`}
      progress={t('progress', { current: index + 1, total: cycle.length })}
      conflict={conflict}
      child={child}
      remindersOn={!!reminders.perChild[child.id]}
      mode={mode}
      prevHref={index > 0 ? setupHref(mode, cycle[index - 1].id, nav) : null}
      nextHref={index < cycle.length - 1 ? setupHref(mode, cycle[index + 1].id, nav) : null}
      finishHref={mode === 'onboarding' ? '/' : from}
      onConflict={() => setConflict(true)}
    />
  );
}

function SetupForm(props: {
  progress: string;
  conflict: boolean;
  child: Child;
  remindersOn: boolean;
  mode: 'onboarding' | 'later';
  prevHref: string | null;
  nextHref: string | null;
  finishHref: string;
  onConflict(): void;
}) {
  const { progress, conflict, child, remindersOn, mode, prevHref, nextHref, finishHref, onConflict } = props;
  const t = useTranslations('childSetup');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const qc = useQueryClient();
  const update = useUpdateChild();
  const setReminders = useSetChildReminders();
  const onboarding = useCompleteOnboarding();

  const [values, setValues] = useState<SetupValues>(
    () =>
      qc.getQueryData<SetupValues>(draftKey(child.id)) ?? {
        name: child.name,
        birth: { ...isoToDateInput(child.dateOfBirth), day: '' },
        alternateSchedule: child.alternateSchedule ?? '',
        livedOutsideUs: child.livedOutsideUs ?? '',
        reminders: remindersOn,
      },
  );
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLSelectElement | HTMLInputElement>(null);
  // Unique ids: Next keeps the previous step mounted (hidden), so fixed ids would collide.
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    nameErr: `${uid}-name-error`,
    birthErr: `${uid}-birth-error`,
    birthWarn: `${uid}-birth-warning`,
    reminders: `${uid}-reminders`,
    remindersHint: `${uid}-reminders-hint`,
  };

  const { errors, warnings, valid, dobISO } = validateChildBasics({ name: values.name, birth: values.birth }, todayISO());
  const showErrors = submitted ? errors : {};
  const isLast = nextHref === null;
  const saving = update.isPending || onboarding.isPending || setReminders.isPending;
  // First name as the page title; falls back to the saved name while the field is empty.
  const displayName = values.name.trim() || child.name;

  function set<K extends keyof SetupValues>(key: K, value: SetupValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaveError(false);
  }

  function back() {
    if (!prevHref) return;
    qc.setQueryData(draftKey(child.id), values); // values kept for when they return
    router.push(prevHref);
  }

  async function next() {
    setSubmitted(true);
    if (!valid || !dobISO) {
      // Focus the first field with an error (SPEC.md §9).
      (errors.name ? nameRef : birthRef).current?.focus();
      return;
    }
    // Keep a full date already on file (e.g. from My Account) if the month and year didn't change.
    const sameMonth = child.dateOfBirth?.slice(0, 7) === dobISO.slice(0, 7);
    try {
      // Reminders first: saving the child remounts this form with its new version.
      await setReminders.mutateAsync({
        childId: child.id,
        on: values.reminders,
      });
      await update.mutateAsync({
        id: child.id,
        patch: {
          name: values.name.trim(),
          dateOfBirth: sameMonth ? child.dateOfBirth : dobISO,
          dateOfBirthPrecision: sameMonth ? child.dateOfBirthPrecision : 'month',
          alternateSchedule: values.alternateSchedule || undefined,
          livedOutsideUs: values.livedOutsideUs || undefined,
          setupComplete: true,
          updatedAt: child.updatedAt,
        },
      });
      qc.removeQueries({ queryKey: draftKey(child.id) });
      if (!isLast) {
        router.push(nextHref);
        return;
      }
      if (mode === 'onboarding') await onboarding.complete();
      router.replace(finishHref);
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        qc.removeQueries({ queryKey: draftKey(child.id) });
        onConflict();
      } else {
        setSaveError(true);
      }
    }
  }

  return (
    <form
      className={s.screen}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <p className={s.progress}>{progress}</p>
      {conflict && (
        <p role="alert" className={s.notice}>
          {t('conflict')}
        </p>
      )}
      <header className={s.titleBlock}>
        <h1>{displayName}</h1>
        <p className={s.subtitle}>{t('subtitle')}</p>
      </header>

      <fieldset className={s.fields} disabled={saving}>
        <div className={s.field}>
          <label className={s.label} htmlFor={ids.name}>
            {t('name')}
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            className={s.input}
            autoComplete="off"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={!!showErrors.name}
            aria-describedby={showErrors.name ? ids.nameErr : undefined}
          />
          {showErrors.name && (
            <p id={ids.nameErr} className={s.error}>
              <AlertIcon />
              {t(showErrors.name)}
            </p>
          )}
        </div>

        <div className={s.field}>
          <DateFields
            legend={t('birth')}
            monthYearOnly
            firstRef={birthRef}
            value={values.birth}
            onChange={(v) => set('birth', v)}
            invalid={!!showErrors.birth}
            describedBy={showErrors.birth ? ids.birthErr : warnings.birth ? ids.birthWarn : undefined}
          />
          {showErrors.birth && (
            <p id={ids.birthErr} className={s.error}>
              <AlertIcon />
              {t(showErrors.birth)}
            </p>
          )}
          {!showErrors.birth && warnings.birth && (
            <p id={ids.birthWarn} className={s.warning}>
              <AlertIcon />
              {t(warnings.birth)}
            </p>
          )}
        </div>

        <RadioQuestion
          legend={t('scheduleQuestion', { name: displayName })}
          hint={t('scheduleHint')}
          value={values.alternateSchedule}
          options={[
            ['yes', t('yes')],
            ['no', t('no')],
            ['notSure', t('notSure')],
          ]}
          onChange={(v) => set('alternateSchedule', v as SetupValues['alternateSchedule'])}
        />

        <RadioQuestion
          legend={t('abroadQuestion', { name: displayName })}
          value={values.livedOutsideUs}
          options={[
            ['yes', t('yes')],
            ['no', t('no')],
          ]}
          onChange={(v) => set('livedOutsideUs', v as SetupValues['livedOutsideUs'])}
        />

        <div className={s.field}>
          <h2 className={s.groupTitle}>{t('remindersHeading')}</h2>
          <label className={s.choice} htmlFor={ids.reminders}>
            <input
              id={ids.reminders}
              type="checkbox"
              checked={values.reminders}
              onChange={(e) => set('reminders', e.target.checked)}
              aria-describedby={ids.remindersHint}
            />
            <span className={s.choiceText}>
              <span className={s.choiceTitle}>{t('remindersLabel', { name: displayName })}</span>
              <span id={ids.remindersHint} className={s.choiceSub}>
                {t('remindersHint')}
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {saveError && (
        <p role="alert" className={s.formError}>
          {tErr('saveFailed')}
        </p>
      )}

      <div className={s.actions}>
        <div className={s.actionsInner}>
          {prevHref && (
            <button type="button" className="btn" onClick={back} disabled={saving}>
              {t('back')}
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('saving') : isLast ? t('finish') : t('next')}
          </button>
        </div>
      </div>
    </form>
  );
}

/** A labeled set of radio options in a row (Yes / No / Not sure). Optional to answer. */
function RadioQuestion(props: { legend: string; hint?: string; value: string; options: Array<[value: string, label: string]>; onChange(value: string): void }) {
  const { legend, hint, value, options, onChange } = props;
  const name = useId(); // unique: hidden copies of this page stay mounted
  return (
    <fieldset className={s.question} aria-describedby={hint ? `${name}-hint` : undefined}>
      <legend className={s.label}>{legend}</legend>
      {hint && (
        <p id={`${name}-hint`} className={s.hint}>
          {hint}
        </p>
      )}
      <div className={s.options}>
        {options.map(([v, label]) => (
          <label key={v} className={s.option}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
