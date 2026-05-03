/**
 * Types canoniques de la lib de simulation fiscale française.
 *
 * Pure TS, aucune dépendance Supabase / Next.js / React.
 */

/**
 * Régime fiscal détecté à partir de planType + dates de l'award.
 *
 * Pré-2018 et post-2025 sont signalés dans `warnings` (V1 simplifié →
 * V2 régimes distincts).
 */
export type FrenchTaxRegime =
  | 'BSPCE_3Y_PLUS'
  | 'BSPCE_3Y_LESS'
  | 'STOCK_OPTION_QUALIFIE'
  | 'STOCK_OPTION_NON_QUALIFIE'
  | 'BSA'
  | 'AGA_POST_2018'
  | 'AGA_PRE_2018';

/** Taux marginal d'imposition (TMI) à la française. */
export type TmiRate = 0 | 11 | 30 | 41 | 45;

/** Erreurs typées renvoyées par l'API publique. */
export type TaxErrorCode = 'TAX_INPUT_INVALID' | 'TAX_REGIME_UNSUPPORTED' | 'TAX_DATA_INCONSISTENT';

export type TaxError = {
  code: TaxErrorCode;
  message: string;
};

/** Résultat type-safe (pas de throw côté API publique). */
export type Result<T> = { ok: true; data: T } | { ok: false; error: TaxError };

/**
 * Entrée principale de simulation. Le call-site fournit toutes les
 * données économiques + identité fiscale du bénéficiaire.
 */
export type SimulationInput = {
  /** Type de plan tel que stocké en DB. Détermine la branche de calcul. */
  planType: 'BSPCE' | 'STOCK_OPTION' | 'BSA' | 'AGA';

  /** Date d'attribution de l'award (utile pour BSPCE post-2025 et AGA pré/post-2018). */
  attributionDate: Date;
  /** Date prévue d'exercice. */
  exerciseDate: Date;
  /**
   * Date prévue de cession. Optionnel : si absent, on suppose une
   * cession concomitante à l'exercice (utilisée pour AGA et SO).
   */
  cessionDate?: Date;
  /**
   * Date d'embauche pour calcul d'ancienneté BSPCE. Obligatoire pour
   * BSPCE quand on souhaite distinguer < 3 ans / ≥ 3 ans.
   */
  hireDate?: Date;

  /** Nombre d'unités exercées dans cette simulation. */
  unitsToExercise: number;
  /** Prix d'exercice (strike) en €. */
  strikePrice: number;
  /** FMV au jour de l'exercice (manuel ou tiré de companies.last_known_fmv_per_share). */
  fmvAtExercise: number;
  /**
   * Prix de cession prévu en €. Si non fourni, on prend `fmvAtExercise`
   * (cession concomitante).
   */
  fmvAtCession?: number;

  /** Mode de détermination du TMI. */
  tmiMode: 'manual' | 'auto';
  /** Si tmiMode = 'manual'. */
  manualTmiRate?: TmiRate;
  /** Si tmiMode = 'auto' : revenu net imposable annuel (€) hors plus-value simulée. */
  annualTaxableIncome?: number;
  /** Quotient familial (1 par défaut). */
  householdParts?: number;

  /**
   * Demande explicite d'option barème IR au lieu du PFU. Ignoré pour
   * BSPCE < 3 ans (pas d'option disponible).
   */
  optBaremeProgressif?: boolean;
};

/**
 * Tranche d'un calcul multi-tranches. Chaque tranche peut avoir sa
 * propre `vestingDate` qui ré-évalue l'ancienneté BSPCE (et donc le
 * régime applicable).
 */
export type TrancheInput = {
  unitsToExercise: number;
  /** Date d'acquisition (vesting) de la tranche — utilisée pour ancienneté. */
  vestingDate: Date;
};

/** Détail économique et fiscal renvoyé par chaque calcul. */
export type TaxBreakdown = {
  regime: FrenchTaxRegime;

  /** Strike × units. */
  grossExerciseAmount: number;
  /** Prix cession × units. */
  grossSaleAmount: number;
  /** (FMV cession - strike) × units (peut être négatif si moins-value). */
  grossGainAmount: number;

  /** Plus-value d'acquisition (si applicable). 0 sinon. */
  acquisitionTaxableBase: number;
  acquisitionIncomeTax: number;
  acquisitionSocialContributions: number;

  /** Plus-value de cession (toujours ≥ 0 dans les calculs simples). */
  cessionTaxableBase: number;
  cessionIncomeTax: number;
  cessionSocialContributions: number;

  /** Acquisition + cession. */
  totalTaxAmount: number;
  /** Gain économique - impôts. */
  netGainAmount: number;
  /** totalTaxAmount / grossGainAmount (0 si grossGain ≤ 0). */
  effectiveTaxRate: number;

  /** Avertissements humains (FR). */
  warnings: string[];

  /** Année de référence des taux appliqués. */
  ratesYear: 2026;
  /** ISO timestamp UTC de la simulation. */
  computedAt: string;
  /** Sources officielles citées. */
  sources: { regime: string; url: string }[];
};

/** Résultat agrégé multi-tranches. Hérite de TaxBreakdown sur les totaux. */
export type MultiTrancheBreakdown = TaxBreakdown & {
  /** Détail par tranche (taille = nombre de tranches en entrée). */
  tranches: TaxBreakdown[];
};
