import { describe, expect, it } from 'vitest';
import { formatDateOrdinalFr } from '../format-date-fr';

describe('formatDateOrdinalFr (PR #36 B2)', () => {
  it("formate le 1er du mois en '1ᵉʳ {mois}'", () => {
    // Mois indexé 0 = janvier (= 5 = juin)
    expect(formatDateOrdinalFr(new Date(2026, 5, 1))).toBe('1ᵉʳ juin');
    expect(formatDateOrdinalFr(new Date(2026, 0, 1))).toBe('1ᵉʳ janvier');
    expect(formatDateOrdinalFr(new Date(2026, 11, 1))).toBe('1ᵉʳ décembre');
  });

  it("formate les autres jours en '{n} {mois}'", () => {
    expect(formatDateOrdinalFr(new Date(2026, 5, 15))).toBe('15 juin');
    expect(formatDateOrdinalFr(new Date(2026, 11, 3))).toBe('3 décembre');
    expect(formatDateOrdinalFr(new Date(2026, 7, 31))).toBe('31 août');
  });

  it('gère tous les mois français correctement', () => {
    const month0 = formatDateOrdinalFr(new Date(2026, 0, 5));
    const month1 = formatDateOrdinalFr(new Date(2026, 1, 5));
    const month2 = formatDateOrdinalFr(new Date(2026, 2, 5));
    const month3 = formatDateOrdinalFr(new Date(2026, 3, 5));
    const month4 = formatDateOrdinalFr(new Date(2026, 4, 5));
    const month6 = formatDateOrdinalFr(new Date(2026, 6, 5));
    const month8 = formatDateOrdinalFr(new Date(2026, 8, 5));
    const month9 = formatDateOrdinalFr(new Date(2026, 9, 5));
    const month10 = formatDateOrdinalFr(new Date(2026, 10, 5));
    expect(month0).toBe('5 janvier');
    expect(month1).toBe('5 février');
    expect(month2).toBe('5 mars');
    expect(month3).toBe('5 avril');
    expect(month4).toBe('5 mai');
    expect(month6).toBe('5 juillet');
    expect(month8).toBe('5 septembre');
    expect(month9).toBe('5 octobre');
    expect(month10).toBe('5 novembre');
  });
});
