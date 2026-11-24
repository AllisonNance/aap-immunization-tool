// App-wide constants and feature flags (SPEC.md §6.1a, §13).

/** Bump when the agreement text changes; caregivers see 1a again. */
export const AGREEMENT_VERSION = '2026-11-23';

/**
 * Full legal documents linked from 1a. PLACEHOLDERS: SPEC.md §13 leaves the
 * agreement text and its owner open, so these point nowhere until AAP supplies them.
 */
export const legalLinks = {
  terms: '#terms-of-use',
  privacy: '#privacy-policy',
} as const;

/** AAP My Account (identity). PLACEHOLDER until the real address is confirmed (SPEC.md §13). */
export const myAccountUrl = '#my-account';

export const flags = {
  /** Do pediatrician-confirmed custom vaccines count toward AAP status? Open question, default off. */
  FEATURE_CUSTOM_COUNTS: false,
} as const;

export const isDev = process.env.NODE_ENV !== 'production';

/** MSW runs in dev and tests. Set NEXT_PUBLIC_API_MOCKING=off to point at a real API. */
export const apiMockingEnabled = process.env.NEXT_PUBLIC_API_MOCKING !== 'off';

/**
 * Where a logged-out visitor starts. With the mock API in dev it's the
 * "Choose sample data" page (not an IA screen); otherwise screen 0.
 */
export const entryPath = isDev && apiMockingEnabled ? '/start' : '/login';
