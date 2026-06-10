/**
 * Régime fiscal AGA (Actions Gratuites) — CGI art. 80 quaterdecies.
 *
 * Pour AGA post-2018 (default V1) :
 *   - Plus-value d'acquisition (FMV jour acquisition × units, strike = 0) :
 *       IR (barème) sur base après abattement :
 *         * Abattement 50% jusqu'à 300 000 €
 *         * Au-delà : barème IR sans abattement (formule charnière)
 *       Régime SOCIAL (CSS L.137-14, CGI 80 quaterdecies), assiette BRUTE
 *       splittée au seuil 300 000 € :
 *         * fraction ≤ 300 000 € → prélèvements sociaux du CAPITAL (18,6%
 *           en 2026), SANS contribution salariale 10%
 *         * fraction > 300 000 € → régime salaire : CSG/CRDS activité 9,7%
 *           + contribution salariale spécifique 10%
 *   - Plus-value de cession (FMV cession - FMV acquisition) :
 *       PFU 31,4% comme valeur mobilière standard
 *
 * Pour AGA pré-2018 : régime ancien plus complexe (V2).
 * V1 : warning + estimation comme post-2018.
 */

import {
  AGA_ABATTEMENT_RATE,
  AGA_ABATTEMENT_THRESHOLD,
  AGA_ACQUISITION_PS_CAPITAL_2026,
  AGA_SOCIAL_REGIME_THRESHOLD,
  CSG_CRDS_ACTIVITY_2026,
  PFU_IR_2026,
  PS_CAPITAL_GAINS_2026,
  RATES_YEAR,
  SALARIAL_CONTRIBUTION_10_2026,
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

/**
 * Calcule les prélèvements sociaux du gain d'acquisition AGA post-2018,
 * sur la base BRUTE (pas après abattement), avec le split au seuil
 * 300 000 € (CSS art. L 137-14) :
 *
 *   - fraction ≤ 300 000 € → PS du capital (18,6% en 2026), SANS contrib 10%
 *   - fraction > 300 000 € → CSG/CRDS activité (9,7%) + contribution
 *     salariale spécifique (10%)
 *
 * Retourne le détail pour traçabilité (utile aux tests et au breakdown).
 */
function computeAgaAcquisitionSocial(grossBase: number): {
  capitalFraction: number;
  salaryFraction: number;
  capitalPs: number;
  salaryCsgCrds: number;
  salaryContribution10: number;
  total: number;
} {
  if (grossBase <= 0) {
    return {
      capitalFraction: 0,
      salaryFraction: 0,
      capitalPs: 0,
      salaryCsgCrds: 0,
      salaryContribution10: 0,
      total: 0,
    };
  }

  const capitalFraction = Math.min(grossBase, AGA_SOCIAL_REGIME_THRESHOLD);
  const salaryFraction = Math.max(0, grossBase - AGA_SOCIAL_REGIME_THRESHOLD);

  const capitalPs = capitalFraction * AGA_ACQUISITION_PS_CAPITAL_2026;
  const salaryCsgCrds = salaryFraction * CSG_CRDS_ACTIVITY_2026;
  const salaryContribution10 = salaryFraction * SALARIAL_CONTRIBUTION_10_2026;

  return {
    capitalFraction,
    salaryFraction,
    capitalPs,
    salaryCsgCrds,
    salaryContribution10,
    total: capitalPs + salaryCsgCrds + salaryContribution10,
  };
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

  // Prélèvements sociaux sur base BRUTE (pas après abattement) avec le
  // split au seuil 300 000 € (CSS L.137-14) :
  //   - fraction ≤ 300K → PS capital 18,6%, sans contrib 10%
  //   - fraction > 300K → CSG activité 9,7% + contrib salariale 10%
  const social = computeAgaAcquisitionSocial(acquisitionTaxableBase);
  const acquisitionSocialContributions = round2(social.total);

  if (social.salaryFraction > 0) {
    warnings.push(
      `Gain d'acquisition > 300 000 € : la fraction excédentaire` +
        ` (${round2(social.salaryFraction)} €) supporte la CSG/CRDS` +
        ` d'activité 9,7% + la contribution salariale spécifique 10%` +
        ` (régime salaire). La fraction ≤ 300 000 € reste soumise aux` +
        ` prélèvements sociaux du capital (18,6%).`,
    );
  }

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
