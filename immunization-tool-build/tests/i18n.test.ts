// Fails the build if any key is missing from either message file (SPEC.md §8).
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { ageParts, formatDate } from '@/lib/i18n';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('message files', () => {
  it('have exactly the same keys in en and es', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it('have no empty strings', () => {
    for (const [name, file] of Object.entries({ en, es })) {
      const empty = keys(file).filter((k) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], file) === '');
      expect(empty, name).toEqual([]);
    }
  });
});

describe('formatting', () => {
  it('shows dates with month names, never numeric-only', () => {
    expect(formatDate('2027-03-04', 'en')).toBe('Mar 4, 2027');
    expect(formatDate('2027-03-04', 'es')).toMatch(/mar/i);
    expect(formatDate('2027-03-04', 'es')).not.toMatch(/^\d+\/\d+/);
  });

  it('says ages in the largest sensible unit', () => {
    expect(ageParts('2026-05-18', '2026-11-23')).toEqual({ unit: 'months', count: 6 });
    expect(ageParts('2021-10-14', '2026-11-23')).toEqual({ unit: 'years', count: 5 });
    expect(ageParts('2025-03-20', '2026-11-23')).toEqual({ unit: 'months', count: 20 });
    expect(ageParts('2026-11-20', '2026-11-23')).toEqual({ unit: 'days', count: 3 });
  });
});
