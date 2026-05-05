import { describe, expect, it } from 'vitest';
import { getInitials } from '../org-switcher-helpers';

describe('OrgSwitcherCard / getInitials helper (PR #35 B3)', () => {
  it("retourne '?' quand le nom est null/undefined/vide", () => {
    expect(getInitials(null)).toBe('?');
    expect(getInitials(undefined)).toBe('?');
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });

  it('extrait 2 initiales depuis un nom multi-mots', () => {
    expect(getInitials('Paragraphe Brass')).toBe('PB');
    expect(getInitials('capiwise demo')).toBe('CD');
    expect(getInitials('équipe finance')).toBe('ÉF');
  });

  it('retourne 2 lettres du premier mot quand le nom est mono-mot', () => {
    expect(getInitials('Capiwise')).toBe('CA');
    expect(getInitials('a')).toBe('A');
  });

  it('limite à 2 mots (ignore les mots suivants)', () => {
    expect(getInitials('Cap Wise Inc')).toBe('CW');
  });

  it('gère les espaces multiples et tabulations', () => {
    expect(getInitials('  Cap   Wise  ')).toBe('CW');
    expect(getInitials('Cap\tWise')).toBe('CW');
  });
});
