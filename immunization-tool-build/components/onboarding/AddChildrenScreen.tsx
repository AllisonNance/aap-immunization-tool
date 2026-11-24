'use client';
// Screen 1b · Add Children (SPEC.md §6.1b). Used during onboarding and, later,
// from Home and Settings ("Add a child"), where Finish in 1c returns to `from`.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { DateFields } from '@/components/forms/DateFields';
import { AlertIcon } from '@/components/shell/icons';
import { useChildren, useCreateChildren, useMyAccountChildren } from '@/lib/api/hooks';
import { useGate } from '@/components/states/States';
import type { NewChild } from '@/lib/api/schemas';
import { safeNext } from '@/lib/guards';
import { emptyDateInput, todayISO, type DateInput } from '@/lib/dates';
import { formatMonthYear } from '@/lib/i18n';
import { validateChildBasics } from '@/lib/validation/child';
import s from './onboarding.module.css';

export function setupHref(mode: 'onboarding' | 'later', childId: string, extra?: { start: number; from: string }) {
  if (mode === 'onboarding') return `/onboarding/setup/${childId}`;
  const qs = new URLSearchParams({
    start: String(extra?.start ?? 0),
    from: extra?.from ?? '/',
  });
  return `/children/add/setup/${childId}?${qs}`;
}

interface ManualChild {
  key: number;
  name: string;
  birth: DateInput; // month and year only
  checked: boolean;
}

export function AddChildrenScreen({ mode }: { mode: 'onboarding' | 'later' }) {
  const t = useTranslations('addChildren');
  const tErr = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const from = safeNext(search.get('from')) ?? '/';

  const profile = useMyAccountChildren();
  const { data: tracked = [] } = useChildren();
  const create = useCreateChildren();
  const profileGate = useGate([profile]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Children added by hand. The one being typed is `editing`; earlier ones
  // become checkbox cards like the account children.
  const [manual, setManual] = useState<ManualChild[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  // Show the open card's errors once the caregiver tries to move on from it.
  const [checkOpen, setCheckOpen] = useState(false);
  const nextKey = useRef(1);
  const nameRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLSelectElement | HTMLInputElement>(null);
  const [showNeedOne, setShowNeedOne] = useState(false);
  const needOneRef = useRef<HTMLParagraphElement>(null);
  const uid = useId(); // unique: hidden copies of this page stay mounted
  const ids = {
    name: `${uid}-name`,
    nameErr: `${uid}-name-error`,
    birthErr: `${uid}-birth-error`,
  };

  // Focus the name field as soon as it appears.
  useEffect(() => {
    if (editing !== null) nameRef.current?.focus();
  }, [editing]);

  const today = todayISO();
  const trackedIds = new Set(tracked.map((c) => c.myAccountChildId).filter(Boolean));
  const check = (m: ManualChild) => validateChildBasics({ name: m.name, birth: m.birth }, today);
  const editingChild = manual.find((m) => m.key === editing);
  const open = editingChild ? check(editingChild) : null;
  const openErrors = checkOpen && open ? open.errors : {};
  // Collapsed cards count when checked; the open card counts once it's complete.
  const manualIncluded = manual.filter((m) => m.checked && check(m).valid);
  const count = selected.size + manualIncluded.length;

  /** The open card is complete, or empty enough to ignore. Otherwise show its errors. */
  function openCardOk(allowBlank: boolean): boolean {
    if (!open || open.valid || (allowBlank && open.blank)) return true;
    setCheckOpen(true);
    (open.errors.name ? nameRef : birthRef).current?.focus();
    return false;
  }

  function addChild() {
    setShowNeedOne(false);
    // Don't stack another card until this one has a name and birth month/year.
    if (!openCardOk(false)) return;
    const key = nextKey.current++;
    setManual((m) => [...m, { key, name: '', birth: emptyDateInput, checked: true }]);
    setEditing(key); // the previous one (if any) collapses into a card
    setCheckOpen(false);
  }

  function updateManual(key: number, patch: Partial<ManualChild>) {
    setManual((m) => m.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    setShowNeedOne(false);
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setShowNeedOne(false);
  }

  async function onContinue() {
    if (!openCardOk(true)) return;
    if (count === 0) {
      setShowNeedOne(true);
      requestAnimationFrame(() => needOneRef.current?.focus());
      return;
    }
    const base = tracked.reduce((max, c) => Math.max(max, c.setupOrder + 1), 0);
    // List order: account children as listed, then the manual entries.
    const fromProfile = (profile.data ?? []).filter((c) => selected.has(c.myAccountChildId));
    const batch: NewChild[] = [
      ...fromProfile.map((c) => ({
        source: 'myAccount' as const,
        myAccountChildId: c.myAccountChildId,
        name: c.name,
        dateOfBirth: c.dateOfBirth,
        pediatrician: c.pediatrician,
        setupComplete: false,
        setupOrder: 0,
      })),
      ...manualIncluded.map((m) => ({
        source: 'manual' as const,
        name: m.name.trim(),
        dateOfBirth: check(m).dobISO, // 1st of the birth month
        dateOfBirthPrecision: 'month' as const,
        setupComplete: false,
        setupOrder: 0,
      })),
    ].map((c, i) => ({ ...c, setupOrder: base + i }));

    const created = await create.mutateAsync(batch).catch(() => null);
    if (!created) return; // error shown below; selections kept
    const first = [...created].sort((a, b) => a.setupOrder - b.setupOrder)[0];
    router.push(setupHref(mode, first.id, { start: base, from }));
  }

  return (
    <section className={s.screen}>
      <h1>{mode === 'onboarding' ? t('title') : t('titleLater')}</h1>
      <p className={s.lede}>{t('intro')}</p>

      <div>
        <h2>{t('fromAccount')}</h2>
        {profileGate ??
          (profile.data?.length ? (
            <>
              <p className={s.lede}>{t('fromAccountHint')}</p>
              <ul className={s.list} style={{ marginTop: 'var(--space-3)' }}>
                {profile.data.map((c) => {
                  const already = trackedIds.has(c.myAccountChildId);
                  // Birth month and year only: the day isn't shown anywhere.
                  const born = t('born', {
                    date: formatMonthYear(c.dateOfBirth, locale as 'en' | 'es'),
                  });
                  return (
                    <li key={c.myAccountChildId}>
                      {already ? (
                        <div className={`${s.choice} ${s.choiceDisabled}`}>
                          <span className={s.choiceText}>
                            <span className={s.choiceTitle}>{c.name}</span>
                            <span className={s.choiceSub}>{born}</span>
                          </span>
                          <span className={s.tag}>{t('alreadyAdded')}</span>
                        </div>
                      ) : (
                        <label className={s.choice}>
                          <input type="checkbox" checked={selected.has(c.myAccountChildId)} onChange={(e) => toggle(c.myAccountChildId, e.target.checked)} />
                          <span className={s.choiceText}>
                            <span className={s.choiceTitle}>{c.name}</span>
                            <span className={s.choiceSub}>{born}</span>
                          </span>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className={s.lede}>{t('noAccountChildren')}</p>
          ))}
      </div>

      <div>
        <h2>{t('manualHeading')}</h2>
        {manual.length > 0 && (
          <ul className={s.list} style={{ marginBottom: 'var(--space-3)' }}>
            {manual.map((m) =>
              m.key === editing ? (
                <li key={m.key} className={s.nameCard}>
                  <div className={s.labelRow}>
                    <label htmlFor={ids.name} className={s.label}>
                      {t('childName')}
                    </label>
                    <button
                      type="button"
                      className={s.linkButton}
                      aria-label={t('removeName')}
                      onClick={() => {
                        setManual((list) => list.filter((c) => c.key !== m.key));
                        setEditing(null);
                        setCheckOpen(false);
                      }}
                    >
                      {t('remove')}
                    </button>
                  </div>
                  <input
                    ref={nameRef}
                    id={ids.name}
                    className={s.input}
                    autoComplete="off"
                    value={m.name}
                    onChange={(e) => updateManual(m.key, { name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    aria-invalid={!!openErrors.name || undefined}
                    aria-describedby={openErrors.name ? ids.nameErr : undefined}
                  />
                  {openErrors.name && (
                    <p id={ids.nameErr} className={s.error}>
                      <AlertIcon />
                      {t(openErrors.name)}
                    </p>
                  )}
                  <DateFields
                    legend={t('birthLegend')}
                    monthYearOnly
                    firstRef={birthRef}
                    value={m.birth}
                    onChange={(birth) => updateManual(m.key, { birth })}
                    invalid={!!openErrors.birth}
                    describedBy={openErrors.birth ? ids.birthErr : undefined}
                  />
                  {openErrors.birth && (
                    <p id={ids.birthErr} className={s.error}>
                      <AlertIcon />
                      {t(openErrors.birth)}
                    </p>
                  )}
                </li>
              ) : (
                <li key={m.key}>
                  <label className={s.choice}>
                    <input type="checkbox" checked={m.checked} onChange={(e) => updateManual(m.key, { checked: e.target.checked })} />
                    <span className={s.choiceText}>
                      <span className={s.choiceTitle}>{m.name}</span>
                      <span className={s.choiceSub}>
                        {t('born', {
                          date: formatMonthYear(check(m).dobISO!, locale as 'en' | 'es'),
                        })}
                      </span>
                    </span>
                  </label>
                </li>
              ),
            )}
          </ul>
        )}
        <button type="button" className="btn btn-block" onClick={addChild}>
          + {t('addManual')}
        </button>
      </div>

      {showNeedOne && (
        <p ref={needOneRef} tabIndex={-1} role="alert" className={s.error}>
          <AlertIcon />
          {t('needOne')}
        </p>
      )}
      {create.isError && (
        <p role="alert" className={s.formError}>
          {tErr('saveFailed')}
        </p>
      )}

      <div className={s.actions}>
        <p className={s.count} aria-live="polite">
          {t('count', { count })}
        </p>
        <div className={s.actionsInner}>
          {mode === 'later' && (
            <Link href={from} className="btn">
              {t('cancel')}
            </Link>
          )}
          <button type="button" className="btn btn-primary" disabled={create.isPending} onClick={onContinue}>
            {t('continue')}
          </button>
        </div>
      </div>
    </section>
  );
}
