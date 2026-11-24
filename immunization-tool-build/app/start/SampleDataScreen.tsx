'use client';
// Prototype entry (dev only, not an IA screen): choose which sample account
// the tool runs on, then Enter tool → screen 0 (Log In Prompt). Keeps `next`
// so a reminder deep link still lands on its child after login.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import s from '@/components/onboarding/onboarding.module.css';
import { api } from '@/lib/api';
import { entryPath } from '@/lib/config';
import { safeNext } from '@/lib/guards';
import { fixtures } from '@/mocks/db';

type AccountKey = 'demo-family' | 'new-family' | 'spanish-family' | 'one-child';

export function SampleDataScreen() {
  const t = useTranslations('sampleData');
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(search.get('next'));
  const [choice, setChoice] = useState<string>();
  const [entering, setEntering] = useState(false);
  const groupName = useId(); // unique: hidden copies of this page stay mounted

  // Only exists with the dev mock; elsewhere go straight to screen 0.
  const available = entryPath === '/start';
  useEffect(() => {
    if (!available) router.replace('/login');
  }, [available, router]);

  // Start from the account picked last time.
  useEffect(() => {
    api.dev
      .getSampleAccount()
      .then((r) => setChoice((c) => c ?? r.accountKey))
      .catch(() => setChoice((c) => c ?? 'demo-family'));
  }, []);

  if (!available) return null;

  async function enter() {
    if (!choice) return;
    setEntering(true);
    try {
      await api.dev.setSampleAccount(choice);
      // A different sample account may be signed in: start clean.
      await api.session.logout();
      qc.clear();
      router.push(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    } finally {
      setEntering(false);
    }
  }

  return (
    <section className={s.screen}>
      <h1>{t('title')}</h1>
      <p className={s.lede}>{t('intro')}</p>

      <fieldset className={s.fields}>
        <legend className="visually-hidden">{t('legend')}</legend>
        <ul className={s.list}>
          {fixtures.accounts.map(({ key }) => (
            <li key={key}>
              <label className={s.choice}>
                <input type="radio" name={groupName} value={key} checked={choice === key} onChange={() => setChoice(key)} />
                <span className={s.choiceText}>
                  <span className={s.choiceTitle}>{t(`accounts.${key as AccountKey}.name`)}</span>
                  <span className={s.choiceSub}>{t(`accounts.${key as AccountKey}.description`)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className={s.actions}>
        <div className={s.actionsInner}>
          <button type="button" className="btn btn-primary" disabled={!choice || entering} onClick={enter}>
            {t('enter')}
          </button>
        </div>
      </div>
    </section>
  );
}
