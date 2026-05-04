// =============================================================================
// Module 11 B2 — Tests d'isolation normalizers (résolution dette #1)
// =============================================================================
//
// Vérifie que `normalizeRateOrDividend` et `normalizeSigma` (split de l'ancienne
// `normalizeRateUnit`) ont les comportements attendus pour leurs contextes
// métier respectifs.
//
// Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §3.3
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  normalizeRateOrDividend,
  normalizeRateUnit,
  normalizeSigma,
} from '../../../../../supabase/functions/_shared/buildPythonPayload';

// ---------------------------------------------------------------------------
// normalizeRateOrDividend — taux d'intérêt et dividend yield
// ---------------------------------------------------------------------------

describe('normalizeRateOrDividend', () => {
  it('converts percent (3.2) to fraction (0.032)', () => {
    expect(normalizeRateOrDividend(3.2)).toBeCloseTo(0.032, 10);
  });

  it('keeps fraction (0.032) as-is', () => {
    expect(normalizeRateOrDividend(0.032)).toBe(0.032);
  });

  it('returns 0 for null/undefined', () => {
    expect(normalizeRateOrDividend(null)).toBe(0);
    expect(normalizeRateOrDividend(undefined)).toBe(0);
  });

  it('handles 0 (no rate)', () => {
    expect(normalizeRateOrDividend(0)).toBe(0);
  });

  it('treats 1.0 as fraction (= 100% — keep as-is)', () => {
    // Edge case ambigu : 1.0 = 100% en pourcent ou 1.0 fraction = 100%.
    // Convention : on tranche pour fraction (un taux flat 100% serait absurde
    // mais le résultat est le même : 1.0 dans les deux interprétations).
    expect(normalizeRateOrDividend(1.0)).toBe(1.0);
  });

  it('converts 100 (= 100% en pourcent) to 1.0 fraction', () => {
    // Edge case rate très élevé saisi en pourcent.
    expect(normalizeRateOrDividend(100)).toBe(1.0);
  });

  it('throws on negative value', () => {
    expect(() => normalizeRateOrDividend(-0.01)).toThrow(/Rate cannot be negative/);
    expect(() => normalizeRateOrDividend(-3.2)).toThrow(/-3\.2/);
  });

  it('handles small positive values just above 0', () => {
    expect(normalizeRateOrDividend(0.0001)).toBe(0.0001);
  });
});

// ---------------------------------------------------------------------------
// normalizeSigma — volatilité avec validation des bornes métier
// ---------------------------------------------------------------------------

describe('normalizeSigma', () => {
  it('keeps standard fraction (0.18) as-is', () => {
    expect(normalizeSigma(0.18)).toBe(0.18);
  });

  it('keeps high but valid fraction (0.30 = 30%) as-is', () => {
    expect(normalizeSigma(0.3)).toBe(0.3);
  });

  it('keeps lower bound 0.01 (= 1%) as-is', () => {
    expect(normalizeSigma(0.01)).toBe(0.01);
  });

  it('keeps upper bound 5.0 (= 500%) as-is', () => {
    expect(normalizeSigma(5.0)).toBe(5.0);
  });

  it('throws on too low (< 0.01) — asset trop stable', () => {
    expect(() => normalizeSigma(0.005)).toThrow(/Volatility too low/);
    expect(() => normalizeSigma(0.005)).toThrow(/0\.01/);
  });

  it('throws on unrealistic (> 5.0) — saisie en pourcent ?', () => {
    expect(() => normalizeSigma(6.0)).toThrow(/Volatility unrealistic/);
    expect(() => normalizeSigma(18)).toThrow(/Volatility unrealistic/);
  });

  it('throws on null/undefined', () => {
    expect(() => normalizeSigma(null)).toThrow(/Volatility is required/);
    expect(() => normalizeSigma(undefined)).toThrow(/Volatility is required/);
  });

  it('throws on negative value (catches sign-flip bugs)', () => {
    // -0.5 passe le check < 0.01 trivialement et déclenche le message
    expect(() => normalizeSigma(-0.5)).toThrow(/Volatility too low/);
  });

  it('does NOT convert percent to fraction (différent de normalizeRateOrDividend)', () => {
    // Cas critique : un sigma=18 (utilisateur saisit % au lieu de fraction)
    // doit throw, PAS être converti à 0.18 silencieusement (c'était le bug
    // de l'ancienne `normalizeRateUnit`).
    expect(() => normalizeSigma(18)).toThrow(/Volatility unrealistic/);
  });
});

// ---------------------------------------------------------------------------
// normalizeRateUnit — backward compat (deprecated mais conservée)
// ---------------------------------------------------------------------------

describe('normalizeRateUnit (deprecated alias)', () => {
  it('delegates to normalizeRateOrDividend for rates', () => {
    expect(normalizeRateUnit(3.2)).toBeCloseTo(0.032, 10);
    expect(normalizeRateUnit(0.032)).toBe(0.032);
    expect(normalizeRateUnit(null)).toBe(0);
  });

  it('does NOT delegate to normalizeSigma — old behavior preserved', () => {
    // L'ancienne fonction acceptait sigma=18 et retournait 0.18 silencieusement.
    // On garde ce comportement legacy pour ne pas casser un downstream
    // imprévu, mais on documente que c'est dépréciée.
    expect(normalizeRateUnit(18)).toBe(0.18);
  });
});
