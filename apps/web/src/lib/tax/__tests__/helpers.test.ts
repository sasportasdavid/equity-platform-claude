import { describe, expect, it } from 'vitest';

import {
  applyFlatTmi,
  computeIncomeTax,
  computeProgressiveIR,
  detectTmiFromIncome,
  yearsBetween,
} from '../helpers';

describe('computeProgressiveIR (barème 2026, sans décote V1)', () => {
  it('renvoie 0 pour une base nulle ou négative', () => {
    expect(computeProgressiveIR(0)).toBe(0);
    expect(computeProgressiveIR(-100)).toBe(0);
  });

  it('15 000 € → 374 € (slice 11601-15000 × 11%)', () => {
    expect(computeProgressiveIR(15_000)).toBeCloseTo(374, 2);
  });

  it('50 000 € → 8 103,99 € (1977,69 + 6126,30)', () => {
    // (29579-11600) × 11% + (50000-29579) × 30%
    // = 17979 × 0.11 + 20421 × 0.30
    // = 1977.69 + 6126.30 = 8103.99
    expect(computeProgressiveIR(50_000)).toBeCloseTo(8103.99, 2);
  });

  it('100 000 € → 24 800,52 € (passe en tranche 41%)', () => {
    // 17979 × 0.11 + 54998 × 0.30 + 15423 × 0.41
    // = 1977.69 + 16499.40 + 6323.43 = 24800.52
    expect(computeProgressiveIR(100_000)).toBeCloseTo(24800.52, 2);
  });

  it('applique le quotient familial (50 000 € / 2 parts)', () => {
    // perPart = 25000 → bracket 2 only : 25000 - 11600 = 13400 × 0.11 = 1474
    // total = 1474 × 2 = 2948
    expect(computeProgressiveIR(50_000, 2)).toBeCloseTo(2948, 2);
  });

  it('throw si householdParts ≤ 0', () => {
    expect(() => computeProgressiveIR(50_000, 0)).toThrow();
    expect(() => computeProgressiveIR(50_000, -1)).toThrow();
  });
});

describe('detectTmiFromIncome', () => {
  it('détecte TMI 0 pour revenu très bas', () => {
    expect(detectTmiFromIncome(10_000)).toBe(0);
  });

  it('détecte TMI 30 pour revenu 60 000 € célibataire', () => {
    expect(detectTmiFromIncome(60_000)).toBe(30);
  });

  it('détecte TMI 11 pour revenu 60 000 € avec 3 parts', () => {
    // perPart = 20000 → tranche 11%
    expect(detectTmiFromIncome(60_000, 3)).toBe(11);
  });

  it('détecte TMI 45 pour revenu très élevé', () => {
    expect(detectTmiFromIncome(300_000)).toBe(45);
  });
});

describe('yearsBetween', () => {
  it('3 ans pile entre deux 1er janvier (avec une bissextile 2024)', () => {
    expect(yearsBetween(new Date('2023-01-01'), new Date('2026-01-01'))).toBeCloseTo(3, 1);
  });

  it('1,59 ans entre 2024-06-01 et 2026-01-01', () => {
    expect(yearsBetween(new Date('2024-06-01'), new Date('2026-01-01'))).toBeCloseTo(1.59, 1);
  });
});

describe('applyFlatTmi', () => {
  it('applique simplement TMI × base', () => {
    expect(applyFlatTmi(10_000, 30)).toBe(3000);
    expect(applyFlatTmi(10_000, 0)).toBe(0);
  });

  it('renvoie 0 pour base négative', () => {
    expect(applyFlatTmi(-1000, 30)).toBe(0);
  });
});

describe('computeIncomeTax (wrapper manual / auto)', () => {
  it('mode manual → flat TMI', () => {
    expect(computeIncomeTax(10_000, { tmiMode: 'manual', manualTmiRate: 30 })).toBe(3000);
  });

  it('mode auto → effet marginal sur le revenu', () => {
    // income 50K (TMI 30) + base 10K → tax marginal 30% × 10K = 3000
    const result = computeIncomeTax(10_000, {
      tmiMode: 'auto',
      annualTaxableIncome: 50_000,
    });
    expect(result).toBeCloseTo(3000, 0);
  });
});
