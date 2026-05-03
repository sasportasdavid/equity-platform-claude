/**
 * Régime fiscal BSA (Bons de Souscription d'Actions).
 *
 * V1 : pas de plus-value d'acquisition distincte. Le gain économique
 * (cession - prix de souscription × units) est imposé au PFU 31,4%
 * comme valeur mobilière standard, avec option barème IR.
 */

import { PFU_IR_2026, PS_CAPITAL_GAINS_2026, RATES_YEAR, TAX_SOURCES } from './rates';
import { computeIncomeTax, round2 } from './helpers';
import type { SimulationInput, TaxBreakdown } from './types';

export function simulateBsa(input: SimulationInput): TaxBreakdown {
  if (input.unitsToExercise <= 0) {
    throw new Error('unitsToExercise must be > 0');
  }

  const warnings: string[] = [];
  const fmvAtCession = input.fmvAtCession ?? input.fmvAtExercise;

  const grossExerciseAmount = input.strikePrice * input.unitsToExercise;
  const grossSaleAmount = fmvAtCession * input.unitsToExercise;
  const grossGainAmount = grossSaleAmount - grossExerciseAmount;

  const cessionTaxableBase = Math.max(0, grossGainAmount);
  const cessionSocialContributions = round2(cessionTaxableBase * PS_CAPITAL_GAINS_2026);

  let cessionIncomeTax: number;
  if (input.optBaremeProgressif) {
    cessionIncomeTax = round2(
      computeIncomeTax(cessionTaxableBase, {
        tmiMode: input.tmiMode,
        manualTmiRate: input.manualTmiRate,
        annualTaxableIncome: input.annualTaxableIncome,
        householdParts: input.householdParts,
      }),
    );
  } else {
    cessionIncomeTax = round2(cessionTaxableBase * PFU_IR_2026);
  }

  if (grossGainAmount < 0) {
    warnings.push('Moins-value latente : prix de souscription > FMV cession.');
  }

  const totalTaxAmount = round2(cessionIncomeTax + cessionSocialContributions);
  const netGainAmount = round2(grossGainAmount - totalTaxAmount);
  const effectiveTaxRate = grossGainAmount > 0 ? round2(totalTaxAmount / grossGainAmount) : 0;

  return {
    regime: 'BSA',
    grossExerciseAmount: round2(grossExerciseAmount),
    grossSaleAmount: round2(grossSaleAmount),
    grossGainAmount: round2(grossGainAmount),
    acquisitionTaxableBase: 0,
    acquisitionIncomeTax: 0,
    acquisitionSocialContributions: 0,
    cessionTaxableBase: round2(cessionTaxableBase),
    cessionIncomeTax,
    cessionSocialContributions,
    totalTaxAmount,
    netGainAmount,
    effectiveTaxRate,
    warnings,
    ratesYear: RATES_YEAR,
    computedAt: new Date().toISOString(),
    sources: [TAX_SOURCES.prelevementsSociaux],
  };
}
