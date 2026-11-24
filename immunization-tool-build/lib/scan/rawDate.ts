// Printed dates on scanned records ("03/04/2015"). Pure.
import { isValidISODate } from '@/lib/dates';

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export interface RawDateReadings {
  /** Both readings when the first two parts could each be a month ("03/04"). */
  ambiguous: boolean;
  /** Valid readings: month-first first, then day-first. One entry when unambiguous. */
  options: string[];
}

/** Reads DD/MM/YYYY or MM/DD/YYYY. "03/04/2015" → March 4 or April 3; "15/02/2014" → Feb 15 only. */
export function readRawDate(raw: string): RawDateReadings {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(raw);
  if (!m) return { ambiguous: false, options: [] };
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const monthFirst = iso(y, a, b);
  const dayFirst = iso(y, b, a);
  const options = [...new Set([monthFirst, dayFirst].filter(isValidISODate))];
  return { ambiguous: options.length > 1, options };
}
