import { describe, expect, it } from 'vitest';
import { catalog } from '@/lib/data';
import { searchVaccines } from '@/lib/search/vaccines';

const ids = (q: string) => searchVaccines(q, catalog.vaccines).map((v) => v.id);

describe('vaccine search (SPEC.md §6.4a)', () => {
  it('finds by abbreviation and name', () => {
    expect(ids('MMR')[0]).toBe('mmr');
    expect(ids('dtap')[0]).toBe('dtap');
    expect(ids('hepatitis b')[0]).toBe('hepb');
    expect(ids('Chickenpox')[0]).toBe('varicella');
  });

  it('finds by alias and product name', () => {
    expect(ids('polio')).toContain('ipv');
    expect(ids('Engerix')[0]).toBe('hepb');
  });

  it('works in Spanish and ignores accents', () => {
    expect(ids('sarampion')).toContain('mmr');
    expect(ids('varicela')).toContain('varicella');
  });

  it('tolerates small typos', () => {
    expect(ids('hepatits b')[0]).toBe('hepb');
    expect(ids('rotavirsu')).toContain('rotavirus');
    expect(ids('meningococal')).toContain('menacwy');
  });

  it('does not invent matches for short typos or unknown vaccines', () => {
    expect(ids('BCG')).toEqual([]);
    expect(ids('xyz')).toEqual([]);
    expect(ids('')).toEqual([]);
  });
});
