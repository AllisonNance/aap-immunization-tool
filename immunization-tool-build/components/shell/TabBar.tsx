'use client';
// Bottom tab bar (SPEC.md §3). Hidden on full-screen forms.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { tabs, type TabId } from '@/lib/routes';
import { CalendarIcon, ClipboardIcon, GearIcon, HomeIcon, SyringeIcon } from './icons';
import { useSelectedChild } from './SelectedChild';
import s from './shell.module.css';

const icons = {
  home: HomeIcon,
  schedule: CalendarIcon,
  visitPrep: ClipboardIcon,
  vaccines: SyringeIcon,
  settings: GearIcon,
};

export function TabBar({ active }: { active: TabId | null }) {
  const t = useTranslations('tabs');
  const { selected } = useSelectedChild();
  return (
    <nav className={s.tabbar} aria-label={t('label')}>
      <ul className={s.tabs}>
        {tabs.map(({ id, href }) => {
          const Icon = icons[id];
          // Child context carries across links (SPEC.md §4).
          // Schedule opens the selected child's page (screen 2), the same page Home's cards open.
          const to =
            id === 'schedule'
              ? selected
                ? `${href}/${encodeURIComponent(selected.id)}`
                : '/'
              : id === 'visitPrep' && selected
                ? `${href}?child=${encodeURIComponent(selected.id)}`
                : href;
          return (
            <li key={id}>
              <Link href={to} className={s.tab} aria-current={active === id ? 'page' : undefined}>
                <Icon />
                {t(id)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
