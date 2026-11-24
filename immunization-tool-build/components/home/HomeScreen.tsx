'use client';
// Screen 1 · Home (SPEC.md §6.1). No child selector. Closable notices (schedule
// changes, flu season), the Record / Appointment / Question buttons, then Child
// Status: one card per child with status and what's next. Below that, Open Questions
// listed by child.
// (Add a child lives in Settings and in the empty state.)
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { DoseChip } from '@/components/schedule/DoseChip';
import { useScheduleText } from '@/components/schedule/useScheduleText';
import { ChevronRightIcon, XIcon } from '@/components/shell/icons';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { StatusPill } from '@/components/shell/StatusPill';
import { useChildRecords, useQuestionsFor, useUpdateQuestion } from '@/lib/api/hooks';
import { useGate } from '@/components/states/States';
import type { Question, SetUpChild } from '@/lib/api/schemas';
import { schedule as scheduleData } from '@/lib/data';
import type { ChildSchedule, DoseState } from '@/lib/schedule';
import { useChildSchedules } from '@/lib/schedule/useChildSchedule';
import { QuickActions } from './QuickActions';
import s from './home.module.css';

const MAX_LISTED = 3;

/** What a card says is next: overdue, then due now, then the next upcoming group. */
function nextUp(sched: ChildSchedule): { kind: 'overdue' | 'dueNow' | 'next'; doses: DoseState[] } | null {
  const all = sched.series.flatMap((x) => x.doses);
  const overdue = all.filter((d) => d.state === 'overdue');
  if (overdue.length) return { kind: 'overdue', doses: overdue };
  const due = all.filter((d) => d.state === 'dueNow');
  if (due.length) return { kind: 'dueNow', doses: due };
  const upcoming = all.filter((d) => d.state === 'upcoming' && d.windowStart).sort((a, b) => a.windowStart!.localeCompare(b.windowStart!));
  if (!upcoming.length) return null;
  return {
    kind: 'next',
    doses: upcoming.filter((d) => d.windowStart === upcoming[0].windowStart),
  };
}

export function HomeScreen() {
  const t = useTranslations('home');
  const { children } = useSelectedChild();
  const schedules = useChildSchedules(children);
  const questions = useQuestionsFor(children.map((c) => c.id));
  const records = useChildRecords(children.map((c) => c.id));
  const text = useScheduleText();
  // Cards show their own placeholders while loading; a failed record gets the error + retry.
  const loadError = useGate(records.filter((q) => q.isError));

  const fluSeason = schedules.some((sc) => sc?.seasonal.some((x) => x.vaccineId === 'influenza' && x.state === 'dueThisSeason'));

  if (children.length === 0) {
    return (
      <section className={s.screen}>
        <h1>{t('title')}</h1>
        <div className={s.empty}>
          <h2>{t('emptyTitle')}</h2>
          <p>{t('emptyBody')}</p>
          <Link href="/children/add?from=%2F" className="btn btn-primary">
            {t('addChild')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className={s.screen}>
      {/* Schedule updates (→ 7 schedule changes) and seasonal vaccines, each closable. */}
      <div className={s.notices}>
        <Notice id="schedule">
          {t('alertSchedule', { date: text.date(scheduleData.effectiveDate) })} <Link href="/vaccines/guides/schedule-changes">{t('alertLink')}</Link>
        </Notice>
        {fluSeason && <Notice id="flu">{t('alertFlu')}</Notice>}
      </div>

      <QuickActions kids={children} />

      {/* Child Status: the title and the cards are one section. */}
      <section className={s.group} aria-labelledby="home-child-status">
        <h1 id="home-child-status">{t('title')}</h1>
        {loadError}
        <ul className={s.cards}>
          {children.map((child, i) => (
            <li key={child.id}>
              <ChildCard child={child} schedule={schedules[i]} />
            </li>
          ))}
        </ul>
      </section>

      <OpenQuestions kids={children} questions={children.map((_, i) => questions[i]?.data)} />
    </div>
  );
}

// Closed notices are remembered for this session in the in-memory query cache (never browser storage).
const dismissedKey = ['ui', 'homeNoticesClosed'] as const;

function Notice({ id, children }: { id: string; children: ReactNode }) {
  const t = useTranslations('home');
  const qc = useQueryClient();
  const { data: closed } = useQuery({ queryKey: dismissedKey, queryFn: () => [] as string[], initialData: [] as string[], staleTime: Infinity, gcTime: Infinity });
  if (closed.includes(id)) return null;
  return (
    <div className={s.alert} role="note" data-testid={`notice-${id}`}>
      <p>{children}</p>
      <button type="button" className={s.close} aria-label={t('closeNotice')} onClick={() => qc.setQueryData<string[]>(dismissedKey, (c = []) => [...c, id])}>
        <XIcon />
      </button>
    </div>
  );
}

/**
 * Open questions for the pediatrician, grouped by child (→ 5 Visit Prep).
 * Only children with an open question are listed; one checked off here stays
 * (crossed out, so it can be unchecked) until Home is left.
 */
function OpenQuestions({ kids, questions }: { kids: SetUpChild[]; questions: Array<Question[] | undefined> }) {
  const t = useTranslations('home');
  // Checked state set here, shown at once; the save happens in the background.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const groups = kids
    .map((child, i) => ({ child, shown: (questions[i] ?? []).filter((q) => !q.resolved || q.id in checked) }))
    .filter((g) => g.shown.length > 0);
  const loaded = questions.every((q) => q !== undefined);

  return (
    <section className={s.openQuestions} aria-labelledby="home-open-questions">
      <h2 id="home-open-questions">{t('openQuestionsTitle')}</h2>
      {groups.map(({ child, shown }) => (
        <ChildQuestions key={child.id} child={child} shown={shown} checked={checked} onCheck={(id, on) => setChecked((c) => ({ ...c, [id]: on }))} />
      ))}
      {loaded && groups.length === 0 && <p className={s.qNone}>{t('noQuestions')}</p>}
    </section>
  );
}

function ChildQuestions(props: { child: SetUpChild; shown: Question[]; checked: Record<string, boolean>; onCheck(id: string, on: boolean): void }) {
  const { child, shown, checked, onCheck } = props;
  const t = useTranslations('home');
  const tErr = useTranslations('errors');
  const text = useScheduleText();
  const update = useUpdateQuestion(child.id);

  function toggle(q: Question, resolved: boolean) {
    onCheck(q.id, resolved);
    update.mutate({ id: q.id, patch: { resolved, updatedAt: q.updatedAt } }, { onError: () => onCheck(q.id, q.resolved) });
  }

  return (
    <section className={s.qGroup} aria-labelledby={`home-q-${child.id}`}>
      <h3 id={`home-q-${child.id}`} className={s.qChild}>
        {child.name}
      </h3>
      <ul className={s.qList}>
        {shown.map((q) => {
          const on = checked[q.id] ?? q.resolved;
          return (
            <li key={q.id} className={`${s.question} ${on ? s.qResolved : ''}`}>
              <label className={s.qLabel}>
                <input type="checkbox" checked={on} onChange={(e) => toggle(q, e.target.checked)} />
                <span className={s.qBody}>
                  {q.vaccineId && <span className={s.qVaccine}>{text.vaccineName(q.vaccineId)}</span>}
                  <span className={s.qText}>{q.text}</span>
                </span>
              </label>
              <QuestionAnswer child={child} question={q} />
            </li>
          );
        })}
      </ul>
      {update.isError && (
        <p role="alert" className={s.qError}>
          {tErr('saveFailed')}
        </p>
      )}
      <Link href={`/visit-prep?child=${child.id}`} className={`${s.qLink} target-link`}>
        {t('prepLink', { name: child.name })}
      </Link>
    </section>
  );
}

/** Under a Home question: its answer (if any) and "Add answer" / "Edit answer", as on Visit Prep. */
function QuestionAnswer({ child, question }: { child: SetUpChild; question: Question }) {
  const t = useTranslations('visitPrep');
  const update = useUpdateQuestion(child.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const uid = useId();
  const answer = question.answer?.trim();

  if (editing) {
    return (
      <form
        className={s.qAnswerForm}
        onSubmit={(e) => {
          e.preventDefault();
          // An empty answer removes it.
          update.mutate({ id: question.id, patch: { answer: draft.trim(), updatedAt: question.updatedAt } }, { onSuccess: () => setEditing(false) });
        }}
      >
        <label htmlFor={`${uid}-answer`} className={s.fieldLabel}>
          {t('answerLabel')}
        </label>
        <textarea id={`${uid}-answer`} className={s.textarea} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className={s.qAnswerButtons}>
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={update.isPending}>
            {t('save')}
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className={s.qAnswerArea}>
      {answer && (
        <p className={s.qAnswer}>
          <span className={s.qAnswerLabel}>{t('answerTitle')}</span> {answer}
        </p>
      )}
      <button
        type="button"
        className={s.qAnswerButton}
        onClick={() => {
          setDraft(question.answer ?? '');
          setEditing(true);
        }}
        aria-label={answer ? t('editAnswerFor', { text: question.text }) : t('addAnswerFor', { text: question.text })}
      >
        {answer ? t('editAnswer') : t('addAnswer')}
      </button>
    </div>
  );
}

function ChildCard({ child, schedule }: { child: SetUpChild; schedule: ChildSchedule | undefined }) {
  const t = useTranslations('home');
  const text = useScheduleText();
  const next = schedule ? nextUp(schedule) : null;
  const listed = next?.doses.slice(0, MAX_LISTED) ?? [];
  const more = (next?.doses.length ?? 0) - listed.length;

  return (
    // The name is the link (its accessible name is what's visible, WCAG 2.5.3);
    // it's stretched over the card so the whole card is tappable.
    <article className={s.card} data-testid="child-card">
      <div className={s.cardHead}>
        <h2 className={s.cardName}>
          <Link href={`/child/${child.id}`} className={s.cardLink}>
            {child.name}
          </Link>
        </h2>
        {schedule && <StatusPill status={schedule.status} />}
      </div>

      {schedule && (
        <div className={s.next}>
          {next ? (
            <>
              <ul className={s.nextList}>
                {listed.map((d) => (
                  <li key={`${d.vaccineId}-${d.doseNumber}`}>
                    <span className={s.vaccine}>{text.vaccineShort(d.vaccineId)}</span>
                    <span className={s.window}>{text.windowLabel(d.vaccineId, d.doseNumber)}</span>
                  </li>
                ))}
              </ul>
              {more > 0 && <span className={s.more}>{t('more', { count: more })}</span>}
            </>
          ) : (
            <span className={s.nextTitle}>{t('nothingDue')}</span>
          )}
        </div>
      )}

      {schedule && schedule.counts.needsInfo > 0 && (
        <span className={s.needsInfo}>
          <DoseChip state="needsInfo" label={t('needsInfo', { count: schedule.counts.needsInfo })} />
        </span>
      )}
      <ChevronRightIcon className={s.chevron} aria-hidden />
    </article>
  );
}
