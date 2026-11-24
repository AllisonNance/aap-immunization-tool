'use client';
// Screen 8 · Settings & Reminders (SPEC.md §6.8). Account (language, My
// Account, log out), Children (edit → 3, remove, add → 1b), Reminders (SMS /
// email opt-in with validation, lead time, per child, preview). In dev, a
// panel shows what the mock NotificationService "sent".
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useReminderText } from '@/components/settings/useReminderText';
import { AlertIcon } from '@/components/shell/icons';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { StatusPill } from '@/components/shell/StatusPill';
import { useAgeLabel } from '@/components/shell/useAgeLabel';
import { api } from '@/lib/api';
import { queryKeys, useAccount, useLogout, useReminders } from '@/lib/api/hooks';
import { useGate } from '@/components/states/States';
import type { ReminderPrefs, SetUpChild } from '@/lib/api/schemas';
import { apiMockingEnabled, entryPath, isDev, myAccountUrl } from '@/lib/config';
import { LEAD_TIMES, planReminders, reminderDoses } from '@/lib/reminders';
import { useChildSchedules } from '@/lib/schedule/useChildSchedule';
import { formatPhone, validateEmailAddress, validatePhone } from '@/lib/validation/contact';
import s from './settings.module.css';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const router = useRouter();
  const logout = useLogout();
  const { children } = useSelectedChild();
  const prefsQ = useReminders();
  const prefs = prefsQ.data;
  const prefsGate = useGate([prefsQ]);

  return (
    <div className={s.screen}>
      <h1>{t('title')}</h1>

      <section className={s.section} aria-labelledby="set-account">
        <h2 id="set-account">{t('account')}</h2>
        <div className={s.field}>
          <span className={s.label}>{t('language')}</span>
          <div>
            <LanguageToggle />
          </div>
        </div>
        <a href={myAccountUrl} className={s.textLink}>
          {t('myAccount')}
        </a>
        <button
          type="button"
          className="btn"
          disabled={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, {
              onSettled: () => router.replace(entryPath),
            })
          }
        >
          {t('logout')}
        </button>
      </section>

      <ChildrenList kids={children} />

      {/* Not keyed on updatedAt: a save mustn't reset the form (it would hide "Saved"). */}
      {prefsGate}
      {prefs && <RemindersForm prefs={prefs} kids={children} />}

      {isDev && apiMockingEnabled && prefs && <DevReminderPanel prefs={prefs} kids={children} />}
    </div>
  );
}

function ChildrenList({ kids: children }: { kids: SetUpChild[] }) {
  const t = useTranslations('settings');
  const ageLabel = useAgeLabel();
  const schedules = useChildSchedules(children);
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.children.remove(id),
    onSuccess: (_r, id) => {
      setConfirming(null);
      qc.removeQueries({ queryKey: queryKeys.record(id) });
      qc.invalidateQueries({ queryKey: queryKeys.children });
    },
  });

  return (
    <section className={s.section} aria-labelledby="set-children">
      <h2 id="set-children">{t('children')}</h2>
      {children.length === 0 && <p className={s.muted}>{t('noChildren')}</p>}
      <ul className={s.list} hidden={children.length === 0}>
        {children.map((c, i) => (
          <li key={c.id} className={s.child}>
            <div className={s.childHead}>
              <span className={s.childName}>{c.name}</span>
              {schedules[i] && <StatusPill status={schedules[i]!.status} />}
            </div>
            <span className={s.muted}>{ageLabel(c.dateOfBirth)}</span>
            <div className={s.childActions}>
              <Link href={`/child/${c.id}/edit`} className="btn" aria-label={t('editChild', { name: c.name })}>
                {t('edit')}
              </Link>
              <button type="button" className={s.linkButton} onClick={() => setConfirming(c.id)} aria-label={t('removeChild', { name: c.name })}>
                {t('remove')}
              </button>
            </div>
            {confirming === c.id && (
              <div className={s.confirm} role="group" aria-label={t('removeConfirm', { name: c.name })}>
                <p>{t('removeConfirm', { name: c.name })}</p>
                <div className={s.buttons}>
                  <button type="button" className="btn" onClick={() => setConfirming(null)}>
                    {t('keep')}
                  </button>
                  <button type="button" className="btn btn-primary" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>
                    {t('removeYes')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Link href="/children/add?from=%2Fsettings" className="btn btn-block">
        + {t('addChild')}
      </Link>
    </section>
  );
}

function RemindersForm({ prefs, kids: children }: { prefs: ReminderPrefs; kids: SetUpChild[] }) {
  const t = useTranslations('settings');
  const tR = useTranslations('reminders');
  const qc = useQueryClient();
  const uid = useId();
  const schedules = useChildSchedules(children);
  const reminderText = useReminderText();
  const [smsOn, setSmsOn] = useState(prefs.sms.enabled);
  const [phone, setPhone] = useState(prefs.sms.phone ?? '');
  const [emailOn, setEmailOn] = useState(prefs.email.enabled);
  const [email, setEmail] = useState(prefs.email.address ?? '');
  const [lead, setLead] = useState(prefs.leadTimeDays);
  const [perChild, setPerChild] = useState<Record<string, boolean>>(prefs.perChild);
  const [submitted, setSubmitted] = useState(false);

  const phoneError = smsOn ? validatePhone(phone) : null;
  const emailError = emailOn ? validateEmailAddress(email) : null;

  const save = useMutation({
    mutationFn: () =>
      api.reminders.put({
        ...prefs,
        sms: {
          enabled: smsOn,
          phone: phone.trim() ? formatPhone(phone) : undefined,
        },
        email: { enabled: emailOn, address: email.trim() || undefined },
        leadTimeDays: lead,
        perChild,
      }),
    onSuccess: (p) => qc.setQueryData(queryKeys.reminders, p),
  });

  // Preview: the first child with reminders on (or the first child).
  const previewIndex = Math.max(
    0,
    children.findIndex((c) => perChild[c.id]),
  );
  const previewChild = children[previewIndex];
  const previewSchedule = schedules[previewIndex];
  const previewDoses = previewSchedule ? reminderDoses(previewSchedule, lead) : [];
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const anyChannel = (smsOn && !phoneError) || (emailOn && !emailError);

  return (
    <section className={s.section} aria-labelledby="set-reminders">
      <h2 id="set-reminders">{t('reminders')}</h2>
      <p className={s.muted}>{t('remindersIntro')}</p>
      <form
        className={s.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (phoneError || emailError) return;
          save.mutate();
        }}
      >
        <div className={s.channel}>
          <label className={s.check}>
            <input type="checkbox" checked={smsOn} onChange={(e) => setSmsOn(e.target.checked)} />
            <span>{t('sms')}</span>
          </label>
          {smsOn && (
            <div className={s.field}>
              <label htmlFor={`${uid}-phone`} className={s.label}>
                {t('phone')}
              </label>
              <input
                id={`${uid}-phone`}
                type="tel"
                autoComplete="tel"
                className={s.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={submitted && !!phoneError}
                aria-describedby={submitted && phoneError ? `${uid}-phone-err` : undefined}
              />
              {submitted && phoneError && (
                <p id={`${uid}-phone-err`} className={s.error}>
                  <AlertIcon />
                  {t(`errors.${phoneError}`)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className={s.channel}>
          <label className={s.check}>
            <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} />
            <span>{t('email')}</span>
          </label>
          {emailOn && (
            <div className={s.field}>
              <label htmlFor={`${uid}-email`} className={s.label}>
                {t('emailAddress')}
              </label>
              <input
                id={`${uid}-email`}
                type="email"
                autoComplete="email"
                className={s.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={submitted && !!emailError}
                aria-describedby={submitted && emailError ? `${uid}-email-err` : undefined}
              />
              {submitted && emailError && (
                <p id={`${uid}-email-err`} className={s.error}>
                  <AlertIcon />
                  {t(`errors.${emailError}`)}
                </p>
              )}
            </div>
          )}
        </div>

        <fieldset className={s.fieldset}>
          <legend className={s.label}>{t('leadTime')}</legend>
          <div className={s.options}>
            {LEAD_TIMES.map((d) => (
              <label key={d} className={s.option}>
                <input type="radio" name={`${uid}-lead`} checked={lead === d} onChange={() => setLead(d)} />
                <span>{t('leadDays', { count: d })}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {children.length > 0 && (
          <fieldset className={s.fieldset}>
            <legend className={s.label}>{t('perChild')}</legend>
            {children.map((c) => (
              <label key={c.id} className={s.check}>
                <input type="checkbox" checked={!!perChild[c.id]} onChange={(e) => setPerChild((p) => ({ ...p, [c.id]: e.target.checked }))} />
                <span>{t('remindersFor', { name: c.name })}</span>
              </label>
            ))}
          </fieldset>
        )}

        {previewChild && (
          <div className={s.preview} aria-labelledby={`${uid}-preview`}>
            <p id={`${uid}-preview`} className={s.label}>
              {t('preview')}
            </p>
            {previewDoses.length ? (
              <p className={s.message} data-testid="reminder-preview">
                {reminderText(previewChild, previewDoses, origin).body}
              </p>
            ) : (
              <p className={s.muted}>{tR('nothingSoon', { name: previewChild.name })}</p>
            )}
            {!anyChannel && <p className={s.muted}>{t('noChannel')}</p>}
          </div>
        )}

        {save.isSuccess && !save.isPending && (
          <p role="status" className={s.saved}>
            {t('saved')}
          </p>
        )}
        {save.isError && (
          <p role="alert" className={s.error}>
            <AlertIcon />
            {t('saveFailed')}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {t('saveReminders')}
        </button>
      </form>
    </section>
  );
}

/** Dev only: run the reminder job now and show what the mock NotificationService logged. */
function DevReminderPanel({ prefs, kids: children }: { prefs: ReminderPrefs; kids: SetUpChild[] }) {
  const t = useTranslations('settings');
  const { data: account } = useAccount();
  const schedules = useChildSchedules(children);
  const reminderText = useReminderText();
  const qc = useQueryClient();
  const log = useQuery({
    queryKey: ['dev', 'reminders'],
    queryFn: api.dev.sentReminders,
  });
  const send = useMutation({
    mutationFn: () => {
      const plans = planReminders({
        children: children.map((c, i) => ({
          id: c.id,
          schedule: schedules[i],
        })),
        prefs,
      });
      const messages = plans.flatMap((p) => {
        const child = children.find((c) => c.id === p.childId)!;
        const { body, deepLink } = reminderText(child, p.doses, window.location.origin);
        return p.channels.map((channel) => ({
          accountId: account!.id,
          childId: p.childId,
          channel,
          to: channel === 'sms' ? prefs.sms.phone! : prefs.email.address!,
          body,
          deepLink,
        }));
      });
      return api.dev.sendReminders(messages);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev', 'reminders'] }),
  });

  return (
    <section className={`${s.section} ${s.dev}`} aria-labelledby="set-dev">
      <h2 id="set-dev">{t('devTitle')}</h2>
      <p className={s.muted}>{t('devIntro')}</p>
      <button type="button" className="btn" disabled={send.isPending || !account} onClick={() => send.mutate()}>
        {t('devSend')}
      </button>
      {send.isSuccess && <p role="status">{t('devSent', { count: send.data.sent })}</p>}
      {log.data && log.data.length > 0 && (
        <ul className={s.log}>
          {log.data.map((m, i) => (
            <li key={i}>
              <span className={s.label}>
                {m.channel === 'sms' ? t('devSms') : t('devEmail')} · {m.to}
              </span>
              <p className={s.message}>{m.body}</p>
              <Link href={new URL(m.deepLink).pathname}>{t('devOpen')}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
