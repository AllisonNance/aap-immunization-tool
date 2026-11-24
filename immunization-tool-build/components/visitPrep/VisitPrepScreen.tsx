'use client';
// Screen 5 · Visit Prep (SPEC.md §6.5), one child at a time (the selector
// switches child; SPEC.md §13 default). Shows the caregiver-entered next
// appointment, vaccines likely due then, open questions grouped by vaccine
// then general, doses marked not sure, About the child (delayed schedule, lived
// outside the US, medical conditions, past reactions; moved here from the child
// page), and the pediatrician's contact.
// Actions: add a question (Home's popup, this child picked), edit / resolve one,
// set the appointment, print.
import { useGate } from '@/components/states/States';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import { DoseChip } from '@/components/schedule/DoseChip';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { QuestionDialog } from '@/components/home/QuickActions';
import { AlertIcon, PlusIcon } from '@/components/shell/icons';
import { Toast } from '@/components/ui/Toast';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { useChildRecord, useQuestions, useUpdateChild, useUpdateQuestion } from '@/lib/api/hooks';
import type { ChildRecord, Question, SetUpChild } from '@/lib/api/schemas';
import { schedule } from '@/lib/data';
import { checkDateInput, compareISO, emptyDateInput, isoToDateInput, todayISO } from '@/lib/dates';
import { dosesDueAt } from '@/lib/schedule';
import { useChildSchedule } from '@/lib/schedule/useChildSchedule';
import s from './visitPrep.module.css';

export function VisitPrepScreen() {
  const t = useTranslations('visitPrep');
  const { selected } = useSelectedChild();
  if (!selected) {
    return (
      <section className={s.screen}>
        <h1>{t('title')}</h1>
        <p className={s.muted}>{t('noChild')}</p>
        <Link href="/children/add?from=%2Fvisit-prep" className="btn btn-primary">
          {t('addChild')}
        </Link>
      </section>
    );
  }
  // Remount per child so drafts don't carry across a switch.
  return <VisitPrep key={selected.id} child={selected} />;
}

function VisitPrep({ child }: { child: SetUpChild }) {
  const t = useTranslations('visitPrep');
  const tSetup = useTranslations('childSetup');
  const text = useScheduleText();
  const recordQ = useChildRecord(child.id);
  const questionsQ = useQuestions(child.id);
  const record = recordQ.data;
  const questions = questionsQ.data;
  const sched = useChildSchedule(child);
  const { children } = useSelectedChild();
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState<{ text: string; n: number } | null>(null);
  const gate = useGate([recordQ, questionsQ], !record || !questions || !sched);
  if (gate || !record || !questions || !sched) return gate;

  // About the child (moved here from the child page): what the pediatrician may want to know.
  const answer = (v: string | undefined) => (v ? tSetup(v as 'yes' | 'no' | 'notSure') : undefined);
  const about = [
    [t('about.alternate'), answer(child.alternateSchedule)],
    [t('about.abroad'), answer(child.livedOutsideUs)],
    [t('about.conditions'), child.medicalConditions],
    [t('about.reactions'), child.priorReactions],
  ].filter(([, v]) => v?.trim()) as Array<[string, string]>;

  const appointment = child.nextAppointment && compareISO(child.nextAppointment, todayISO()) >= 0 ? child.nextAppointment : undefined;
  const likelyDue = dosesDueAt(
    {
      child: { dateOfBirth: child.dateOfBirth, createdAt: child.createdAt },
      doses: record.doses,
      exemptions: record.exemptions,
      schedule,
    },
    appointment ?? todayISO(),
  );
  const seasonalDue = sched.seasonal.filter((x) => x.state === 'dueThisSeason');
  const notSure = sched.series.flatMap((x) => x.doses).filter((d) => d.state === 'needsInfo');
  const open = questions.filter((q) => !q.resolved);
  const resolved = questions.filter((q) => q.resolved);

  return (
    <section className={s.screen}>
      <header className={s.head}>
        <h1>{t('title')}</h1>
        <button type="button" className="btn no-print" onClick={() => window.print()}>
          {t('print')}
        </button>
      </header>
      <p className={`${s.muted} print-only`}>{t('printHeading', { name: child.name })}</p>

      <Appointment child={child} appointment={appointment} />

      <section className={s.section} aria-labelledby="vp-due">
        <h2 id="vp-due">{appointment ? t('dueAtVisit') : t('dueNow')}</h2>
        {likelyDue.length || seasonalDue.length ? (
          <ul className={s.list}>
            {likelyDue.map((d) => (
              <li key={`${d.vaccineId}-${d.doseNumber}`} className={s.item}>
                <span>
                  <Link href={`/vaccines/${d.vaccineId}`} className={`${s.strong} target-link`}>
                    {text.vaccineName(d.vaccineId)}
                  </Link>{' '}
                  · {text.doseLabel(d.doseNumber)}
                </span>
                <DoseChip state={d.state} label={text.stateLabel(d, child.name)} />
              </li>
            ))}
            {seasonalDue.map((x) => (
              <li key={x.vaccineId} className={s.item}>
                <Link href={`/vaccines/${x.vaccineId}`} className={`${s.strong} target-link`}>
                  {text.vaccineName(x.vaccineId)}
                </Link>
                <DoseChip state={x.state} label={text.seasonalLabel(x.state)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.muted}>{t('nothingDue')}</p>
        )}
      </section>

      <section className={s.section} aria-labelledby="vp-questions">
        {/* Title with "Add a question +" at the right; it opens Home's question popup with this child picked. */}
        <div className={s.sectionHead}>
          <h2 id="vp-questions">{t('questionsTitle')}</h2>
          <button
            type="button"
            className={`btn ${s.headBtn} no-print`}
            aria-haspopup="dialog"
            onClick={() => {
              setSaved(null);
              setAsking(true);
            }}
          >
            {t('addLabel')}
            <PlusIcon />
          </button>
        </div>
        <QuestionGroups child={child} record={record} questions={open} />
        {/* Resolved questions (with their answers) are on their own page. */}
        <Link href={`/visit-prep/past?child=${child.id}`} className={`${s.pastLink} target-link no-print`}>
          {t('pastLink', { count: resolved.length })}
        </Link>
      </section>

      {asking && (
        <QuestionDialog
          kids={children}
          initialChildId={child.id}
          onClose={() => setAsking(false)}
          onSaved={(_, msg) => {
            setAsking(false);
            setSaved((p) => ({ text: msg, n: (p?.n ?? 0) + 1 }));
          }}
        />
      )}
      {saved && (
        // Keyed per save, so a second save restarts the timer.
        <Toast key={saved.n} onDone={() => setSaved(null)}>
          {saved.text}
        </Toast>
      )}

      {notSure.length > 0 && (
        <section className={s.section} aria-labelledby="vp-notsure">
          <h2 id="vp-notsure">{t('notSureTitle')}</h2>
          <p className={s.muted}>{t('notSureIntro')}</p>
          <ul className={s.list}>
            {notSure.map((d) => (
              <li key={`${d.vaccineId}-${d.doseNumber}`}>
                <Link href={`/child/${child.id}/dose/${d.vaccineId}/${d.doseNumber}`} className={s.item}>
                  <span className={`${s.strong} target-link`}>
                    {text.vaccineName(d.vaccineId)} · {text.doseLabel(d.doseNumber)}
                  </span>
                  <DoseChip state="needsInfo" label={text.stateLabel(d)} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {about.length > 0 && (
        <section className={s.section} aria-labelledby="vp-about">
          <h2 id="vp-about">{t('aboutTitle', { name: child.name })}</h2>
          <dl className={s.about}>
            {about.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className={s.section} aria-labelledby="vp-ped">
        <h2 id="vp-ped">{t('pediatricianTitle')}</h2>
        {child.pediatrician?.name || child.pediatrician?.phone ? (
          <div className={s.contact}>
            {child.pediatrician.name && <p className={s.strong}>{child.pediatrician.name}</p>}
            {child.pediatrician.practice && <p className={s.muted}>{child.pediatrician.practice}</p>}
            {child.pediatrician.phone && (
              // The number itself is the call link (no separate Call button).
              <a href={`tel:${child.pediatrician.phone.replace(/[^\d+]/g, '')}`} className={`${s.phone} target-link`}>
                {child.pediatrician.phone}
              </a>
            )}
          </div>
        ) : (
          <p className={s.muted}>
            {t('noPediatrician')}{' '}
            <Link href={`/child/${child.id}/edit`} className="no-print">
              {t('addPediatrician')}
            </Link>
          </p>
        )}
      </section>
    </section>
  );
}

/** Next appointment: shown, set, changed or cleared (caregiver-entered, SPEC.md §13 default). */
function Appointment({ child, appointment }: { child: SetUpChild; appointment?: string }) {
  const t = useTranslations('visitPrep');
  const text = useScheduleText();
  const update = useUpdateChild();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => (appointment ? isoToDateInput(appointment) : emptyDateInput));
  const [error, setError] = useState<'dateRequired' | 'dateInvalid' | 'inPast' | null>(null);
  const uid = useId();

  function save() {
    const c = checkDateInput(value);
    if (c.kind === 'empty' || c.kind === 'incomplete') return setError('dateRequired');
    if (c.kind === 'invalid') return setError('dateInvalid');
    if (compareISO(c.iso, todayISO()) < 0) return setError('inPast');
    update.mutate(
      {
        id: child.id,
        patch: { nextAppointment: c.iso, updatedAt: child.updatedAt },
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <section className={s.appointment} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className={s.h3}>
        {t('appointmentTitle')}
      </h2>
      {!editing ? (
        <div className={s.apptRow}>
          <p className={s.apptDate}>{appointment ? text.date(appointment) : t('noAppointment')}</p>
          <button
            type="button"
            className="btn no-print"
            onClick={() => {
              setValue(appointment ? isoToDateInput(appointment) : emptyDateInput);
              setError(null);
              setEditing(true);
            }}
          >
            {appointment ? t('change') : t('setDate')}
          </button>
        </div>
      ) : (
        <form
          className={s.apptForm}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <DateFields
            legend={t('appointmentDate')}
            value={value}
            onChange={(v) => {
              setValue(v);
              setError(null);
            }}
            invalid={!!error}
            describedBy={error ? `${uid}-err` : undefined}
          />
          {error && (
            <p id={`${uid}-err`} className={s.error}>
              <AlertIcon />
              {t(`errors.${error}`)}
            </p>
          )}
          <div className={s.buttons}>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={update.isPending}>
              {t('save')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Questions grouped by vaccine (or custom vaccine), then general. */
export function QuestionGroups({ child, record, questions }: { child: SetUpChild; record: ChildRecord; questions: Question[] }) {
  const t = useTranslations('visitPrep');
  const text = useScheduleText();
  if (!questions.length) return <p className={s.muted}>{t('noQuestions')}</p>;

  const groups = new Map<string, { label: string; href?: string; items: Question[] }>();
  for (const q of questions) {
    const custom = q.customVaccineId ? record.customVaccines.find((c) => c.id === q.customVaccineId) : undefined;
    const key = q.vaccineId ? `v:${q.vaccineId}` : custom ? `c:${custom.id}` : 'general';
    if (!groups.has(key)) {
      groups.set(key, {
        label: q.vaccineId ? text.vaccineName(q.vaccineId) : custom ? custom.nameAsWritten : t('general'),
        href: q.vaccineId ? `/vaccines/${q.vaccineId}` : custom ? `/child/${child.id}/add/custom/${custom.id}` : undefined,
        items: [],
      });
    }
    groups.get(key)!.items.push(q);
  }
  // General last.
  const ordered = [...groups.entries()].sort(([a], [b]) => Number(a === 'general') - Number(b === 'general'));

  return (
    <div className={s.groups}>
      {ordered.map(([key, g]) => (
        <section key={key} className={s.group} aria-label={g.label}>
          <h3 className={s.groupTitle}>
            {g.href ? (
              <Link href={g.href} className="target-link">
                {g.label}
              </Link>
            ) : (
              g.label
            )}
          </h3>
          <ul className={s.questions}>
            {g.items.map((q) => (
              <QuestionRow key={q.id} child={child} question={q} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function QuestionRow({ child, question }: { child: SetUpChild; question: Question }) {
  const t = useTranslations('visitPrep');
  const update = useUpdateQuestion(child.id);
  // Editing the question, its answer, or neither.
  const [editing, setEditing] = useState<'question' | 'answer' | null>(null);
  const [draft, setDraft] = useState('');
  const uid = useId();
  const answer = question.answer?.trim();

  function start(what: 'question' | 'answer') {
    setDraft(what === 'question' ? question.text : (question.answer ?? ''));
    setEditing(what);
  }

  return (
    <li className={s.question}>
      <label className={`${s.resolve} no-print`}>
        <input
          type="checkbox"
          checked={question.resolved}
          onChange={(e) =>
            update.mutate({
              id: question.id,
              patch: {
                resolved: e.target.checked,
                updatedAt: question.updatedAt,
              },
            })
          }
          aria-label={question.resolved ? t('reopen', { text: question.text }) : t('resolve', { text: question.text })}
        />
      </label>
      {editing ? (
        <form
          className={s.editForm}
          onSubmit={(e) => {
            e.preventDefault();
            // The question needs text; an empty answer removes it.
            if (editing === 'question' && !draft.trim()) return;
            const patch = editing === 'question' ? { text: draft.trim() } : { answer: draft.trim() };
            update.mutate({ id: question.id, patch: { ...patch, updatedAt: question.updatedAt } }, { onSuccess: () => setEditing(null) });
          }}
        >
          {editing === 'answer' && <p className={s.qText}>{question.text}</p>}
          <label htmlFor={`${uid}-edit`} className={editing === 'answer' ? s.label : 'visually-hidden'}>
            {editing === 'question' ? t('editLabel') : t('answerLabel')}
          </label>
          <textarea id={`${uid}-edit`} className={s.textarea} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className={s.buttons}>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={(editing === 'question' && !draft.trim()) || update.isPending}>
              {t('save')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className={s.qBody}>
            <p className={s.qText}>{question.text}</p>
            {answer && (
              <p className={s.qAnswer}>
                <span className={s.qAnswerLabel}>{t('answerTitle')}</span> {answer}
              </p>
            )}
            <button
              type="button"
              className={`${s.linkButton} ${s.answerButton} no-print`}
              onClick={() => start('answer')}
              aria-label={answer ? t('editAnswerFor', { text: question.text }) : t('addAnswerFor', { text: question.text })}
            >
              {answer ? t('editAnswer') : t('addAnswer')}
            </button>
          </div>
          <button
            type="button"
            className={`${s.linkButton} no-print`}
            onClick={() => start('question')}
            aria-label={t('editQuestion', { text: question.text })}
          >
            {t('edit')}
          </button>
        </>
      )}
    </li>
  );
}
