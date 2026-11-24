'use client';
// Screen 0 · Log in (SPEC.md §6.0, restyled to the design reference): a card
// with an email field, Continue, and "Don't have an account? Register here."
// MOCK: the email isn't sent or stored. Continue signs in to the sample account
// chosen on the page before this one (/start); Register starts a new account
// (the first-visit sample family). The real AAP My Account flow replaces this.
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { AlertIcon } from '@/components/shell/icons';
import { useLogin } from '@/lib/api/hooks';
import { safeNext } from '@/lib/guards';
import { validateEmail } from '@/lib/validation/login';
import s from './login.module.css';

export function LoginScreen() {
  const t = useTranslations('login');
  const router = useRouter();
  const search = useSearchParams();
  const login = useLogin();
  const next = safeNext(search.get('next'));

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const uid = useId(); // unique: hidden copies of this page stay mounted
  const ids = {
    title: `${uid}-title`,
    email: `${uid}-email`,
    req: `${uid}-required`,
    err: `${uid}-error`,
  };

  const emailError = submitted ? validateEmail(email) : null;

  // Muted page background only while this screen is visible. Next keeps hidden
  // pages mounted but runs effect cleanup when it hides them.
  useEffect(() => {
    document.body.dataset.backdrop = 'muted';
    return () => {
      delete document.body.dataset.backdrop;
    };
  }, []);

  function signIn(accountKey?: string) {
    login.mutate(accountKey, {
      // Returning → `next` or Home. First visit: the route guard sends them on to 1a.
      onSuccess: () => router.replace(next ?? '/'),
    });
  }

  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (validateEmail(email)) {
      emailRef.current?.focus();
      return;
    }
    signIn();
  }

  return (
    <div className={s.backdrop}>
      <form className={s.card} noValidate onSubmit={onContinue} aria-labelledby={ids.title}>
        <h1 id={ids.title} className={s.title}>
          {t('title')}
        </h1>

        <div className={s.field}>
          <div className={s.labelRow}>
            <label htmlFor={ids.email} className={s.label}>
              {t('email')}
            </label>
            <span id={ids.req} className={s.required}>
              {t('required')}
            </span>
          </div>
          <input
            ref={emailRef}
            id={ids.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            className={s.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
            aria-invalid={!!emailError}
            aria-describedby={emailError ? `${ids.req} ${ids.err}` : ids.req}
          />
          {emailError && (
            <p id={ids.err} className={s.fieldError}>
              <AlertIcon />
              {t(emailError)}
            </p>
          )}
        </div>

        {login.isError && (
          <p role="alert" className={s.formError}>
            {t('error')}
          </p>
        )}

        <button type="submit" className={s.continue} disabled={login.isPending}>
          {t('continue')}
        </button>

        <p className={s.register}>
          {t('noAccount')} {/* Mock: a new account is the first-visit sample family. */}
          <button type="button" className={s.registerLink} disabled={login.isPending} onClick={() => signIn('new-family')}>
            {t('register')}
          </button>
        </p>
      </form>
    </div>
  );
}
