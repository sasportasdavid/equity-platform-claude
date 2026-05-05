import { describe, expect, it } from 'vitest';
import { compactEurUnit, formatCompactEur } from '../format-compact-eur';

describe('formatCompactEur (PR #37 B2)', () => {
  it('formate les milliards en "X,Y"', () => {
    expect(formatCompactEur(1_200_000_000)).toBe('1,2');
    expect(formatCompactEur(3_057_060_540)).toBe('3,1');
  });

  it('formate les millions en "XX,Y" (canonique mockup)', () => {
    expect(formatCompactEur(12_400_000)).toBe('12,4');
    expect(formatCompactEur(1_209_600)).toBe('1,2');
  });

  it('formate les milliers en entier (k€)', () => {
    expect(formatCompactEur(847_000)).toBe('847');
    expect(formatCompactEur(345_600)).toBe('346');
  });

  it('formate les unités < 1 k€ en entier (€)', () => {
    expect(formatCompactEur(312)).toBe('312');
    expect(formatCompactEur(0)).toBe('0');
  });

  it('supporte les valeurs négatives (preserve sign)', () => {
    expect(formatCompactEur(-12_400_000)).toBe('-12,4');
    expect(formatCompactEur(-2_982)).toBe('-3');
  });
});

describe('compactEurUnit', () => {
  it('retourne Md€ pour >= 1 Md', () => {
    expect(compactEurUnit(1_500_000_000)).toBe('Md€');
  });

  it('retourne M€ pour [1M, 1Md[', () => {
    expect(compactEurUnit(12_400_000)).toBe('M€');
    expect(compactEurUnit(999_999_999)).toBe('M€');
  });

  it('retourne k€ pour [1k, 1M[', () => {
    expect(compactEurUnit(847_000)).toBe('k€');
    expect(compactEurUnit(1_000)).toBe('k€');
  });

  it('retourne € pour < 1k', () => {
    expect(compactEurUnit(312)).toBe('€');
    expect(compactEurUnit(0)).toBe('€');
  });
});
