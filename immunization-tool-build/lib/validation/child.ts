// A child's basics, used in Add Children (1b) and Child Setup (1c): first
// name, and month + year of birth (no day: it isn't collected or shown).
// Rules: name required; month and year required, a real year, not a future
// month; more than 21 years ago warns but doesn't block.
import { addAge, checkDateInput, type DateInput } from '@/lib/dates';

export type ChildBasicsError = 'nameRequired' | 'birthRequired' | 'birthInvalid' | 'birthFuture';
export type ChildBasicsWarning = 'dobOld';

export interface ChildBasics {
  name: string;
  /** From the month + year picker; `day` is ignored. */
  birth: DateInput;
}

export interface ChildBasicsResult {
  errors: { name?: ChildBasicsError; birth?: ChildBasicsError };
  warnings: { birth?: ChildBasicsWarning };
  valid: boolean;
  /** Completely blank (no name, no date): ignored rather than an error. */
  blank: boolean;
  /** 1st of the birth month, when the month and year are valid. */
  dobISO?: string;
}

const OLDEST_EXPECTED = { value: 21, unit: 'years' } as const;

export function validateChildBasics(values: ChildBasics, today: string): ChildBasicsResult {
  const errors: ChildBasicsResult['errors'] = {};
  const warnings: ChildBasicsResult['warnings'] = {};
  if (!values.name.trim()) errors.name = 'nameRequired';

  const birth = checkDateInput({ ...values.birth, day: '' }, { requireDay: false });
  let dobISO: string | undefined;
  if (birth.kind === 'empty' || birth.kind === 'incomplete') errors.birth = 'birthRequired';
  else if (birth.kind === 'invalid') errors.birth = 'birthInvalid';
  else if (birth.iso.slice(0, 7) > today.slice(0, 7)) errors.birth = 'birthFuture';
  else {
    dobISO = birth.iso;
    if (birth.iso.slice(0, 7) < addAge(today, OLDEST_EXPECTED, -1).slice(0, 7)) warnings.birth = 'dobOld';
  }

  const blank = !values.name.trim() && birth.kind === 'empty';
  return { errors, warnings, valid: Object.keys(errors).length === 0, blank, dobISO };
}
