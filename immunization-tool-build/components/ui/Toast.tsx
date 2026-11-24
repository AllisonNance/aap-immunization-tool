'use client';
// A temporary message at the bottom of the screen, above the tab bar. It goes
// away after a few seconds, but waits while it's hovered or focused (so its
// link can be used, WCAG 2.2.1) and can be closed early.
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XIcon } from '@/components/shell/icons';
import s from './toast.module.css';

export function Toast({ children, onDone, duration = 6000 }: { children: ReactNode; onDone(): void; duration?: number }) {
  const t = useTranslations('modal');
  const [paused, setPaused] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => done.current(), duration);
    return () => clearTimeout(id);
  }, [paused, duration]);

  return (
    <div
      className={s.toast}
      role="status"
      data-testid="toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <p className={s.text}>{children}</p>
      <button type="button" className={s.close} aria-label={t('close')} onClick={() => done.current()}>
        <XIcon />
      </button>
    </div>
  );
}
