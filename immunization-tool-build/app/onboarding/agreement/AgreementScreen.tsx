'use client';
// Screen 1a · Agreement (SPEC.md §6.1a). Shown once, and again when
// AGREEMENT_VERSION changes. After agreeing, the route guard moves on
// (to 1b on a first visit, or Home for a returning caregiver).
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import s from '@/components/onboarding/onboarding.module.css';
import { useAcceptAgreement, useAccount, useLogout } from '@/lib/api/hooks';
import { AGREEMENT_VERSION, legalLinks } from '@/lib/config';

const sections = ['terms', 'data', 'reminders', 'advice'] as const;

export function AgreementScreen() {
  const t = useTranslations('agreement');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const { data: account } = useAccount();
  const agreement = useAcceptAgreement();
  const logout = useLogout();
  const [checked, setChecked] = useState(false);
  const checkboxId = useId();

  // Accepted an older version before: say why they're seeing this again.
  const isUpdate = !!account?.agreementVersionAccepted;
  const busy = agreement.isPending || logout.isPending;

  return (
    <section className={s.screen} aria-labelledby={`${checkboxId}-title`}>
      <h1 id={`${checkboxId}-title`}>{t('title')}</h1>
      {isUpdate ? <p className={s.notice}>{t('updated')}</p> : <p className={s.lede}>{t('intro')}</p>}

      {sections.map((key) => (
        <div key={key} className={s.section}>
          <h2>{t(`${key}Title`)}</h2>
          <p>{t(`${key}Body`)}</p>
        </div>
      ))}

      <div className={s.links}>
        <a href={legalLinks.terms}>{t('termsLink')}</a>
        <a href={legalLinks.privacy}>{t('privacyLink')}</a>
      </div>

      <label className={s.choice} htmlFor={checkboxId}>
        <input id={checkboxId} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span className={s.choiceText}>{t('checkbox')}</span>
      </label>
      <p className={s.meta}>{t('version', { version: AGREEMENT_VERSION })}</p>

      {agreement.isError && (
        <p role="alert" className={s.formError}>
          {tErr('generic')}
        </p>
      )}

      <div className={s.actions}>
        <div className={`${s.actionsInner} ${s.actionsStack}`}>
          <button type="button" className="btn btn-primary" disabled={!checked || busy} onClick={() => agreement.accept()}>
            {t('agree')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => router.replace('/login'),
              })
            }
          >
            {t('decline')}
          </button>
        </div>
      </div>
    </section>
  );
}
