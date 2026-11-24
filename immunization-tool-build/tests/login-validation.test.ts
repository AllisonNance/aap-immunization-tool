import { describe, expect, it } from 'vitest';
import { validateEmail } from '@/lib/validation/login';

describe('login email', () => {
  it('requires a value', () => {
    expect(validateEmail('')).toBe('emailRequired');
    expect(validateEmail('   ')).toBe('emailRequired');
  });

  it('needs an address shape', () => {
    expect(validateEmail('maya')).toBe('emailInvalid');
    expect(validateEmail('maya@example')).toBe('emailInvalid');
    expect(validateEmail('maya @example.com')).toBe('emailInvalid');
  });

  it('accepts a normal address, ignoring surrounding spaces', () => {
    expect(validateEmail(' parent@example.com ')).toBeNull();
  });
});
