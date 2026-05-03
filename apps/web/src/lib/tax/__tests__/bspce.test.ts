import { describe, expect, it } from 'vitest';

import { simulateBspce } from '../bspce';
import type { SimulationInput } from '../types';

const baseInput: SimulationInput = {
  planType: 'BSPCE',
  attributionDate: new Date('2022-01-01'),
  exerciseDate: new Date('2026-06-01'),
  hireDate: new Date('2022-01-01'),
  unitsToExercise: 1000,
  strikePrice: 1,
  fmvAtExercise: 10,
  fmvAtCession: 10,
  tmiMode: 'manual',
  manualTmiRate: 30,
};

describe('simulateBspce', () => {
  it('T1: ≥ 3 ans, PFU 31,4% sur 9000 € de gain', () => {
    const result = simulateBspce(baseInput);

    expect(result.regime).toBe('BSPCE_3Y_PLUS');
    expect(result.grossGainAmount).toBe(9000);
    expect(result.cessionIncomeTax).toBeCloseTo(1152, 2); // 9000 × 12.8%
    expect(result.cessionSocialContributions).toBeCloseTo(1674, 2); // 9000 × 18.6%
    expect(result.totalTaxAmount).toBeCloseTo(2826, 2);
    expect(result.netGainAmount).toBeCloseTo(6174, 2);
    expect(result.effectiveTaxRate).toBeCloseTo(0.314, 2);
    expect(result.acquisitionTaxableBase).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('T2: ≥ 3 ans + option barème IR + TMI 30%', () => {
    const result = simulateBspce({ ...baseInput, optBaremeProgressif: true });

    expect(result.regime).toBe('BSPCE_3Y_PLUS');
    // 9000 × 30% = 2700 (TMI flat manual)
    expect(result.cessionIncomeTax).toBeCloseTo(2700, 2);
    expect(result.cessionSocialContributions).toBeCloseTo(1674, 2);
    expect(result.totalTaxAmount).toBeCloseTo(4374, 2);
  });

  it("T3: < 3 ans (1 an d'ancienneté), taxation majorée 48,6%", () => {
    const result = simulateBspce({
      ...baseInput,
      hireDate: new Date('2025-06-01'),
      exerciseDate: new Date('2026-06-01'),
      cessionDate: new Date('2026-06-01'),
    });

    expect(result.regime).toBe('BSPCE_3Y_LESS');
    expect(result.cessionIncomeTax).toBeCloseTo(2700, 2); // 9000 × 30%
    expect(result.cessionSocialContributions).toBeCloseTo(1674, 2);
    expect(result.totalTaxAmount).toBeCloseTo(4374, 2);
    expect(result.netGainAmount).toBeCloseTo(4626, 2);
    expect(result.effectiveTaxRate).toBeCloseTo(0.486, 2);
    expect(result.warnings.some((w) => w.includes('Ancienneté < 3 ans'))).toBe(true);
  });

  it('T4: cessionDate au-delà du seuil 3 ans → PFU 31,4%', () => {
    const result = simulateBspce({
      ...baseInput,
      hireDate: new Date('2023-01-01'),
      exerciseDate: new Date('2026-08-01'),
      cessionDate: new Date('2026-08-01'),
    });

    expect(result.regime).toBe('BSPCE_3Y_PLUS');
    expect(result.effectiveTaxRate).toBeCloseTo(0.314, 2);
  });

  it("T5: 0 unités → erreur (pas d'imposition d'unités vides)", () => {
    expect(() => simulateBspce({ ...baseInput, unitsToExercise: 0 })).toThrow();
  });

  it('T6: strike > FMV cession → moins-value latente, aucune imposition', () => {
    const result = simulateBspce({
      ...baseInput,
      strikePrice: 15,
      fmvAtCession: 10,
    });

    expect(result.grossGainAmount).toBe(-5000);
    expect(result.cessionIncomeTax).toBe(0);
    expect(result.cessionSocialContributions).toBe(0);
    expect(result.totalTaxAmount).toBe(0);
    expect(result.warnings.some((w) => w.includes('Moins-value'))).toBe(true);
  });

  it('T7: BSPCE post-2025 → warning régime simplifié V1', () => {
    const result = simulateBspce({
      ...baseInput,
      attributionDate: new Date('2025-06-01'),
      hireDate: new Date('2022-01-01'),
    });

    expect(result.warnings.some((w) => w.includes('après 2025'))).toBe(true);
  });

  it('T8: option barème IR sur < 3 ans → ignorée + warning', () => {
    const result = simulateBspce({
      ...baseInput,
      hireDate: new Date('2025-06-01'),
      exerciseDate: new Date('2026-06-01'),
      cessionDate: new Date('2026-06-01'),
      optBaremeProgressif: true,
    });

    expect(result.regime).toBe('BSPCE_3Y_LESS');
    // Toujours 30% flat, pas le TMI 30 (qui aurait donné le même chiffre ici).
    // On vérifie que le warning est présent.
    expect(result.warnings.some((w) => w.includes('Option barème IR'))).toBe(true);
  });
});
