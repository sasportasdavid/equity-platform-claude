/**
 * Régime fiscal BSPCE (Bons de Souscription de Parts de Créateur
 * d'Entreprise) — CGI art. 163 bis G.
 *
 * Règles V1 :
 *   - ≥ 3 ans (entre date attribution et date cession) :
 *       PFU 31,4% (12,8% IR + 18,6% PS), option barème IR possible
 *   - < 3 ans :
 *       30% IR + 18,6% PS = 48,6%, pas d'option barème
 *
 * Pour V1 on simplifie : pas de plus-value d'acquisition distincte
 * (régime applicable post-LF 2025 sera traité en V2).
 */

import {
  BSPCE_LESS_3Y_IR_RATE,
  BSPCE_SENIORITY_THRESHOLD_YEARS,
  PFU_IR_2026,
  PS_CAPITAL_GAINS_2026,
  RATES_YEAR,
  TAX_SOURCES,
} from './rates';
import { computeIncomeTax, round2, yearsBetween } from './helpers';
import type { SimulationInput, TaxBreakdown } from './types';

/**
 * Calcule le breakdown BSPCE pour un input. La date servant à juger
 * l'ancienneté est `cessionDate ?? exerciseDate` (date prévue de
 * matérialisation de la plus-value).
 */
export function simulateBspce(input: SimulationInput): TaxBreakdown {
  if (input.unitsToExercise <= 0) {
    throw new Error('unitsToExercise must be > 0');
  }

  const warnings: string[] = [];
  const cessionDate = input.cessionDate ?? input.exerciseDate;
  const fmvAtCession = input.fmvAtCession ?? input.fmvAtExercise;

  // Ancienneté : entre attribution (ou hireDate si fournie) et cession
  const refDate = input.hireDate ?? input.attributionDate;
  const seniority = yearsBetween(refDate, cessionDate);
  const isQualified = seniority >= BSPCE_SENIORITY_THRESHOLD_YEARS;

  const grossExerciseAmount = input.strikePrice * input.unitsToExercise;
  const grossSaleAmount = fmvAtCession * input.unitsToExercise;
  const grossGainAmount = grossSaleAmount - grossExerciseAmount;

  // Si BSPCE post-2025 (régime distinct PV exercice / PV cession),
  // V1 on émet un warning et on traite comme régime simplifié.
  const attributionYear = input.attributionDate.getUTCFullYear();
  if (attributionYear >= 2025) {
    warnings.push(
      'BSPCE attribué après 2025-01-01 : la LF 2025 introduit un régime' +
        " distinct (PV d'exercice imposée comme salaire, PV de cession au" +
        ' PFU). V1 simplifie en agrégeant — à revoir avec le fiscaliste.',
    );
  }

  if (grossGainAmount < 0) {
    warnings.push(
      'Moins-value latente : strike > FMV cession. Aucune imposition due,' +
        " mais aucun crédit d'impôt automatique côté bénéficiaire.",
    );
  }

  // Cas < 3 ans : pas d'option barème, IR forfaitaire 30%
  if (!isQualified) {
    warnings.push(
      `Ancienneté < ${BSPCE_SENIORITY_THRESHOLD_YEARS} ans à la cession :` +
        ` taxation majorée 48,6% (30% IR + 18,6% PS). Reportez la cession` +
        ` au-delà du seuil pour bénéficier du PFU 31,4%.`,
    );

    if (input.optBaremeProgressif) {
      warnings.push('Option barème IR ignorée : indisponible quand ancienneté < 3 ans.');
    }

    const cessionTaxableBase = Math.max(0, grossGainAmount);
    const cessionIncomeTax = round2(cessionTaxableBase * BSPCE_LESS_3Y_IR_RATE);
    const cessionSocialContributions = round2(cessionTaxableBase * PS_CAPITAL_GAINS_2026);
    const totalTaxAmount = round2(cessionIncomeTax + cessionSocialContributions);
    const netGainAmount = round2(grossGainAmount - totalTaxAmount);
    const effectiveTaxRate = grossGainAmount > 0 ? round2(totalTaxAmount / grossGainAmount) : 0;

    return {
      regime: 'BSPCE_3Y_LESS',
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
      sources: [TAX_SOURCES.bspce, TAX_SOURCES.prelevementsSociaux],
    };
  }

  // Cas ≥ 3 ans : PFU 31,4% par défaut, option barème IR possible
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

  const totalTaxAmount = round2(cessionIncomeTax + cessionSocialContributions);
  const netGainAmount = round2(grossGainAmount - totalTaxAmount);
  const effectiveTaxRate = grossGainAmount > 0 ? round2(totalTaxAmount / grossGainAmount) : 0;

  return {
    regime: 'BSPCE_3Y_PLUS',
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
    sources: [TAX_SOURCES.bspce, TAX_SOURCES.prelevementsSociaux],
  };
}
