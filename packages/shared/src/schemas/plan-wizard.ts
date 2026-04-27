import { z } from 'zod';

/**
 * MODULE_03A_PLANS — schéma Zod centralisé du wizard 7 étapes (§2.2).
 *
 * Vit dans `@equity/shared` pour être réutilisable côté serveur (Server
 * Actions, RPC builders) ET côté client (RHF resolver, form types).
 *
 * Conventions :
 *  - Chaque étape a son schéma propre (`step1Schema`, ...) pour pouvoir
 *    `methods.trigger(stepFields)` au passage à l'étape suivante.
 *  - Les enums sont exportés en TS pour les composants UI (cards,
 *    selectors, etc.).
 *  - Les bornes numériques (LIMITS) sont également exportées pour cohérence
 *    UI ↔ validation.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
export const PLAN_WIZARD_LIMITS = {
  MAX_VESTING_TRANCHES: 60,
  MAX_PEER_GROUP: 30,
  MAX_CONDITIONS: 10,
  MAX_CURVE_POINTS: 20,
  MIN_VOLATILITY: 1,
  MAX_VOLATILITY: 200,
  MIN_RISK_FREE_RATE: -5,
  MAX_RISK_FREE_RATE: 20,
  MIN_DIVIDEND_YIELD: 0,
  MAX_DIVIDEND_YIELD: 20,
  MAX_POOL_SIZE: 100_000_000_000,
  MIN_POOL_SIZE: 1,
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_TARGET_VALUE_LENGTH: 100,
  MIN_NUM_PATHS: 1000,
  MAX_NUM_PATHS: 1_000_000,
  MIN_TIME_STEPS: 1,
  MAX_TIME_STEPS: 365,
  MIN_TIME_HORIZON: 0.1,
  MAX_TIME_HORIZON: 15,
} as const;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const PlanTypeEnum = z.enum([
  'BSPCE',
  'AGA',
  'STOCK_OPTION',
  'BSA',
  'PERFORMANCE_SHARE',
  'PHANTOM',
  'ESOP',
  'RSU',
  'SAR',
]);
export type PlanWizardType = z.infer<typeof PlanTypeEnum>;

export const VestingTypeEnum = z.enum(['single', 'tranches', 'cliff_linear']);
export type VestingType = z.infer<typeof VestingTypeEnum>;

export const FrequencyEnum = z.enum(['monthly', 'quarterly', 'annually']);
export type Frequency = z.infer<typeof FrequencyEnum>;

export const ConditionTypeEnum = z.enum(['MARKET', 'NON_MARKET', 'SERVICE']);
export type ConditionType = z.infer<typeof ConditionTypeEnum>;

export const CategoryEnum = z.enum(['FINANCIAL', 'PRODUCT', 'OPERATIONAL', 'STRATEGIC', 'ESG']);
export type ConditionCategory = z.infer<typeof CategoryEnum>;

export const MarketMetricEnum = z.enum([
  'SHARE_PRICE',
  'TSR_ABS',
  'TSR_REL_INDEX',
  'TSR_REL_PEERS',
]);
export type MarketMetric = z.infer<typeof MarketMetricEnum>;

export const NonMarketMetricEnum = z.enum([
  'EBITDA',
  'REVENUE',
  'NET_INCOME',
  'USERS',
  'ARR',
  'NPS',
  'ESG_SCORE',
  'CARBON',
  'CUSTOM',
]);
export type NonMarketMetric = z.infer<typeof NonMarketMetricEnum>;

export const ComparisonOperatorEnum = z.enum(['>=', '<=', '>', '<', '=', '!=']);
export type ComparisonOperator = z.infer<typeof ComparisonOperatorEnum>;

export const CombinationTypeEnum = z.enum(['AND', 'OR', 'WEIGHTED']);
export type CombinationType = z.infer<typeof CombinationTypeEnum>;

export const EvaluationMomentEnum = z.enum(['END', 'CONTINUOUS', 'ANNUAL']);
export type EvaluationMoment = z.infer<typeof EvaluationMomentEnum>;

export const FailureActionEnum = z.enum(['FORFEIT', 'PARTIAL', 'DEFER']);
export type FailureAction = z.infer<typeof FailureActionEnum>;

export const CurrencyEnum = z.enum(['EUR', 'USD', 'GBP', 'CHF']);
export type WizardCurrency = z.infer<typeof CurrencyEnum>;

export const VolMethodEnum = z.enum(['MANUAL', 'HISTORICAL', 'IMPLIED', 'MIXED']);
export type VolMethod = z.infer<typeof VolMethodEnum>;

export const ModelChoiceEnum = z.enum(['auto', 'black_scholes', 'monte_carlo']);
export type ModelChoice = z.infer<typeof ModelChoiceEnum>;

export const UnderlyingModelEnum = z.enum(['GBM', 'HESTON', 'JUMP_DIFFUSION']);
export type UnderlyingModel = z.infer<typeof UnderlyingModelEnum>;

export const ReferencePriceMethodEnum = z.enum(['SPOT', 'FIXED', 'AVERAGE']);
export type ReferencePriceMethod = z.infer<typeof ReferencePriceMethodEnum>;

export const ComparisonMethodEnum = z.enum(['WEIGHTED_AVERAGE', 'MEDIAN', 'RANKING']);
export type ComparisonMethod = z.infer<typeof ComparisonMethodEnum>;

export const AcquisitionScaleModeEnum = z.enum(['TIERS', 'CURVE']);
export type AcquisitionScaleMode = z.infer<typeof AcquisitionScaleModeEnum>;

export const LeaverTypeEnum = z.enum([
  'resignation',
  'termination_cause',
  'termination_no_cause',
  'death',
  'retirement',
  'company_sale',
  'mutual_agreement',
  'end_of_contract',
]);
export type WizardLeaverType = z.infer<typeof LeaverTypeEnum>;

export const LeaverTreatmentEnum = z.enum([
  'forfeit_all',
  'keep_vested',
  'pro_rata',
  'accelerate',
  'full_accelerate',
]);
export type WizardLeaverTreatment = z.infer<typeof LeaverTreatmentEnum>;

// ---------------------------------------------------------------------------
// Step 1 — Plan Type
// ---------------------------------------------------------------------------
export const step1Schema = z.object({
  planType: PlanTypeEnum,
});
export type Step1Data = z.infer<typeof step1Schema>;

// ---------------------------------------------------------------------------
// Step 2 — General Info
// ---------------------------------------------------------------------------
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const step2Schema = z.object({
  name: z
    .string()
    .trim()
    .min(PLAN_WIZARD_LIMITS.MIN_NAME_LENGTH, 'Le nom doit faire au moins 3 caractères')
    .max(PLAN_WIZARD_LIMITS.MAX_NAME_LENGTH, 'Le nom doit faire au plus 100 caractères'),
  boardDate: z.string().regex(isoDateRegex, 'Date conseil invalide (YYYY-MM-DD)'),
  grantDate: z.string().regex(isoDateRegex, 'Date d’attribution invalide (YYYY-MM-DD)').optional(),
  poolSize: z
    .number({ message: 'Pool requis' })
    .int('Le pool doit être un entier')
    .min(PLAN_WIZARD_LIMITS.MIN_POOL_SIZE, 'Pool minimum : 1')
    .max(PLAN_WIZARD_LIMITS.MAX_POOL_SIZE, 'Pool trop important'),
  exercisePrice: z.number().min(0, 'Le prix d’exercice doit être ≥ 0').optional(),
  description: z.string().max(PLAN_WIZARD_LIMITS.MAX_DESCRIPTION_LENGTH).optional(),
  shareholderMeetingDate: z.string().optional(),
  shareholderAuthorizationExpiresAt: z.string().optional(),
});
export type Step2Data = z.infer<typeof step2Schema>;

// ---------------------------------------------------------------------------
// Step 3 — Vesting (réservé au prochain commit, schéma squelette quand même
// pour que le type PlanWizardData reflète déjà la cible)
// ---------------------------------------------------------------------------
export const vestingTrancheSchema = z.object({
  vestingDate: z.string().regex(isoDateRegex),
  percentage: z.number().min(0).max(100),
});
export type VestingTrancheInput = z.infer<typeof vestingTrancheSchema>;

export const step3Schema = z.discriminatedUnion('vestingType', [
  z.object({
    vestingType: z.literal('single'),
    singleVestingDate: z.string().regex(isoDateRegex),
  }),
  z.object({
    vestingType: z.literal('tranches'),
    vestingTranches: z
      .array(vestingTrancheSchema)
      .min(1)
      .max(PLAN_WIZARD_LIMITS.MAX_VESTING_TRANCHES)
      .refine((tranches) => Math.abs(tranches.reduce((s, t) => s + t.percentage, 0) - 100) < 0.01, {
        message: 'Total des pourcentages doit égaler 100 %',
      }),
  }),
  z.object({
    vestingType: z.literal('cliff_linear'),
    cliffMonths: z.number().int().min(0).max(48),
    cliffPercentage: z.number().min(0).max(100),
    totalMonths: z.number().int().min(12),
    frequency: FrequencyEnum,
  }),
]);
export type Step3Data = z.infer<typeof step3Schema>;

// ---------------------------------------------------------------------------
// Step 4 — Performance (squelette ; détails enrichis dans un commit dédié)
// ---------------------------------------------------------------------------
export const peerCompanySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  ticker: z.string().regex(/^[A-Z0-9.-]{1,20}$/),
  weight: z.number().min(0).max(100).optional(),
  s0: z.number().optional(),
  volatility: z.number().optional(),
  correlationWithMain: z.number().min(-1).max(1).optional(),
  volatilityOverride: z.boolean().optional(),
  correlationOverride: z.boolean().optional(),
});
export type PeerCompany = z.infer<typeof peerCompanySchema>;

export const peerGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  weight: z.number().min(0).max(100),
  peers: z.array(peerCompanySchema).min(1),
});
export type PeerGroupInput = z.infer<typeof peerGroupSchema>;

export const acquisitionCurvePointSchema = z.object({
  threshold: z.number().min(0).max(300),
  acquisition: z.number().min(0).max(200),
  label: z.string().optional(),
});

export const acquisitionTierSchema = z.object({
  min: z.number().min(0).max(200),
  max: z.number().min(0).max(300),
  acquisition: z.number().min(0).max(200),
  label: z.string().optional(),
});

export const acquisitionScaleSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('CURVE'),
    points: z.array(acquisitionCurvePointSchema).min(2).max(PLAN_WIZARD_LIMITS.MAX_CURVE_POINTS),
  }),
  z.object({
    mode: z.literal('TIERS'),
    tiers: z.array(acquisitionTierSchema).min(2).max(10),
  }),
]);
export type AcquisitionScale = z.infer<typeof acquisitionScaleSchema>;

export const performanceConditionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  conditionType: ConditionTypeEnum,
  category: CategoryEnum,
  weight: z.number().min(0).max(100),
  enablePartialScoring: z.boolean().default(true),
  performanceStartDate: z.string().optional(),
  performanceEndDate: z.string().optional(),
  metric: NonMarketMetricEnum.optional(),
  targetValue: z.string().max(PLAN_WIZARD_LIMITS.MAX_TARGET_VALUE_LENGTH).optional(),
  targetUnit: z.string().optional(),
  comparisonOperator: ComparisonOperatorEnum.optional(),
  thresholdMin: z.string().optional(),
  thresholdMax: z.string().optional(),
  marketMetricType: MarketMetricEnum.optional(),
  referenceIndex: z
    .string()
    .regex(/^[A-Z0-9\s.-]{1,30}$/)
    .optional(),
  referenceIndexDisplayName: z.string().optional(),
  peerGroup: z.array(peerCompanySchema).max(PLAN_WIZARD_LIMITS.MAX_PEER_GROUP).optional(),
  weightedPeerGroups: z.array(peerGroupSchema).optional(),
  comparisonMethod: ComparisonMethodEnum.optional(),
  startPriceMethod: ReferencePriceMethodEnum.optional(),
  startFixedPrice: z.string().optional(),
  startAveragingDays: z.string().optional(),
  endPriceMethod: ReferencePriceMethodEnum.optional(),
  endFixedPrice: z.string().optional(),
  endAveragingDays: z.string().optional(),
  measurementPeriodYears: z.string().optional(),
  acquisitionScale: acquisitionScaleSchema.optional(),
});
export type PerformanceConditionInput = z.infer<typeof performanceConditionSchema>;

export const step4Schema = z.object({
  hasPerformanceConditions: z.boolean(),
  combinationType: CombinationTypeEnum.optional(),
  evaluationMoment: EvaluationMomentEnum.optional(),
  failureAction: FailureActionEnum.optional(),
  conditions: z.array(performanceConditionSchema).max(PLAN_WIZARD_LIMITS.MAX_CONDITIONS).optional(),
});
export type Step4Data = z.infer<typeof step4Schema>;

// ---------------------------------------------------------------------------
// Step 5 — Leavers (squelette)
// ---------------------------------------------------------------------------
export const leaverRulesSchema = z.record(
  LeaverTypeEnum,
  z.object({
    treatment: LeaverTreatmentEnum,
    accelerationMonths: z.number().int().min(0).optional(),
    exerciseWindowDays: z.number().int().min(0).optional(),
  }),
);
export type LeaverRulesInput = z.infer<typeof leaverRulesSchema>;

export const step5Schema = z.object({
  leaverRules: leaverRulesSchema,
});
export type Step5Data = z.infer<typeof step5Schema>;

// ---------------------------------------------------------------------------
// Step 6 — Valuation (squelette)
// ---------------------------------------------------------------------------
export const step6Schema = z.object({
  ticker: z.string().optional(),
  companyTicker: z.string().optional(),
  underlyingPrice: z.number().min(0.01),
  currency: CurrencyEnum.default('EUR'),
  volMethod: VolMethodEnum.default('MANUAL'),
  volatility: z
    .number()
    .min(PLAN_WIZARD_LIMITS.MIN_VOLATILITY)
    .max(PLAN_WIZARD_LIMITS.MAX_VOLATILITY),
  volatilityPriceType: z.enum(['CLOSE', 'OPEN']).default('CLOSE'),
  volatilityWinsorizingPct: z.number().min(0).max(20).default(0),
  riskFreeRate: z
    .number()
    .min(PLAN_WIZARD_LIMITS.MIN_RISK_FREE_RATE)
    .max(PLAN_WIZARD_LIMITS.MAX_RISK_FREE_RATE),
  dividendYield: z.number().min(0).max(PLAN_WIZARD_LIMITS.MAX_DIVIDEND_YIELD),
  dividendInputMode: z.enum(['percent', 'amount']).default('percent'),
  dividendAmount: z.number().optional(),
  lookbackDays: z.number().int().min(180).max(3650).default(1095),
  correlationOverride: z.number().min(-1).max(1).optional(),
  modelChoice: ModelChoiceEnum.default('auto'),
  underlyingModel: UnderlyingModelEnum.default('GBM'),
  numPaths: z
    .number()
    .int()
    .min(PLAN_WIZARD_LIMITS.MIN_NUM_PATHS)
    .max(PLAN_WIZARD_LIMITS.MAX_NUM_PATHS)
    .default(50000),
  stepsPerYear: z
    .number()
    .int()
    .refine((n) => [12, 52, 252].includes(n))
    .default(12),
  useAntithetic: z.boolean().default(true),
  timeHorizonYears: z
    .number()
    .min(PLAN_WIZARD_LIMITS.MIN_TIME_HORIZON)
    .max(PLAN_WIZARD_LIMITS.MAX_TIME_HORIZON),
  hestonV0: z.number().optional(),
  hestonKappa: z.number().optional(),
  hestonTheta: z.number().optional(),
  hestonXi: z.number().optional(),
  hestonRho: z.number().optional(),
  jumpLambda: z.number().optional(),
  jumpMuJ: z.number().optional(),
  jumpSigmaJ: z.number().optional(),
});
export type Step6Data = z.infer<typeof step6Schema>;

// ---------------------------------------------------------------------------
// Wizard complet — type unifié pour le state RHF + payload Server Action
// ---------------------------------------------------------------------------
const planWizardBase = step1Schema
  .merge(step2Schema.partial())
  .merge(step4Schema.partial())
  .merge(step5Schema.partial())
  .merge(step6Schema.partial())
  // Step 3 utilise discriminated union → on étend manuellement avec partial
  .extend({
    vestingType: VestingTypeEnum.optional(),
    singleVestingDate: z.string().regex(isoDateRegex).optional(),
    vestingTranches: z.array(vestingTrancheSchema).optional(),
    cliffMonths: z.number().int().optional(),
    cliffPercentage: z.number().optional(),
    totalMonths: z.number().int().optional(),
    frequency: FrequencyEnum.optional(),
  });

/**
 * Schéma complet du wizard avec validations cross-step :
 *  - `singleVestingDate > grantDate` (Step 3 single + Step 2 grantDate)
 *  - mode `tranches` : somme des % = 100 (déjà appliqué dans step3Schema
 *    discriminated union, mais on dépend ici de l'array partial)
 *  - mode `cliff_linear` : cliffMonths < totalMonths
 *
 * Tous les checks sont attachés au schéma global parce qu'ils croisent des
 * champs de plusieurs étapes ; les step-schemas individuels restent
 * réutilisables pour `methods.trigger(stepFields)`.
 */
export const planWizardSchema = planWizardBase.superRefine((data, ctx) => {
  // single — date de vesting > date de grant
  if (
    data.vestingType === 'single' &&
    data.singleVestingDate &&
    data.grantDate &&
    data.singleVestingDate <= data.grantDate
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['singleVestingDate'],
      message: 'La date de vesting doit être strictement postérieure à la date d’attribution',
    });
  }

  // tranches — somme des pourcentages = 100 (tolérance 0.01)
  if (data.vestingType === 'tranches' && data.vestingTranches) {
    const total = data.vestingTranches.reduce((s, t) => s + t.percentage, 0);
    if (Math.abs(total - 100) >= 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vestingTranches'],
        message: `La somme des pourcentages doit valoir 100 % (actuellement ${total.toFixed(2)} %).`,
      });
    }
    // Toutes les dates de tranches doivent être > grantDate
    if (data.grantDate) {
      data.vestingTranches.forEach((tranche, idx) => {
        if (tranche.vestingDate <= data.grantDate!) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['vestingTranches', idx, 'vestingDate'],
            message: 'Doit être postérieure à la date d’attribution',
          });
        }
      });
    }
  }

  // cliff_linear — cliffMonths < totalMonths
  if (
    data.vestingType === 'cliff_linear' &&
    data.cliffMonths != null &&
    data.totalMonths != null &&
    data.cliffMonths >= data.totalMonths
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cliffMonths'],
      message: 'Le cliff doit être strictement inférieur à la durée totale du vesting',
    });
  }
});

export type PlanWizardData = z.infer<typeof planWizardSchema>;

// ---------------------------------------------------------------------------
// Métadonnées UI : labels FR pour les types de plan
// ---------------------------------------------------------------------------
export const PLAN_TYPE_UI_LABELS: Record<PlanWizardType, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Options',
  BSA: 'BSA',
  PERFORMANCE_SHARE: 'Actions de performance',
  PHANTOM: 'Phantom Stock',
  ESOP: 'ESOP',
  RSU: 'RSU',
  SAR: 'SAR',
};

/** Types de plans pour lesquels un prix d'exercice est requis. */
export const PLAN_TYPES_REQUIRING_STRIKE: ReadonlySet<PlanWizardType> = new Set([
  'BSPCE',
  'STOCK_OPTION',
  'BSA',
  'SAR',
]);

/**
 * Validation strike vs FMV (Module 3a §2.5 Step 2).
 *  - BSPCE : strike ≥ 100 % FMV
 *  - STOCK_OPTION (US-style) : strike ≥ 80 % FMV (recommandation safe-harbour)
 *  - Autres : pas de contrainte spéciale
 */
export function strikeMinPercent(planType: PlanWizardType): number | null {
  if (planType === 'BSPCE') return 1.0;
  if (planType === 'STOCK_OPTION') return 0.8;
  return null;
}

/** Mois minimum d'acquisition recommandés (warning soft, pas blocant). */
export const MIN_ACQUISITION_MONTHS_BY_TYPE: Record<PlanWizardType, number> = {
  BSPCE: 12,
  AGA: 12,
  STOCK_OPTION: 12,
  BSA: 0,
  PERFORMANCE_SHARE: 12,
  RSU: 12,
  PHANTOM: 0,
  ESOP: 12,
  SAR: 12,
};
