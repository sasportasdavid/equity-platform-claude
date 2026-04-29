import type { PlanWizardData } from '@equity/shared';

/**
 * MODULE_03A_PLANS — métadonnées des 7 étapes du wizard.
 *
 * Pour chaque étape, on liste les champs RHF à valider via
 * `methods.trigger(fields)` avant de passer à la suivante. Les checks
 * cross-field globaux (somme tranches = 100 %, conditions, etc.) sont
 * dans `planWizardSchema.superRefine` et seront aussi déclenchés.
 *
 * `optional` = true marque les étapes qui peuvent être skippées (Step 4
 * si `hasPerformanceConditions === false`, Step 5 si plan sans leavers).
 */

export type WizardStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WizardStepDef = {
  id: WizardStepId;
  title: string;
  shortTitle: string;
  description: string;
  /** Fields RHF à valider via methods.trigger() avant le `next()` */
  fields: ReadonlyArray<keyof PlanWizardData>;
};

export function getStepFields(
  stepId: WizardStepId,
  data?: Partial<PlanWizardData>,
): ReadonlyArray<keyof PlanWizardData> {
  // Step 3 — discriminated union par `vestingType` : ne pas valider les fields
  // des autres modes (sinon une string vide stockée par un mode visité
  // précédemment fait échouer `regex(isoDateRegex)` et bloque « Suivant »
  // alors que le mode courant est valide).
  if (stepId === 3) {
    const mode = data?.vestingType;
    if (mode === 'single') return ['vestingType', 'singleVestingDate'];
    if (mode === 'tranches') return ['vestingType', 'vestingTranches'];
    if (mode === 'cliff_linear') {
      return ['vestingType', 'cliffMonths', 'cliffPercentage', 'totalMonths', 'frequency'];
    }
    // Pas encore de mode choisi → on bloque sur la sélection
    return ['vestingType'];
  }
  return WIZARD_STEPS.find((s) => s.id === stepId)?.fields ?? [];
}

/**
 * Une étape est dite "logiquement vide" quand son contenu n'est pas
 * pertinent pour la valeur actuelle du form. Aujourd'hui : Step 4 quand
 * `hasPerformanceConditions === false` (l'utilisateur n'a aucune
 * condition à saisir).
 */
export function isStepLogicallyEmpty(stepId: WizardStepId, data: Partial<PlanWizardData>): boolean {
  if (stepId === 4 && data.hasPerformanceConditions === false) return true;
  return false;
}

export const WIZARD_STEPS: ReadonlyArray<WizardStepDef> = [
  {
    id: 1,
    title: 'Type de plan',
    shortTitle: 'Type',
    description: 'BSPCE, AGA, Stock Options, etc.',
    fields: ['planType'],
  },
  {
    id: 2,
    title: 'Informations générales',
    shortTitle: 'Identité',
    description: 'Nom, dates, pool, prix d’exercice si applicable.',
    fields: [
      'name',
      'description',
      'boardDate',
      'grantDate',
      'shareholderMeetingDate',
      'shareholderAuthorizationExpiresAt',
      'poolSize',
      'exercisePrice',
    ],
  },
  {
    id: 3,
    title: 'Calendrier de vesting',
    shortTitle: 'Vesting',
    description: '3 modes : single, tranches, cliff_linear.',
    fields: [
      'vestingType',
      'singleVestingDate',
      'vestingTranches',
      'cliffMonths',
      'cliffPercentage',
      'totalMonths',
      'frequency',
    ],
  },
  {
    id: 4,
    title: 'Conditions de performance',
    shortTitle: 'Performance',
    description: 'Optionnel — conditions Marché / Non-marché / Service.',
    fields: [
      'hasPerformanceConditions',
      'combinationType',
      'evaluationMoment',
      'failureAction',
      'conditions',
    ],
  },
  {
    id: 5,
    title: 'Règles de départ',
    shortTitle: 'Leavers',
    description: 'Traitement par type de départ (8 types).',
    fields: ['leaverRules'],
  },
  {
    id: 6,
    title: 'Valuation Monte Carlo',
    shortTitle: 'Valuation',
    description: 'Sous-jacent, volatilité, modèle, paramètres MC.',
    fields: [
      'ticker',
      'companyTicker',
      'underlyingPrice',
      'currency',
      'volMethod',
      'volatility',
      'volatilityPriceType',
      'volatilityWinsorizingPct',
      'riskFreeRate',
      'dividendYield',
      'dividendInputMode',
      'dividendAmount',
      'lookbackDays',
      'correlationOverride',
      'modelChoice',
      'underlyingModel',
      'numPaths',
      'stepsPerYear',
      'useAntithetic',
      'timeHorizonYears',
      'hestonV0',
      'hestonKappa',
      'hestonTheta',
      'hestonXi',
      'hestonRho',
      'jumpLambda',
      'jumpMuJ',
      'jumpSigmaJ',
    ],
  },
  {
    id: 7,
    title: 'Récapitulatif',
    shortTitle: 'Review',
    description: 'Vérifiez et soumettez le plan.',
    // Pas de champ propre — le récap lit l'ensemble du form state
    fields: [],
  },
];

export const TOTAL_STEPS = WIZARD_STEPS.length;
