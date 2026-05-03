import { describe, expect, it } from 'vitest';

import { simulateExerciseTax } from '../index';
import { detectTmiFromIncome } from '../helpers';

describe('simulateExerciseTax (public API)', () => {
  it('T1: BSPCE input valide → ok=true', () => {
    const result = simulateExerciseTax({
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
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.regime).toBe('BSPCE_3Y_PLUS');
    }
  });

  it('T2: input invalide via Zod → ok=false avec TAX_INPUT_INVALID', () => {
    const result = simulateExerciseTax({
      planType: 'BSPCE',
      attributionDate: new Date('2022-01-01'),
      exerciseDate: new Date('2026-06-01'),
      // unitsToExercise manquant
      strikePrice: 1,
      fmvAtExercise: 10,
      tmiMode: 'manual',
      manualTmiRate: 30,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TAX_INPUT_INVALID');
    }
  });

  it('T3: switch correct selon planType (STOCK_OPTION)', () => {
    const result = simulateExerciseTax({
      planType: 'STOCK_OPTION',
      attributionDate: new Date('2022-01-01'),
      exerciseDate: new Date('2026-06-01'),
      unitsToExercise: 1000,
      strikePrice: 5,
      fmvAtExercise: 10,
      fmvAtCession: 10,
      tmiMode: 'manual',
      manualTmiRate: 30,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.regime).toBe('STOCK_OPTION_QUALIFIE');
    }
  });

  it("T4: snapshot stable d'un breakdown E2E (sans computedAt)", () => {
    const result = simulateExerciseTax({
      planType: 'BSA',
      attributionDate: new Date('2024-01-01'),
      exerciseDate: new Date('2026-06-01'),
      unitsToExercise: 100,
      strikePrice: 0.5,
      fmvAtExercise: 5,
      fmvAtCession: 5,
      tmiMode: 'manual',
      manualTmiRate: 30,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const { computedAt: _ignored, ...stable } = result.data;
      expect(stable).toMatchObject({
        regime: 'BSA',
        grossExerciseAmount: 50,
        grossSaleAmount: 500,
        grossGainAmount: 450,
        cessionTaxableBase: 450,
        cessionIncomeTax: 57.6, // 450 × 12.8%
        cessionSocialContributions: 83.7, // 450 × 18.6%
        totalTaxAmount: 141.3,
        netGainAmount: 308.7,
        ratesYear: 2026,
      });
    }
  });

  it('T5: TMI auto depuis annualTaxableIncome 60K célibataire → TMI 30%', () => {
    expect(detectTmiFromIncome(60_000, 1)).toBe(30);

    // Vérifier qu'en mode auto la simulation utilise bien le bracket 30%
    const result = simulateExerciseTax({
      planType: 'STOCK_OPTION',
      attributionDate: new Date('2022-01-01'),
      exerciseDate: new Date('2026-06-01'),
      unitsToExercise: 100,
      strikePrice: 5,
      fmvAtExercise: 10,
      fmvAtCession: 10,
      tmiMode: 'auto',
      annualTaxableIncome: 60_000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // PV acquisition = 500 €
      // computeIncomeTax(500, auto, income=60K) :
      // IR(60500) - IR(60000)
      // IR(60K) = 17979 × 0.11 + 30421 × 0.30 = 1977.69 + 9126.30 = 11103.99
      // IR(60500) = 17979 × 0.11 + 30921 × 0.30 = 1977.69 + 9276.30 = 11253.99
      // delta = 150 (= 500 × 30% — TMI 30 atteint)
      expect(result.data.acquisitionIncomeTax).toBeCloseTo(150, 1);
    }
  });
});
