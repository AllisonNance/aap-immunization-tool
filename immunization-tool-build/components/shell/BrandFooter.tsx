'use client';
// Logo section at the bottom of every page: HealthyChildren.org and the AAP.
// The logos are the one place color is allowed in this grayscale wireframe.
import { useTranslations } from 'next-intl';
import s from './shell.module.css';

export function BrandFooter({ withTabs, withBar }: { withTabs: boolean; withBar?: boolean }) {
  const t = useTranslations('brand');
  return (
    <footer className={`${s.footer} ${withTabs ? s.withTabs : ''} ${withBar ? s.withBar : ''}`}>
      <div className={s.footerCard}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand art */}
        <img src="/brand/healthychildren.svg" alt={t('healthyChildren')} className={s.footerHc} width={350} height={55} />
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand art */}
        <img src="/brand/aap.png" alt={t('aap')} className={s.footerAap} width={313} height={97} />
      </div>
    </footer>
  );
}
