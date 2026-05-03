import { describe, expect, it } from 'vitest';

import { simulateMultiTranche } from '../multiTranche';
import type { SimulationInput, TrancheInput } from '../types';

const baseInput: SimulationInput = {
  planType: 'BSPCE',
  attributionDate: new Date('2022-01-01'),
  exerciseDate: new Date('2026-06-01'),
  hireDate: new Date('2022-01-01'),
  unitsToExercise: 1000, // ignoré : remplacé par tranche.unitsToExercise
  strikePrice: 1,
  fmvAtExercise: 10,
  fmvAtCession: 10,
  tmiMode: 'manual',
  manualTmiRate: 30,
};

describe('simulateMultiTranche', () => {
  it('T1: 4 tranches BSPCE ≥ 3 ans (PFU 31,4%) → toutes au PFU', () => {
    const tranches: TrancheInput[] = [
      { unitsToExercise: 250, vestingDate: new Date('2026-01-01') },
      { unitsToExercise: 250, vestingDate: new Date('2026-04-01') },
      { unitsToExercise: 250, vestingDate: new Date('2026-07-01') },
      { unitsToExercise: 250, vestingDate: new Date('2026-10-01') },
    ];

    const result = simulateMultiTranche(
      { ...baseInput, hireDate: new Date('2022-01-01') },
      tranches,
    );

    expect(result.tranches).toHaveLength(4);
    expect(result.tranches.every((t) => t.regime === 'BSPCE_3Y_PLUS')).toBe(true);
    expect(result.effectiveTaxRate).toBeCloseTo(0.314, 2);
  });

  it('T2: 4 tranches BSPCE < 3 ans → toutes majorées 48,6%, warning unique', () => {
    const tranches: TrancheInput[] = [
      { unitsToExercise: 250, vestingDate: new Date('2026-01-01') },
      { unitsToExercise: 250, vestingDate: new Date('2026-04-01') },
      { unitsToExercise: 250, vestingDate: new Date('2026-07-01') },
      { unitsToExercise: 250, vestingDate: new Date('2026-10-01') },
    ];

    const result = simulateMultiTranche(
      { ...baseInput, hireDate: new Date('2024-06-01') },
      tranches,
    );

    expect(result.tranches.every((t) => t.regime === 'BSPCE_3Y_LESS')).toBe(true);
    expect(result.effectiveTaxRate).toBeCloseTo(0.486, 2);

    const ancientWarnings = result.warnings.filter((w) => w.includes('Ancienneté < 3 ans'));
    expect(ancientWarnings).toHaveLength(1); // dédupliqué
  });

  it('T3: tranches mixtes (vestingDate échelonnés sur 4 ans) → régimes panachés', () => {
    // hireDate 2024-01-01 :
    // - tranche A vestingDate 2025-01-01 → ancienneté 1 an (< 3) MAJORÉ
    // - tranche B vestingDate 2028-01-01 → ancienneté 4 ans (≥ 3) PFU
    const tranches: TrancheInput[] = [
      { unitsToExercise: 500, vestingDate: new Date('2025-01-01') },
      { unitsToExercise: 500, vestingDate: new Date('2028-01-01') },
    ];

    const result = simulateMultiTranche(
      {
        ...baseInput,
        hireDate: new Date('2024-01-01'),
        cessionDate: undefined, // utilise vestingDate par tranche
      },
      tranches,
    );

    expect(result.tranches[0]!.regime).toBe('BSPCE_3Y_LESS');
    expect(result.tranches[1]!.regime).toBe('BSPCE_3Y_PLUS');
    // Effective entre 31,4 et 48,6 (2 tranches égales)
    expect(result.effectiveTaxRate).toBeGreaterThan(0.314);
    expect(result.effectiveTaxRate).toBeLessThan(0.486);
  });

  it('T4: agrégation totalTax = sum(tranches.totalTaxAmount)', () => {
    const tranches: TrancheInput[] = [
      { unitsToExercise: 100, vestingDate: new Date('2026-01-01') },
      { unitsToExercise: 200, vestingDate: new Date('2026-04-01') },
      { unitsToExercise: 700, vestingDate: new Date('2026-07-01') },
    ];

    const result = simulateMultiTranche(baseInput, tranches);

    const expectedTotal = result.tranches.reduce((acc, t) => acc + t.totalTaxAmount, 0);
    expect(result.totalTaxAmount).toBeCloseTo(expectedTotal, 2);

    const expectedNet = result.tranches.reduce((acc, t) => acc + t.netGainAmount, 0);
    expect(result.netGainAmount).toBeCloseTo(expectedNet, 2);
  });
});
