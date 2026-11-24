'use client';
// Screen 5a · Past Questions (not in SPEC.md): the selected child's resolved
// questions, grouped like Visit Prep, with the answers the caregiver saved.
// Unchecking one reopens it (back on Visit Prep). Reached from Visit Prep's
// "Past questions" link and Home's Open Questions; no tab of its own (it sits
// under Visit Prep). "← Back" returns to the page it was opened from.
import { useGate } from '@/components/states/States';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { canGoBackInApp } from '@/components/shell/inAppHistory';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { useChildRecord, useQuestions } from '@/lib/api/hooks';
import type { SetUpChild } from '@/lib/api/schemas';
import { QuestionGroups } from './VisitPrepScreen';
import s from './visitPrep.module.css';

export function PastQuestionsScreen() {
  const t = useTranslations('pastQuestions');
  const { selected } = useSelectedChild();
  if (!selected) {
    return (
      <section className={s.screen}>
        <BackLink />
        <p className={s.muted}>{t('noChild')}</p>
      </section>
    );
  }
  return <PastQuestions key={selected.id} child={selected} />;
}

function PastQuestions({ child }: { child: SetUpChild }) {
  const t = useTranslations('pastQuestions');
  const recordQ = useChildRecord(child.id);
  const questionsQ = useQuestions(child.id);
  const record = recordQ.data;
  const questions = questionsQ.data;
  const gate = useGate([recordQ, questionsQ], !record || !questions);
  if (gate || !record || !questions) return gate;
  const past = questions.filter((q) => q.resolved);

  return (
    <section className={s.screen} aria-labelledby="past-title">
      <header className={s.pastHead}>
        <BackLink childId={child.id} />
        <h1 id="past-title">{t('title', { name: child.name })}</h1>
        <p className={s.muted}>{t('intro')}</p>
      </header>
      {past.length > 0 ? <QuestionGroups child={child} record={record} questions={past} /> : <p className={s.muted}>{t('empty')}</p>}
    </section>
  );
}

/** Back to the page it was opened from (Visit Prep or Home); opened directly, to Visit Prep. */
function BackLink({ childId }: { childId?: string }) {
  const t = useTranslations('pastQuestions');
  const router = useRouter();
  return (
    <Link
      href={childId ? `/visit-prep?child=${childId}` : '/visit-prep'}
      className={s.back}
      onClick={(e) => {
        if (!canGoBackInApp()) return;
        e.preventDefault();
        router.back();
      }}
    >
      ← {t('back')}
    </Link>
  );
}
