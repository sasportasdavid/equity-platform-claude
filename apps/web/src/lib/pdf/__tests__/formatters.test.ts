import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatDateShort, formatNumber } from '../formatters';

/**
 * PR #9 Bug #36 — formatNumber doit utiliser U+00A0 (NO-BREAK SPACE)
 * comme séparateur de milliers, PAS U+202F (NARROW NO-BREAK SPACE).
 *
 * Pourquoi : depuis Node 13+, Intl.NumberFormat fr-FR émet U+202F par
 * défaut (CLDR change). Mais react-pdf Helvetica n'a pas ce glyphe → le
 * PDF affichait `1/200` (slash/tofu) au lieu de `1 200`. La fonction
 * `normalizeSpaces` du module remplace U+202F → U+00A0 qui est supporté
 * par toutes les fontes PDF standard.
 */

const NBSP = ' ';
const NNBSP = ' ';

describe('formatNumber', () => {
  it('1200 → "1 200" avec U+00A0 (pas U+202F)', () => {
    const result = formatNumber(1200);
    expect(result).toBe(`1${NBSP}200`);
    expect(result).not.toContain(NNBSP);
  });

  it('123456789 → "123 456 789" avec U+00A0 partout', () => {
    const result = formatNumber(123456789);
    expect(result).toBe(`123${NBSP}456${NBSP}789`);
    expect(result).not.toContain(NNBSP);
  });

  it('null/undefined/NaN/string-invalide → "—"', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber('abc')).toBe('—');
  });

  it('accepte string numérique', () => {
    expect(formatNumber('1500')).toBe(`1${NBSP}500`);
  });

  it('zéro et négatifs', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-1500)).toBe(`-1${NBSP}500`);
  });
});

describe('formatCurrency', () => {
  it('1500.50 → "1 500,50 €" avec U+00A0', () => {
    const result = formatCurrency(1500.5);
    expect(result).not.toContain(NNBSP);
    expect(result).toContain(NBSP);
    expect(result).toContain('€');
    expect(result).toContain('1');
    expect(result).toContain('500');
  });

  it('null → "—"', () => {
    expect(formatCurrency(null)).toBe('—');
  });
});

describe('formatDate', () => {
  it('ISO date → format fr long', () => {
    const result = formatDate('2026-01-15T10:00:00Z');
    expect(result).toMatch(/15 janvier 2026/);
  });

  it('null/invalide → "—"', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('formatDateShort', () => {
  it('ISO date → format fr court', () => {
    const result = formatDateShort('2026-01-15T10:00:00Z');
    expect(result).toMatch(/15\/01\/2026/);
  });
});
