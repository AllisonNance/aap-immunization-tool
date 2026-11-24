// Screen 0 email field: required, and shaped like an address.
export type EmailError = 'emailRequired' | 'emailInvalid';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): EmailError | null {
  const v = value.trim();
  if (!v) return 'emailRequired';
  return EMAIL.test(v) ? null : 'emailInvalid';
}
