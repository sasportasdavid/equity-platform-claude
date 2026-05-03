/**
 * Régime fiscal AGA (Actions Gratuites) — CGI art. 80 quaterdecies.
 *
 * Pour AGA post-2018 (default V1) :
 *   - Plus-value d'acquisition (FMV jour acquisition × units, strike = 0) :
 *       * Abattement 50% jusqu'à 300 000 €
 *       * Au-delà : barème IR sans abattement (formule charnière)
 *       * + CSG/CRDS revenus d'activité 9,7% sur base brute
 *       * + Contribution salariale spécifique 10% sur base brute
 *   - Plus-value de cession (FMV cession - FMV acquisition) :
 *       PFU 31,4% comme valeur mobilière standard
 *
 * Pour AGA pré-2018 : régime ancien plus complexe (V2).
 * V1 : warning + estimation comme post-2018.
 */

import {
  AGA_ABATTEMENT_RATE,
  AGA_ABATTEMENT_THRESHOLD,
  AGA_CONTRIBUTION_SALARIALE_2026,
  CSG_CRDS_ACTIVITY_2026,
  PFU_IR_2026,
  PS_CAPITAL_GAINS_2026,
  RATES_YEAR,
  TAX_SOURCES,
} from './rates';
import { computeIncomeTax, round2 } from './helpers';
import type { SimulationInput, TaxBreakdown } from './types';

export type AgaVariant = 'post_2018' | 'pre_2018';

/**
 * Calcule la base imposable IR après abattement AGA. Formule charnière :
 *   - jusqu'à 300_000 € : base × 50%
 *   - au-delà : 150_000 + (base - 300_000)
 */
function applyAgaAbattement(taxableBase: number): number {
  if (taxableBase <= 0) return 0;
  if (taxableBase <= AGA_ABATTEMENT_THRESHOLD) {
    return taxableBase * AGA_ABATTEMENT_RATE;
  }
  return AGA_ABATTEMENT_THRESHOLD * AGA_ABATTEMENT_RATE + (taxableBase - AGA_ABATTEMENT_THRESHOLD);
}

export function simulateAga(
  input: SimulationInput,
  variant: AgaVariant = 'post_2018',
): TaxBreakdown {
  if (input.unitsToExercise <= 0) {
    throw new Error('unitsToExercise must be > 0');
  }

  const warnings: string[] = [];
  const fmvAtCession = input.fmvAtCession ?? input.fmvAtExercise;

  if (variant === 'pre_2018') {
    warnings.push(
      'Régime AGA pré-2018 non supporté V1 : estimation calquée sur le' +
        ' régime post-2018, à revoir avec votre fiscaliste.',
    );
  }

  // Strike d'une AGA = 0 (titres attribués gratuitement)
  const grossExerciseAmount = 0;
  const grossSaleAmount = fmvAtCession * input.unitsToExercise;
  const grossGainAmount = grossSaleAmount;

  // Plus-value d'acquisition = FMV jour acquisition × units
  const acquisitionTaxableBase = input.fmvAtExercise * input.unitsToExercise;

  // IR via barème (TMI ou auto) sur base après abattement
  const baseAfterAbattement = applyAgaAbattement(acquisitionTaxableBase);
  const acquisitionIncomeTax = round2(
    computeIncomeTax(baseAfterAbattement, {
      tmiMode: input.tmiMode,
      manualTmiRate: input.manualTmiRate,
      annualTaxableIncome: input.annualTaxableIncome,
      householdParts: input.householdParts,
    }),
  );

  // CSG/CRDS 9,7% + contribution salariale 10% sur base BRUTE (pas
  // après abattement — c'est la spécificité AGA).
  const acquisitionSocialContributions = round2(
    acquisitionTaxableBase * (CSG_CRDS_ACTIVITY_2026 + AGA_CONTRIBUTION_SALARIALE_2026),
  );

  // Plus-value de cession = (FMV cession - FMV acquisition) × units
  const cessionTaxableBase = Math.max(
    0,
    (fmvAtCession - input.fmvAtExercise) * input.unitsToExercise,
  );
  const cessionIncomeTax = round2(cessionTaxableBase * PFU_IR_2026);
  const cessionSocialContributions = round2(cessionTaxableBase * PS_CAPITAL_GAINS_2026);

  const totalTaxAmount = round2(
    acquisitionIncomeTax +
      acquisitionSocialContributions +
      cessionIncomeTax +
      cessionSocialContributions,
  );
  const netGainAmount = round2(grossGainAmount - totalTaxAmount);
  const effectiveTaxRate = grossGainAmount > 0 ? round2(totalTaxAmount / grossGainAmount) : 0;

  return {
    regime: variant === 'post_2018' ? 'AGA_POST_2018' : 'AGA_PRE_2018',
    grossExerciseAmount,
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
    sources: [TAX_SOURCES.aga, TAX_SOURCES.prelevementsSociaux],
  };
}
