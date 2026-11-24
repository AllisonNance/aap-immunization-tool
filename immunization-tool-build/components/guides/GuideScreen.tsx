'use client';
// Screen 7 · Vaccine Guide (SPEC.md §6.7). The page reads both languages at
// build time; this shows the account's language. Guide text is placeholder
// (front matter `sample: true`) until AAP provides it.
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import type { Locale } from '@/lib/api/schemas';
import type { MarkdownDoc } from '@/lib/markdown';
import { Markdown } from './Markdown';
import s from './guides.module.css';

export function GuideScreen({ docs }: { docs: Record<Locale, MarkdownDoc> }) {
  const t = useTranslations('guides');
  const locale = useLocale() as Locale;
  const { selected } = useSelectedChild();
  const doc = docs[locale];
  return (
    <article className={s.article}>
      <Link href="/vaccines?tab=guides" className={s.back}>
        ← {t('allGuides')}
      </Link>
      <Markdown blocks={doc.blocks} childId={selected?.id} sectionClassName={s.section} />
    </article>
  );
}
