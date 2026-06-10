import { describe, expect, it } from 'vitest';

import { simulateStockOption } from '../stockOption';
import type { SimulationInput } from '../types';

const baseInput: SimulationInput = {
  planType: 'STOCK_OPTION',
  attributionDate: new Date('2022-01-01'),
  exerciseDate: new Date('2026-06-01'),
  cessionDate: new Date('2026-06-01'),
  unitsToExercise: 1000,
  strikePrice: 5,
  fmvAtExercise: 10, // PV acquisition = 5 × 1000 = 5000
  fmvAtCession: 13, // PV cession = 3 × 1000 = 3000
  tmiMode: 'manual',
  manualTmiRate: 30,
};

describe('simulateStockOption (qualifié)', () => {
  it('T1: SO qualifié, gain acquisition 5000 € + gain cession 3000 €', () => {
    const result = simulateStockOption(baseInput);

    expect(result.regime).toBe('STOCK_OPTION_QUALIFIE');
    expect(result.acquisitionTaxableBase).toBe(5000);
    // IR acquisition via TMI 30 = 5000 × 30% = 1500
    expect(result.acquisitionIncomeTax).toBeCloseTo(1500, 2);
    // Social sur gain de levée = CSG/CRDS activité 9,7% + contribution
    // salariale spécifique 10% (CSS L.137-14) = 19,7% × 5000 = 985.
    // (Ancien comportement bugué : 9,7% seul → 485.)
    expect(result.acquisitionSocialContributions).toBeCloseTo(985, 2);

    expect(result.cessionTaxableBase).toBe(3000);
    // PFU 12.8% × 3000 = 384
    expect(result.cessionIncomeTax).toBeCloseTo(384, 2);
    // PS 18.6% × 3000 = 558
    expect(result.cessionSocialContributions).toBeCloseTo(558, 2);

    // Total = 1500 + 985 + 384 + 558 = 3427
    expect(result.totalTaxAmount).toBeCloseTo(3427, 2);
    // Net = 8000 - 3427 = 4573
    expect(result.netGainAmount).toBeCloseTo(4573, 2);
  });

  it('T2: SO non-qualifié → +9,7% cotisations salariales sur PV acquisition', () => {
    const result = simulateStockOption(baseInput, 'non_qualifie');

    expect(result.regime).toBe('STOCK_OPTION_NON_QUALIFIE');
    // Base : CSG 9,7% + contrib spécifique 10% = 19,7%
    // + non-qualifié : cotisations salariales 9,7% en sus
    // → 29,4% × 5000 = 1470
    expect(result.acquisitionSocialContributions).toBeCloseTo(1470, 2);
    expect(result.warnings.some((w) => w.includes('non-qualifié'))).toBe(true);
  });

  it('T3: option barème IR sur PV cession (au lieu PFU)', () => {
    const result = simulateStockOption({
      ...baseInput,
      optBaremeProgressif: true,
    });

    // PV cession via TMI 30 = 3000 × 30% = 900 (au lieu de 384 en PFU)
    expect(result.cessionIncomeTax).toBeCloseTo(900, 2);
  });

  it('T4: TMI 45 → IR acquisition plus élevée', () => {
    const result = simulateStockOption({
      ...baseInput,
      manualTmiRate: 45,
    });

    expect(result.acquisitionIncomeTax).toBeCloseTo(2250, 2); // 5000 × 45%
  });

  it('T5: 0 unités → erreur', () => {
    expect(() => simulateStockOption({ ...baseInput, unitsToExercise: 0 })).toThrow();
  });

  it('T6: cession concomitante (fmvAtCession non fourni → = fmvAtExercise)', () => {
    const result = simulateStockOption({
      ...baseInput,
      cessionDate: undefined,
      fmvAtCession: undefined,
    });

    // Pas de PV cession (fmvAtCession = fmvAtExercise = 10)
    expect(result.cessionTaxableBase).toBe(0);
    expect(result.cessionIncomeTax).toBe(0);
  });

  it('T7: strike > FMV → moins-value', () => {
    const result = simulateStockOption({
      ...baseInput,
      strikePrice: 20,
      fmvAtExercise: 10,
      fmvAtCession: 12,
    });

    expect(result.grossGainAmount).toBe(-8000); // (12-20)*1000
    expect(result.acquisitionTaxableBase).toBe(0);
    expect(result.warnings.some((w) => w.includes('Moins-value'))).toBe(true);
  });

  it('T8: TMI auto via annualTaxableIncome', () => {
    const result = simulateStockOption({
      ...baseInput,
      tmiMode: 'auto',
      manualTmiRate: undefined,
      annualTaxableIncome: 50_000,
    });

    // computeIncomeTax(5000) en mode auto avec income 50K :
    // delta = IR(55000) - IR(50000)
    // IR(55000) = 17979 × 0.11 + (55000-29579) × 0.30 = 1977.69 + 7626.30 = 9603.99
    // IR(50000) = 8103.99
    // delta = 9603.99 - 8103.99 = 1500
    expect(result.acquisitionIncomeTax).toBeCloseTo(1500, 2);
  });

  it('T9 (cas chiffré contribution 10% L.137-14) : gain de levée 100K → social 19,7%', () => {
    // strike 1, FMV exercice 11 → gain de levée = 10 × 10 000 = 100 000
    const result = simulateStockOption({
      ...baseInput,
      unitsToExercise: 10_000,
      strikePrice: 1,
      fmvAtExercise: 11,
      fmvAtCession: 11, // pas de PV cession → isole le régime acquisition
      manualTmiRate: 41,
    });

    expect(result.acquisitionTaxableBase).toBe(100_000);
    expect(result.cessionTaxableBase).toBe(0);

    // Social = (CSG 9,7% + contrib 10%) × 100 000 = 19,7% × 100 000 = 19 700.
    // La contribution 10% (CSS L.137-14) DOIT être incluse — sa présence
    // est l'objet exact de ce test (sinon on aurait 9 700).
    expect(result.acquisitionSocialContributions).toBeCloseTo(19_700, 2);

    // IR : 100 000 × 41% = 41 000
    expect(result.acquisitionIncomeTax).toBeCloseTo(41_000, 2);
  });
});
