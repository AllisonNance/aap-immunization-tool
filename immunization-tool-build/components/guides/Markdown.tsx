'use client';
// Renders parsed guide Markdown as React elements (no raw HTML). Links:
// "/…" stay in the app; "app:scan|add|custom" go to that screen for the
// selected child; "https://…" open in a new tab.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';
import type { Block, Inline } from '@/lib/markdown';

const appTargets: Record<string, string> = {
  scan: '/add/scan',
  add: '/add',
  custom: '/add/custom',
};

export function Markdown({ blocks, childId, sectionClassName }: { blocks: Block[]; childId?: string; sectionClassName?: string }) {
  const uid = useId();
  const t = useTranslations('guides');
  const inline = (parts: Inline[]): ReactNode[] =>
    parts.map((p, i) => {
      if (p.kind === 'bold') return <strong key={i}>{p.text}</strong>;
      if (p.kind === 'text') return p.text;
      if (p.href.startsWith('app:')) {
        const target = appTargets[p.href.slice(4)];
        // Without a child selected, these go Home to pick one.
        const href = target && childId ? `/child/${childId}${target}` : '/';
        return (
          <Link key={i} href={href}>
            {p.text}
          </Link>
        );
      }
      if (p.href.startsWith('/')) {
        return (
          <Link key={i} href={p.href}>
            {p.text}
          </Link>
        );
      }
      if (/^https:\/\//.test(p.href)) {
        return (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
            <span className="visually-hidden"> ({t('newTab')})</span>
          </a>
        );
      }
      return p.text; // anything else is shown as plain text
    });

  const render = (b: Block, i: number, id?: string) => {
    switch (b.kind) {
      case 'h1':
        return <h1 key={i}>{inline(b.content)}</h1>;
      case 'h2':
        return (
          <h2 key={i} id={id}>
            {inline(b.content)}
          </h2>
        );
      case 'h3':
        return <h3 key={i}>{inline(b.content)}</h3>;
      case 'p':
        return <p key={i}>{inline(b.content)}</p>;
      case 'ul':
        return (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        );
    }
  };

  // Each h2 and the blocks after it (up to the next h2) form one section, so a
  // title is always grouped with its content.
  const lead: Block[] = [];
  const sections: Block[][] = [];
  for (const b of blocks) {
    if (b.kind === 'h2') sections.push([b]);
    else if (sections.length) sections[sections.length - 1].push(b);
    else lead.push(b);
  }

  return (
    <>
      {lead.map((b, i) => render(b, i))}
      {sections.map((group, g) => {
        const id = `${uid}-s${g}`;
        return (
          <section key={g} className={sectionClassName} aria-labelledby={id}>
            {group.map((b, i) => render(b, i, i === 0 ? id : undefined))}
          </section>
        );
      })}
    </>
  );
}
