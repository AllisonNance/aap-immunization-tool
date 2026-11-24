// Reminder contact fields (SPEC.md §6.8). US numbers for SMS in v1.
export type ContactError = 'phoneRequired' | 'phoneInvalid' | 'emailRequired' | 'emailInvalid';

/** 10 digits, or 11 starting with 1; spaces, dashes, dots and parentheses allowed. */
export function validatePhone(value: string): ContactError | null {
  const v = value.trim();
  if (!v) return 'phoneRequired';
  if (/[^\d\s().+-]/.test(v)) return 'phoneInvalid';
  const digits = v.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1')) ? null : 'phoneInvalid';
}

/** "(312) 555-0199" from any accepted form. */
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : value.trim();
}

export function validateEmailAddress(value: string): ContactError | null {
  const v = value.trim();
  if (!v) return 'emailRequired';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'emailInvalid';
}
