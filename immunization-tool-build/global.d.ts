// Type-checks every translation key against the English message file.
import type en from './messages/en.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'en' | 'es';
    Messages: typeof en;
  }
}
