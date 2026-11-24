'use client';
// Screen 4b · Scan a Record (SPEC.md §6.4b): tips, what works, a privacy note;
// take a photo (camera) or upload from files; add or remove pages; Continue →
// Review Scan (4c). Extraction goes through the OCR service (mock).
import { useGate } from '@/components/states/States';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { use, useId, useRef, useState } from 'react';
import s from '@/components/record/record.module.css';
import { useSelectedChild } from '@/components/shell/SelectedChild';
import { api } from '@/lib/api';
import { rememberScanImages } from '@/lib/scan/images';
import scan from './scan.module.css';

interface Page {
  id: number;
  file: File;
  url: string;
}

export function ScanScreen({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = use(params);
  const { children } = useSelectedChild();
  const child = children.find((c) => c.id === childId);
  const gate = useGate([], !child);
  if (gate || !child) return gate;
  return <Scan childId={child.id} />;
}

function Scan({ childId }: { childId: string }) {
  const t = useTranslations('scan');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const uid = useId();
  const [pages, setPages] = useState<Page[]>([]);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const nextId = useRef(1);
  const base = `/child/${childId}`;

  function add(files: FileList | null) {
    if (!files?.length) return;
    const added = [...files]
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({
        id: nextId.current++,
        file,
        url: URL.createObjectURL(file),
      }));
    setPages((p) => [...p, ...added]);
    setFailed(false);
  }

  function remove(id: number) {
    setPages((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });
  }

  async function onContinue() {
    setUploading(true);
    setFailed(false);
    try {
      const session = await api.scans.upload(
        childId,
        pages.map((p) => p.file),
      );
      rememberScanImages(
        session.id,
        pages.map((p) => p.url),
      );
      router.push(`${base}/add/scan/review?scan=${session.id}`);
    } catch {
      setFailed(true);
      setUploading(false);
    }
  }

  return (
    <section className={s.screen}>
      <h1>{t('title')}</h1>

      <div className={scan.infoGrid}>
        <div className={s.panel}>
          <h2 className={s.h2}>{t('tipsTitle')}</h2>
          <ul>
            {(['flat', 'light', 'whole'] as const).map((k) => (
              <li key={k}>{t(`tips.${k}`)}</li>
            ))}
          </ul>
        </div>
        <div className={s.panel}>
          <h2 className={s.h2}>{t('worksTitle')}</h2>
          <ul>
            {(['us', 'abroad', 'registry'] as const).map((k) => (
              <li key={k}>{t(`works.${k}`)}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className={s.helper}>{t('privacy')}</p>

      {pages.length > 0 && (
        <section aria-labelledby={`${uid}-pages`}>
          <h2 id={`${uid}-pages`} className={s.h2}>
            {t('pagesTitle', { count: pages.length })}
          </h2>
          <ul className={scan.pages}>
            {pages.map((p, i) => (
              <li key={p.id} className={scan.page}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local photo preview */}
                <img src={p.url} alt={t('pageAlt', { n: i + 1 })} className={scan.thumb} />
                <span className={scan.pageLabel}>{t('page', { n: i + 1 })}</span>
                <button type="button" className={s.dangerLink} onClick={() => remove(p.id)} aria-label={t('removePage', { n: i + 1 })}>
                  {t('remove')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={scan.capture}>
        {/* Camera on phones; a file picker elsewhere. */}
        <label className="btn btn-block">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
          {pages.length ? t('takeAnother') : t('takePhoto')}
        </label>
        <label className="btn btn-block">
          <input
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
          {t('upload')}
        </label>
      </div>

      {failed && (
        <p role="alert" className={s.formError}>
          {tErr('generic')}
        </p>
      )}

      <div className={s.actions}>
        <div className={s.actionsInner}>
          <Link href={`${base}/add`} className="btn">
            {t('cancel')}
          </Link>
          <button type="button" className="btn btn-primary" disabled={!pages.length || uploading} onClick={onContinue}>
            {uploading ? t('reading') : t('continue')}
          </button>
        </div>
      </div>
    </section>
  );
}
