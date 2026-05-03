/**
 * Module 9 B3 — Helpers de formatage français pour l'UI des exercises.
 *
 * Pure TS, sans dépendance React.
 */

import type { TaxBreakdown } from '@/lib/tax';

/** Formate un montant en € (séparateur d'unité espace insécable). */
export function formatEuro(amount: number, options?: { fractionDigits?: number }): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: options?.fractionDigits ?? 2,
    maximumFractionDigits: options?.fractionDigits ?? 2,
  }).format(amount);
}

/** Formate un nombre entier de titres (séparateur d'unité espace insécable). */
export function formatUnits(units: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(units);
}

/** Formate un pourcentage 0..1 → "31,4 %" */
export function formatPercent(rate: number, fractionDigits: number = 1): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rate);
}

/** Formate une date ISO ou Date au format DD/MM/YYYY. */
export function formatDateFr(input: Date | string | null | undefined): string {
  if (!input) return '—';
  const date = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('fr-FR').format(date);
}

/**
 * Calcule le nombre maximal d'unités exerçables à partir d'un award et
 * de sa snapshot vesting (fallback Module 8 B3 pattern). Utilisé côté
 * UI pour borner les inputs sans appeler la DB.
 *
 * Source de vérité = RPC `request_exercise` côté DB (qui réplique cette
 * logique avec priorité vesting_events). Cette fn est uniquement un
 * helper UI optimiste : si elle se trompe vers le haut, le RPC rejettera
 * proprement avec EXERCISE_UNITS_AVAILABLE.
 */
export function computeMaxUnitsAvailable(
  unitsGranted: number,
  unitsExercised: number,
  vestingSnapshot: unknown,
): number {
  if (typeof vestingSnapshot !== 'object' || vestingSnapshot === null) {
    return Math.max(0, unitsGranted - unitsExercised);
  }
  const tranches = (vestingSnapshot as { tranches?: unknown[] }).tranches;
  if (!Array.isArray(tranches)) {
    return Math.max(0, unitsGranted - unitsExercised);
  }

  const today = new Date();
  let vested = 0;
  for (const tranche of tranches) {
    if (typeof tranche !== 'object' || tranche === null) continue;
    const t = tranche as { vesting_date?: string; percentage_of_award?: number };
    if (!t.vesting_date || t.percentage_of_award === undefined) continue;
    const vDate = new Date(t.vesting_date);
    if (vDate <= today) {
      vested += Math.floor((Number(t.percentage_of_award) * unitsGranted) / 100);
    }
  }

  return Math.max(0, vested - unitsExercised);
}

/**
 * Formate un TaxBreakdown pour l'affichage (extrait les chiffres clés).
 * Utilisé par TaxBreakdownDisplay pour éviter la duplication de logique.
 */
export function formatTaxBreakdownForDisplay(breakdown: TaxBreakdown) {
  return {
    grossGain: formatEuro(breakdown.grossGainAmount),
    totalTax: formatEuro(breakdown.totalTaxAmount),
    netGain: formatEuro(breakdown.netGainAmount),
    effectiveRate: formatPercent(breakdown.effectiveTaxRate),
    acquisitionTax: breakdown.acquisitionIncomeTax + breakdown.acquisitionSocialContributions,
    cessionTax: breakdown.cessionIncomeTax + breakdown.cessionSocialContributions,
  };
}

/**
 * Couleur de tag Editorial associée à un régime fiscal. Permet à l'UI
 * de visuellement distinguer un régime avantageux (PFU brass) d'un
 * régime majoré (warning amber).
 */
export function regimeAccentColor(regime: TaxBreakdown['regime']): 'brass' | 'warning' | 'ink' {
  switch (regime) {
    case 'BSPCE_3Y_PLUS':
      return 'brass';
    case 'BSPCE_3Y_LESS':
    case 'STOCK_OPTION_NON_QUALIFIE':
    case 'AGA_PRE_2018':
      return 'warning';
    case 'STOCK_OPTION_QUALIFIE':
    case 'BSA':
    case 'AGA_POST_2018':
    default:
      return 'ink';
  }
}

/** Label FR humain pour un régime fiscal. */
export function regimeLabel(regime: TaxBreakdown['regime']): string {
  const labels: Record<TaxBreakdown['regime'], string> = {
    BSPCE_3Y_PLUS: 'BSPCE — Ancienneté ≥ 3 ans',
    BSPCE_3Y_LESS: 'BSPCE — Ancienneté < 3 ans',
    STOCK_OPTION_QUALIFIE: 'Stock Options qualifiées',
    STOCK_OPTION_NON_QUALIFIE: 'Stock Options non-qualifiées',
    BSA: 'BSA',
    AGA_POST_2018: 'AGA (post-2018)',
    AGA_PRE_2018: 'AGA (pré-2018)',
  };
  return labels[regime];
}
