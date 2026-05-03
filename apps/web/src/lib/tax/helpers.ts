/**
 * Helpers fiscaux purs (sans dépendance Zod). Logique de calcul
 * réutilisable entre les régimes.
 */

import { TAX_BRACKETS_2026, type TaxBracket } from './rates';
import type { TmiRate } from './types';

/**
 * Calcule l'impôt sur le revenu progressif (barème IR 2026) pour une
 * base imposable et un quotient familial donnés.
 *
 * Formule : on divise la base par les parts, on applique le barème,
 * on multiplie le résultat par les parts. Approche standard CGI.
 */
export function computeProgressiveIR(
  taxableBase: number,
  householdParts: number = 1,
  brackets: readonly TaxBracket[] = TAX_BRACKETS_2026,
): number {
  if (taxableBase <= 0) return 0;
  if (householdParts <= 0) {
    throw new Error('householdParts must be > 0');
  }

  const perPart = taxableBase / householdParts;
  let taxPerPart = 0;

  for (const bracket of brackets) {
    if (perPart <= bracket.min - 1) break;
    const upper = bracket.max ?? perPart;
    const slice = Math.max(0, Math.min(perPart, upper) - (bracket.min - 1));
    taxPerPart += slice * bracket.rate;
    if (bracket.max === null || perPart <= bracket.max) break;
  }

  return taxPerPart * householdParts;
}

/**
 * Détermine le TMI atteint par un revenu donné en mode auto.
 * Renvoie le taux marginal de la tranche dans laquelle tombe le revenu.
 */
export function detectTmiFromIncome(
  annualTaxableIncome: number,
  householdParts: number = 1,
): TmiRate {
  const perPart = annualTaxableIncome / Math.max(1, householdParts);
  if (perPart <= 11_600) return 0;
  if (perPart <= 29_579) return 11;
  if (perPart <= 84_577) return 30;
  if (perPart <= 181_917) return 41;
  return 45;
}

/**
 * Calcule l'écart en années entre deux dates (fraction décimale).
 *
 * Convention : utilise 365.25 jours/an pour absorber les années
 * bissextiles. Pas besoin de plus de précision pour le seuil 3 ans BSPCE.
 */
export function yearsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  const millisPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return ms / millisPerYear;
}

/**
 * Applique le barème IR avec un TMI explicite (mode manual). Pour les
 * régimes où le bénéficiaire a déjà fixé son TMI à la main, on traite
 * la PV comme imposée à ce taux marginal (pas re-calcul progressif).
 *
 * C'est une approximation V1 : la PV poussée dans la dernière tranche
 * du contribuable ne déclenche pas la progressivité fine. V2 = barème
 * complet avec annualTaxableIncome.
 */
export function applyFlatTmi(taxableBase: number, tmi: TmiRate): number {
  if (taxableBase <= 0) return 0;
  return (taxableBase * tmi) / 100;
}

/**
 * Wrapper qui choisit la bonne stratégie IR selon le mode tmi.
 * - manual + manualTmiRate → flat TMI
 * - auto + annualTaxableIncome → barème progressif sur (income + base)
 *   moins barème sur income seul (effet marginal de la PV)
 */
export function computeIncomeTax(
  taxableBase: number,
  options: {
    tmiMode: 'manual' | 'auto';
    manualTmiRate?: TmiRate;
    annualTaxableIncome?: number;
    householdParts?: number;
  },
): number {
  if (taxableBase <= 0) return 0;

  if (options.tmiMode === 'manual') {
    if (options.manualTmiRate === undefined) {
      throw new Error('manualTmiRate required when tmiMode = manual');
    }
    return applyFlatTmi(taxableBase, options.manualTmiRate);
  }

  // mode auto : delta progressif (income + base) - (income)
  if (options.annualTaxableIncome === undefined) {
    throw new Error('annualTaxableIncome required when tmiMode = auto');
  }
  const parts = options.householdParts ?? 1;
  const irBase = computeProgressiveIR(options.annualTaxableIncome, parts);
  const irTotal = computeProgressiveIR(options.annualTaxableIncome + taxableBase, parts);
  return Math.max(0, irTotal - irBase);
}

/**
 * Arrondit à deux décimales (centimes). Évite les artefacts JS sur les
 * comparaisons d'égalité dans les tests.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
