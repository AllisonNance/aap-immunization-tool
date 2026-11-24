import { describe, expect, it } from 'vitest';
import { validateChildBasics } from '@/lib/validation/child';

const today = '2026-11-23';
const v = (name: string, month: string, year: string) => validateChildBasics({ name, birth: { year, month, day: '' } }, today);

describe('child basics: first name + birth month and year (1b, 1c)', () => {
  it('stores the 1st of the birth month', () => {
    expect(v('Leo', '10', '2021')).toEqual({ errors: {}, warnings: {}, valid: true, blank: false, dobISO: '2021-10-01' });
  });

  it('allows the current month', () => {
    expect(v('Maya', '11', '2026').valid).toBe(true);
  });

  it('ignores a day even if one is present', () => {
    expect(validateChildBasics({ name: 'Leo', birth: { year: '2021', month: '10', day: '17' } }, today).dobISO).toBe('2021-10-01');
  });

  it('requires a name (whitespace does not count) and both month and year', () => {
    expect(v('  ', '10', '2021').errors).toEqual({ name: 'nameRequired' });
    expect(v('Leo', '10', '').errors).toEqual({ birth: 'birthRequired' });
    expect(v('Leo', '', '2021').errors).toEqual({ birth: 'birthRequired' });
  });

  it('needs a 4-digit year', () => {
    expect(v('Leo', '10', '21').errors).toEqual({ birth: 'birthInvalid' });
  });

  it('rejects a month in the future', () => {
    expect(v('Leo', '12', '2026').errors).toEqual({ birth: 'birthFuture' });
  });

  it('warns, but does not block, more than 21 years ago', () => {
    expect(v('Sam', '10', '2005')).toMatchObject({ valid: true, warnings: { birth: 'dobOld' } });
    expect(v('Sam', '11', '2005').warnings).toEqual({});
  });

  it('treats a completely empty entry as blank', () => {
    expect(v('', '', '')).toMatchObject({ blank: true, valid: false });
    expect(v('Leo', '', '').blank).toBe(false);
  });
});
