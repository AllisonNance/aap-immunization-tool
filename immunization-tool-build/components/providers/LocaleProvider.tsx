'use client';
// One language on screen at a time (SPEC.md §8). Signed in: the account's
// locale, changed in Settings. Signed out (the sample-data page and screen 0,
// which have no toggle): the browser's language.
import { NextIntlClientProvider } from 'next-intl';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAccount, useSetLocale } from '@/lib/api/hooks';
import type { Locale } from '@/lib/api/schemas';
import { isDev } from '@/lib/config';
import { defaultLocale, messages } from '@/lib/i18n';

interface LocaleContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
  saving: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocaleSetting() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocaleSetting outside LocaleProvider');
  return ctx;
}

function browserLocale(): Locale {
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : defaultLocale;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { data: account } = useAccount();
  const setAccountLocale = useSetLocale();
  const [signedOutLocale] = useState<Locale>(browserLocale);

  const locale = account?.locale ?? signedOutLocale;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value: LocaleContextValue = {
    locale,
    saving: setAccountLocale.isPending,
    setLocale(next) {
      if (account) setAccountLocale.mutate(next);
    },
  };

  return (
    <LocaleContext value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages[locale]}
        timeZone="UTC"
        // Dev: make a missing translation visible (and testable) instead of
        // silently showing its key. Production shows the key quietly.
        onError={(e) => {
          if (isDev) console.error(e.message);
        }}
        getMessageFallback={({ namespace, key }) => (isDev ? `⟦missing: ${namespace ? `${namespace}.` : ''}${key}⟧` : key)}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext>
  );
}
