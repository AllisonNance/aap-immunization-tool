'use client';
// Screen 6 · Vaccines & Guides (SPEC.md §6.6): two tabs. Vaccines (default):
// search and the A–Z list. Guides: the guide list. The tab is kept in the URL
// (?tab=guides) so it survives a trip to a guide and back. Custom vaccines
// aren't shown here. The tab bar still says "Vaccines".
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { ChevronRightIcon } from '@/components/shell/icons';
import { catalog } from '@/lib/data';
import { guideList } from '@/lib/guideList';
import { searchVaccines } from '@/lib/search/vaccines';
import s from './vaccines.module.css';

type Tab = 'vaccines' | 'guides';
const TABS: Tab[] = ['vaccines', 'guides'];

export function VaccinesIndexScreen() {
  const t = useTranslations('vaccines');
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();
  const tab: Tab = search.get('tab') === 'guides' ? 'guides' : 'vaccines';
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ vaccines: null, guides: null });
  const ids = (v: Tab) => ({ tab: `${uid}-t-${v}`, panel: `${uid}-p-${v}` });

  function select(v: Tab) {
    router.replace(v === 'guides' ? `${pathname}?tab=guides` : pathname, { scroll: false });
  }
  // WAI-ARIA tabs: arrow keys, Home and End move between them.
  function onKey(e: React.KeyboardEvent, v: Tab) {
    const i = TABS.indexOf(v);
    const next =
      e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i - 1 + TABS.length) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    select(next);
    refs.current[next]?.focus();
  }

  return (
    <section className={s.screen}>
      <div className={s.top}>
        <h1>{t('title')}</h1>
        <div role="tablist" aria-label={t('tabsLabel')} className={s.tabs}>
          {TABS.map((v) => (
            <button
              key={v}
              ref={(el) => {
                refs.current[v] = el;
              }}
              type="button"
              role="tab"
              id={ids(v).tab}
              aria-selected={tab === v}
              aria-controls={ids(v).panel}
              tabIndex={tab === v ? 0 : -1}
              className={s.tab}
              onClick={() => select(v)}
              onKeyDown={(e) => onKey(e, v)}
            >
              {t(v === 'vaccines' ? 'vaccinesTab' : 'guidesTab')}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={ids(tab).panel} aria-labelledby={ids(tab).tab} className={s.panel}>
        {tab === 'vaccines' ? <VaccineList /> : <GuideList />}
      </div>
    </section>
  );
}

function VaccineList() {
  const t = useTranslations('vaccines');
  const locale = useLocale() as 'en' | 'es';
  const [query, setQuery] = useState('');
  const uid = useId();
  const collator = new Intl.Collator(locale);
  const list = query.trim() ? searchVaccines(query, catalog.vaccines) : [...catalog.vaccines].sort((a, b) => collator.compare(a.name[locale], b.name[locale]));

  return (
    <>
      <div className={s.field}>
        <label htmlFor={`${uid}-q`} className={s.label}>
          {t('search')}
        </label>
        <input id={`${uid}-q`} type="search" className={s.input} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <section aria-labelledby={`${uid}-list`}>
        <h2 id={`${uid}-list`} className={s.h2}>
          {query.trim() ? t('results') : t('az')}
        </h2>
        {list.length ? (
          <ul className={s.list}>
            {list.map((v) => (
              <li key={v.id}>
                <Link href={`/vaccines/${v.id}`} className={s.row}>
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{v.name[locale]}</span>
                    <span className={s.rowSub}>{v.abbreviation}</span>
                  </span>
                  <ChevronRightIcon className={s.chevron} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.muted}>{t('noMatch', { query: query.trim() })}</p>
        )}
      </section>
    </>
  );
}

function GuideList() {
  const tGuides = useTranslations('guides');
  return (
    <ul className={s.list}>
      {guideList.map((slug) => (
        <li key={slug}>
          <Link href={`/vaccines/guides/${slug}`} className={s.row}>
            <span className={s.rowTitle}>{tGuides(`titles.${slug}`)}</span>
            <ChevronRightIcon className={s.chevron} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
