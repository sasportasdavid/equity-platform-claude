import { describe, expect, it } from 'vitest';

import { simulateAga } from '../aga';
import type { SimulationInput } from '../types';

const baseInput: SimulationInput = {
  planType: 'AGA',
  attributionDate: new Date('2022-01-01'),
  exerciseDate: new Date('2026-06-01'),
  unitsToExercise: 1000,
  strikePrice: 0,
  fmvAtExercise: 200,
  fmvAtCession: 200,
  tmiMode: 'manual',
  manualTmiRate: 30,
};

describe('simulateAga (post-2018)', () => {
  it('T1: 1000 AGA, FMV 200 € (200K total ≤ 300K) → abattement 50%', () => {
    const result = simulateAga(baseInput);

    expect(result.regime).toBe('AGA_POST_2018');
    expect(result.acquisitionTaxableBase).toBe(200_000);

    // base après abattement = 100K → IR via TMI 30 = 30 000
    expect(result.acquisitionIncomeTax).toBeCloseTo(30_000, 2);

    // Fraction ≤ 300K → prélèvements sociaux du CAPITAL 18,6% × 200K
    // = 37 200 (PAS de contribution salariale 10% sous le seuil).
    expect(result.acquisitionSocialContributions).toBeCloseTo(37_200, 2);

    // Pas de PV cession (fmvAtCession = fmvAtExercise)
    expect(result.cessionTaxableBase).toBe(0);

    // Pas de warning de dépassement seuil (base sous 300K)
    expect(result.warnings.some((w) => w.includes('300 000'))).toBe(false);
  });

  it('T2: 2000 AGA, FMV 200 € (400K > 300K) → formule charnière + split social', () => {
    const result = simulateAga({ ...baseInput, unitsToExercise: 2000 });

    expect(result.acquisitionTaxableBase).toBe(400_000);
    // base après abattement = 150K + (400K - 300K) = 250K
    // IR via TMI 30 = 75 000
    expect(result.acquisitionIncomeTax).toBeCloseTo(75_000, 2);

    // Social split au seuil 300K (base BRUTE 400K) :
    //   - fraction ≤ 300K → PS capital 18,6% × 300K = 55 800
    //   - fraction > 300K (100K) → CSG 9,7% + contrib 10% = 19,7% × 100K = 19 700
    //   total = 75 500
    expect(result.acquisitionSocialContributions).toBeCloseTo(75_500, 2);

    // Warning de dépassement de seuil
    expect(result.warnings.some((w) => w.includes('300 000'))).toBe(true);
  });

  it('T3: cession concomitante avec FMV cession > FMV acquisition', () => {
    const result = simulateAga({
      ...baseInput,
      fmvAtExercise: 100,
      fmvAtCession: 150,
    });

    // PV acquisition = 100 × 1000 = 100K → abattement 50% = 50K → TMI 30 = 15K
    expect(result.acquisitionIncomeTax).toBeCloseTo(15_000, 2);
    // PV cession = 50K → PFU 12.8% = 6400 + PS 18.6% = 9300
    expect(result.cessionIncomeTax).toBeCloseTo(6_400, 2);
    expect(result.cessionSocialContributions).toBeCloseTo(9_300, 2);
  });

  it('T4: AGA pré-2018 → warning V1 + estimation post-2018', () => {
    const result = simulateAga(baseInput, 'pre_2018');

    expect(result.regime).toBe('AGA_PRE_2018');
    expect(result.warnings.some((w) => w.includes('pré-2018'))).toBe(true);
    // Calcul estimatif identique à post-2018
    expect(result.acquisitionIncomeTax).toBeCloseTo(30_000, 2);
  });

  it('T5: TMI 45% sur AGA 200K → IR plus haute', () => {
    const result = simulateAga({ ...baseInput, manualTmiRate: 45 });

    // base après abattement = 100K → 45% = 45 000
    expect(result.acquisitionIncomeTax).toBeCloseTo(45_000, 2);
  });

  it('T6: 0 unités → erreur', () => {
    expect(() => simulateAga({ ...baseInput, unitsToExercise: 0 })).toThrow();
  });

  it('T7: petit volume (10K) → abattement 50% direct', () => {
    const result = simulateAga({
      ...baseInput,
      unitsToExercise: 100,
      fmvAtExercise: 100,
    });

    expect(result.acquisitionTaxableBase).toBe(10_000);
    // base après abattement = 5K → TMI 30 = 1500
    expect(result.acquisitionIncomeTax).toBeCloseTo(1500, 2);
  });

  it('T8: AGA exactement à 300K → abattement plein 150K + social full capital', () => {
    const result = simulateAga({
      ...baseInput,
      unitsToExercise: 1500,
      fmvAtExercise: 200,
    });

    expect(result.acquisitionTaxableBase).toBe(300_000);
    // base après abattement = 150K → TMI 30 = 45 000
    expect(result.acquisitionIncomeTax).toBeCloseTo(45_000, 2);
    // Tout au seuil → PS capital 18,6% × 300K = 55 800, aucune contrib 10%
    expect(result.acquisitionSocialContributions).toBeCloseTo(55_800, 2);
    expect(result.warnings.some((w) => w.includes('300 000'))).toBe(false);
  });

  it('T9 (cas chiffré social < 300K) : 500 AGA × FMV 100 = 50K brut → PS capital 18,6%', () => {
    const result = simulateAga({
      ...baseInput,
      unitsToExercise: 500,
      fmvAtExercise: 100,
      fmvAtCession: 100,
    });

    expect(result.acquisitionTaxableBase).toBe(50_000);
    // Régime CAPITAL sous le seuil : 50 000 × 18,6% = 9 300
    // (et SURTOUT pas 50 000 × 19,7% = 9 850 — ancien comportement bugué)
    expect(result.acquisitionSocialContributions).toBeCloseTo(9_300, 2);
    // IR : abattement 50% → 25K × TMI 30 = 7 500
    expect(result.acquisitionIncomeTax).toBeCloseTo(7_500, 2);
  });

  it('T10 (split social juste au-dessus du seuil) : 350K brut', () => {
    const result = simulateAga({
      ...baseInput,
      unitsToExercise: 1750,
      fmvAtExercise: 200,
      fmvAtCession: 200,
    });

    expect(result.acquisitionTaxableBase).toBe(350_000);
    // capital : 300K × 18,6% = 55 800
    // salaire : 50K × 19,7% = 9 850
    // total : 65 650
    expect(result.acquisitionSocialContributions).toBeCloseTo(65_650, 2);
    expect(result.warnings.some((w) => w.includes('300 000'))).toBe(true);
  });
});
