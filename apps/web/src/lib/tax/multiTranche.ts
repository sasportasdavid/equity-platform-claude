/**
 * Simulation multi-tranches : itère un calcul par tranche puis agrège
 * les totaux. Important pour BSPCE : l'ancienneté ré-évaluée par
 * `vestingDate` peut faire passer une tranche A < 3 ans (taxée 48,6%)
 * vs tranche B ≥ 3 ans (taxée 31,4%) dans le même calcul.
 */

import { round2 } from './helpers';
import { simulateBspce } from './bspce';
import { simulateBsa } from './bsa';
import { simulateStockOption } from './stockOption';
import { simulateAga } from './aga';
import type { MultiTrancheBreakdown, SimulationInput, TaxBreakdown, TrancheInput } from './types';

/**
 * Construit un SimulationInput dérivé pour une tranche, en remplaçant
 * `unitsToExercise` et en propageant la `vestingDate` comme cessionDate
 * pour BSPCE (où l'ancienneté est calculée à la cession).
 *
 * Pour les autres régimes, vestingDate est utilisée comme cessionDate
 * par défaut faute d'info plus précise.
 */
function deriveTrancheInput(input: SimulationInput, tranche: TrancheInput): SimulationInput {
  return {
    ...input,
    unitsToExercise: tranche.unitsToExercise,
    cessionDate: input.cessionDate ?? tranche.vestingDate,
  };
}

function dispatch(input: SimulationInput): TaxBreakdown {
  switch (input.planType) {
    case 'BSPCE':
      return simulateBspce(input);
    case 'STOCK_OPTION':
      return simulateStockOption(input);
    case 'BSA':
      return simulateBsa(input);
    case 'AGA':
      return simulateAga(input);
  }
}

export function simulateMultiTranche(
  input: SimulationInput,
  tranches: TrancheInput[],
): MultiTrancheBreakdown {
  if (tranches.length === 0) {
    throw new Error('tranches must not be empty');
  }

  const breakdowns = tranches.map((t) => dispatch(deriveTrancheInput(input, t)));

  const sum = (extractor: (b: TaxBreakdown) => number) =>
    round2(breakdowns.reduce((acc, b) => acc + extractor(b), 0));

  const grossExerciseAmount = sum((b) => b.grossExerciseAmount);
  const grossSaleAmount = sum((b) => b.grossSaleAmount);
  const grossGainAmount = sum((b) => b.grossGainAmount);
  const acquisitionTaxableBase = sum((b) => b.acquisitionTaxableBase);
  const acquisitionIncomeTax = sum((b) => b.acquisitionIncomeTax);
  const acquisitionSocialContributions = sum((b) => b.acquisitionSocialContributions);
  const cessionTaxableBase = sum((b) => b.cessionTaxableBase);
  const cessionIncomeTax = sum((b) => b.cessionIncomeTax);
  const cessionSocialContributions = sum((b) => b.cessionSocialContributions);
  const totalTaxAmount = sum((b) => b.totalTaxAmount);
  const netGainAmount = sum((b) => b.netGainAmount);
  const effectiveTaxRate = grossGainAmount > 0 ? round2(totalTaxAmount / grossGainAmount) : 0;

  const warnings = Array.from(new Set(breakdowns.flatMap((b) => b.warnings)));

  // Le régime agrégé n'est pas forcément homogène (cas mixte BSPCE
  // < 3 ans vs ≥ 3 ans). On prend le régime de la première tranche
  // comme valeur indicative — l'UI affichera les régimes individuels.
  // L'invariant `tranches.length > 0` est garanti par le check ci-dessus.
  const first = breakdowns[0]!;

  return {
    regime: first.regime,
    grossExerciseAmount,
    grossSaleAmount,
    grossGainAmount,
    acquisitionTaxableBase,
    acquisitionIncomeTax,
    acquisitionSocialContributions,
    cessionTaxableBase,
    cessionIncomeTax,
    cessionSocialContributions,
    totalTaxAmount,
    netGainAmount,
    effectiveTaxRate,
    warnings,
    ratesYear: 2026,
    computedAt: new Date().toISOString(),
    sources: first.sources,
    tranches: breakdowns,
  };
}
