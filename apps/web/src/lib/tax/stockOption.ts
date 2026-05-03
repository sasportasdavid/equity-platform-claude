/**
 * Régime fiscal Stock Options qualifiées (post-2017, art. 80 bis CGI).
 *
 * V1 simplifié :
 *   - Plus-value d'acquisition (FMV exercice - strike) :
 *       imposée au barème IR (TMI bénéficiaire) + CSG/CRDS revenus
 *       d'activité (9,7% forfait V1)
 *   - Plus-value de cession (FMV cession - FMV exercice) :
 *       PFU 31,4% par défaut, option barème IR possible
 *
 * Plan non-qualifié = même calcul + 9,7% cotisations sociales
 * salariales en sus (forfait V1).
 *
 * Contribution patronale 30% à charge entreprise = hors simulateur
 * bénéficiaire.
 */

import {
  CSG_CRDS_ACTIVITY_2026,
  PFU_IR_2026,
  PS_CAPITAL_GAINS_2026,
  RATES_YEAR,
  SO_NON_QUALIFIE_SOCIAL_CONTRIB_2026,
  TAX_SOURCES,
} from './rates';
import { computeIncomeTax, round2 } from './helpers';
import type { SimulationInput, TaxBreakdown } from './types';

export type StockOptionVariant = 'qualifie' | 'non_qualifie';

/**
 * Calcule un breakdown SO. Le `variant` permet de distinguer plan
 * qualifié (post-2017 standard) vs non-qualifié (cotisations sociales
 * salariales en sus).
 */
export function simulateStockOption(
  input: SimulationInput,
  variant: StockOptionVariant = 'qualifie',
): TaxBreakdown {
  if (input.unitsToExercise <= 0) {
    throw new Error('unitsToExercise must be > 0');
  }

  const warnings: string[] = [];
  const fmvAtCession = input.fmvAtCession ?? input.fmvAtExercise;

  const grossExerciseAmount = input.strikePrice * input.unitsToExercise;
  const grossSaleAmount = fmvAtCession * input.unitsToExercise;
  const grossGainAmount = grossSaleAmount - grossExerciseAmount;

  // Plus-value d'acquisition : (FMV exercice - strike) × units
  const acquisitionTaxableBase = Math.max(
    0,
    (input.fmvAtExercise - input.strikePrice) * input.unitsToExercise,
  );
  const acquisitionIncomeTax = round2(
    computeIncomeTax(acquisitionTaxableBase, {
      tmiMode: input.tmiMode,
      manualTmiRate: input.manualTmiRate,
      annualTaxableIncome: input.annualTaxableIncome,
      householdParts: input.householdParts,
    }),
  );

  // CSG/CRDS revenus d'activité sur PV acquisition (9,7% forfait V1)
  let acquisitionSocialContributions = round2(acquisitionTaxableBase * CSG_CRDS_ACTIVITY_2026);

  // Si non-qualifié : + 9,7% cotisations salariales sur PV acquisition
  if (variant === 'non_qualifie') {
    acquisitionSocialContributions = round2(
      acquisitionSocialContributions + acquisitionTaxableBase * SO_NON_QUALIFIE_SOCIAL_CONTRIB_2026,
    );
    warnings.push(
      'Régime non-qualifié : 9,7% cotisations sociales salariales' +
        " appliquées en sus sur la plus-value d'acquisition (forfait V1).",
    );
  }

  // Plus-value de cession : (FMV cession - FMV exercice) × units
  const cessionTaxableBase = Math.max(
    0,
    (fmvAtCession - input.fmvAtExercise) * input.unitsToExercise,
  );
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
    warnings.push('Moins-value latente : strike > FMV cession. Aucune imposition due.');
  }

  const totalTaxAmount = round2(
    acquisitionIncomeTax +
      acquisitionSocialContributions +
      cessionIncomeTax +
      cessionSocialContributions,
  );
  const netGainAmount = round2(grossGainAmount - totalTaxAmount);
  const effectiveTaxRate = grossGainAmount > 0 ? round2(totalTaxAmount / grossGainAmount) : 0;

  return {
    regime: variant === 'qualifie' ? 'STOCK_OPTION_QUALIFIE' : 'STOCK_OPTION_NON_QUALIFIE',
    grossExerciseAmount: round2(grossExerciseAmount),
    grossSaleAmount: round2(grossSaleAmount),
    grossGainAmount: round2(grossGainAmount),
    acquisitionTaxableBase: round2(acquisitionTaxableBase),
    acquisitionIncomeTax,
    acquisitionSocialContributions,
    cessionTaxableBase: round2(cessionTaxableBase),
    cessionIncomeTax,
    cessionSocialContributions,
    totalTaxAmount,
    netGainAmount,
    effectiveTaxRate,
    warnings,
    ratesYear: RATES_YEAR,
    computedAt: new Date().toISOString(),
    sources: [TAX_SOURCES.stockOption, TAX_SOURCES.prelevementsSociaux],
  };
}
