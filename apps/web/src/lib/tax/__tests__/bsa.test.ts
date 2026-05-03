import { describe, expect, it } from 'vitest';

import { simulateBsa } from '../bsa';
import type { SimulationInput } from '../types';

const baseInput: SimulationInput = {
  planType: 'BSA',
  attributionDate: new Date('2024-01-01'),
  exerciseDate: new Date('2026-06-01'),
  unitsToExercise: 1000,
  strikePrice: 0.5,
  fmvAtExercise: 5,
  fmvAtCession: 5,
  tmiMode: 'manual',
  manualTmiRate: 30,
};

describe('simulateBsa', () => {
  it('T1: 1000 BSA, prix 0,50 €, FMV cession 5 € → PFU 31,4%', () => {
    const result = simulateBsa(baseInput);

    expect(result.regime).toBe('BSA');
    expect(result.grossGainAmount).toBe(4500); // (5 - 0.5) × 1000
    // PFU 12.8% × 4500 = 576
    expect(result.cessionIncomeTax).toBeCloseTo(576, 2);
    // PS 18.6% × 4500 = 837
    expect(result.cessionSocialContributions).toBeCloseTo(837, 2);
    expect(result.totalTaxAmount).toBeCloseTo(1413, 2);
    expect(result.effectiveTaxRate).toBeCloseTo(0.314, 2);
  });

  it('T2: option barème IR + TMI 30% → 30% IR au lieu PFU', () => {
    const result = simulateBsa({ ...baseInput, optBaremeProgressif: true });

    // 4500 × 30% = 1350
    expect(result.cessionIncomeTax).toBeCloseTo(1350, 2);
  });

  it("T3: pas de plus-value d'acquisition (BSA = pure cession)", () => {
    const result = simulateBsa(baseInput);

    expect(result.acquisitionTaxableBase).toBe(0);
    expect(result.acquisitionIncomeTax).toBe(0);
    expect(result.acquisitionSocialContributions).toBe(0);
  });

  it('T4: moins-value (prix souscription > FMV)', () => {
    const result = simulateBsa({
      ...baseInput,
      strikePrice: 10,
      fmvAtCession: 5,
    });

    expect(result.grossGainAmount).toBe(-5000);
    expect(result.cessionTaxableBase).toBe(0);
    expect(result.totalTaxAmount).toBe(0);
    expect(result.warnings.some((w) => w.includes('Moins-value'))).toBe(true);
  });

  it('T5: 0 unités → erreur', () => {
    expect(() => simulateBsa({ ...baseInput, unitsToExercise: 0 })).toThrow();
  });
});
