// Catalog search for Add to Record (SPEC.md §6.4a): names, abbreviations,
// aliases and product names in both languages, accent- and case-insensitive,
// tolerant of small typos. Pure.
import type { Vaccine } from '@/lib/data/schemas';

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Edit distance with transpositions, stopping early past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Typos allowed for a word of this length: none for short words. */
const allowed = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

function terms(v: Vaccine): string[] {
  return [v.id, v.abbreviation, v.name.en, v.name.es, ...v.searchAliases.en, ...v.searchAliases.es, ...v.productNames].map(normalize);
}

/** 0 = no match; higher is better. */
function score(query: string, v: Vaccine): number {
  const q = normalize(query);
  if (!q) return 0;
  const all = terms(v);
  if (all.some((t) => t === q)) return 100;
  if (all.some((t) => t.startsWith(q))) return 80;
  if (all.some((t) => t.split(' ').some((w) => w.startsWith(q)))) return 70;
  if (all.some((t) => t.includes(q))) return 60;
  // Every query word close to some word of one term (typos).
  const qWords = q.split(' ');
  const fuzzy = all.some((t) => {
    const tWords = t.split(' ');
    return qWords.every((qw) => tWords.some((tw) => distance(qw, tw, allowed(qw.length)) <= allowed(qw.length) || (qw.length >= 4 && tw.startsWith(qw))));
  });
  return fuzzy ? 40 : 0;
}

export function searchVaccines(query: string, vaccines: Vaccine[]): Vaccine[] {
  return vaccines
    .map((v) => ({ v, s: score(query, v) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
}
