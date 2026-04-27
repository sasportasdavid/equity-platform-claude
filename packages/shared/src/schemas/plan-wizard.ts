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
  MAX_PEER_GROUPS: 10,
  MIN_AVERAGING_DAYS: 1,
  MAX_AVERAGING_DAYS: 90,
  MAX_REFERENCE_PRICE: 1_000_000,
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
  // Tolère l'empty pour que le message Zod du regex ne masque pas le
  // message FR « Ticker requis » émis par le superRefine. Le regex
  // s'applique uniquement quand l'utilisateur a saisi qqch.
  ticker: z
    .string()
    .regex(/^[A-Z0-9.\-^_]{0,20}$/, 'Ticker invalide (majuscules / chiffres / . - ^ _)'),
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
  // Tolère array vide pour que le superRefine émette son message FR
  // « Au moins un peer requis dans ce groupe » (cf. validation TSR_REL_PEERS).
  peers: z.array(peerCompanySchema),
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

// Tolère les arrays vides ; les minimums (2 points / 2 tiers) sont validés
// dans le superRefine global avec messages FR explicites (pattern partagé
// avec peerGroup / weightedPeerGroups). Le `.max(...)` reste car son
// dépassement est exceptionnel (UI bloque le bouton add à la limite).
export const acquisitionScaleSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('CURVE'),
    points: z.array(acquisitionCurvePointSchema).max(PLAN_WIZARD_LIMITS.MAX_CURVE_POINTS),
  }),
  z.object({
    mode: z.literal('TIERS'),
    tiers: z.array(acquisitionTierSchema).max(10),
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
    // Tickers Yahoo Finance : prefixe `^` pour les indices (^FCHI, ^GSPC,
    // ^NDX), points pour les classes d'actions (BRK.B), tirets et chiffres
    // pour certains markets. On garde la majuscule + caractères usuels.
    .regex(/^[A-Z0-9\s.\-^_]{1,30}$/)
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
// Step 5 — Leavers
// ---------------------------------------------------------------------------
// Une règle par leaver type — chaque entrée est optionnelle (les types
// non définis sont traités comme `forfeit_all` par défaut côté Server
// Action / moteur Monte Carlo).
//
// `accelerationMonths` et `exerciseWindowDays` utilisent `z.preprocess`
// pour tolérer le NaN renvoyé par RHF quand l'input number est vide
// (`valueAsNumber: true`). Sans ça, l'erreur Zod par défaut « Invalid
// input: expected number, received NaN » masquerait le message FR
// émis par le superRefine.
const optionalCount = (max: number) =>
  z.preprocess(
    (v) => (v === '' || v == null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z.number().int().min(0).max(max).optional(),
  );

// Le composant Step5Leavers rend `<select value={treatment ?? ''}>` ce
// qui fait que RHF stocke `{ treatment: '' }` pour les types non
// renseignés. On preprocess pour traiter ces objets comme `undefined`
// (= "pas de règle, défaut forfeit_all côté Server Action").
const leaverRuleSchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object') return v;
    const obj = v as Record<string, unknown>;
    if (obj.treatment === '' || obj.treatment == null) return undefined;
    return v;
  },
  z
    .object({
      treatment: LeaverTreatmentEnum,
      accelerationMonths: optionalCount(60),
      exerciseWindowDays: optionalCount(3650),
    })
    .optional(),
);

export const leaverRulesSchema = z.object({
  resignation: leaverRuleSchema,
  termination_cause: leaverRuleSchema,
  termination_no_cause: leaverRuleSchema,
  death: leaverRuleSchema,
  retirement: leaverRuleSchema,
  company_sale: leaverRuleSchema,
  mutual_agreement: leaverRuleSchema,
  end_of_contract: leaverRuleSchema,
});
export type LeaverRulesInput = z.infer<typeof leaverRulesSchema>;

export const step5Schema = z.object({
  leaverRules: leaverRulesSchema,
});
export type Step5Data = z.infer<typeof step5Schema>;

// ---------------------------------------------------------------------------
// Step 6 — Valuation
// ---------------------------------------------------------------------------
// Helper : transforme NaN / '' / null en undefined avant la validation.
// RHF avec `valueAsNumber: true` renvoie NaN sur input vide, ce qui fait
// fail Zod (« expected number, received NaN ») et empêche le superRefine
// de s'exécuter. Pattern partagé avec leavers (cf. optionalCount).
const nanToUndef = (v: unknown) =>
  v === '' || v == null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v;

export const step6Schema = z.object({
  ticker: z.string().optional(),
  companyTicker: z.string().optional(),
  underlyingPrice: z.preprocess(nanToUndef, z.number().min(0.01)),
  currency: CurrencyEnum.default('EUR'),
  volMethod: VolMethodEnum.default('MANUAL'),
  volatility: z.preprocess(
    nanToUndef,
    z.number().min(PLAN_WIZARD_LIMITS.MIN_VOLATILITY).max(PLAN_WIZARD_LIMITS.MAX_VOLATILITY),
  ),
  volatilityPriceType: z.enum(['CLOSE', 'OPEN']).default('CLOSE'),
  volatilityWinsorizingPct: z.preprocess(nanToUndef, z.number().min(0).max(20).default(0)),
  riskFreeRate: z.preprocess(
    nanToUndef,
    z
      .number()
      .min(PLAN_WIZARD_LIMITS.MIN_RISK_FREE_RATE)
      .max(PLAN_WIZARD_LIMITS.MAX_RISK_FREE_RATE),
  ),
  dividendYield: z.preprocess(
    nanToUndef,
    z.number().min(0).max(PLAN_WIZARD_LIMITS.MAX_DIVIDEND_YIELD),
  ),
  dividendInputMode: z.enum(['percent', 'amount']).default('percent'),
  dividendAmount: z.preprocess(nanToUndef, z.number().optional()),
  lookbackDays: z.preprocess(nanToUndef, z.number().int().min(180).max(3650).default(1095)),
  correlationOverride: z.preprocess(nanToUndef, z.number().min(-1).max(1).optional()),
  modelChoice: ModelChoiceEnum.default('auto'),
  underlyingModel: UnderlyingModelEnum.default('GBM'),
  numPaths: z.preprocess(
    nanToUndef,
    z
      .number()
      .int()
      .min(PLAN_WIZARD_LIMITS.MIN_NUM_PATHS)
      .max(PLAN_WIZARD_LIMITS.MAX_NUM_PATHS)
      .default(50000),
  ),
  stepsPerYear: z.preprocess(
    nanToUndef,
    z
      .number()
      .int()
      .refine((n) => [12, 52, 252].includes(n))
      .default(12),
  ),
  useAntithetic: z.boolean().default(true),
  timeHorizonYears: z.preprocess(
    nanToUndef,
    z.number().min(PLAN_WIZARD_LIMITS.MIN_TIME_HORIZON).max(PLAN_WIZARD_LIMITS.MAX_TIME_HORIZON),
  ),
  hestonV0: z.preprocess(nanToUndef, z.number().optional()),
  hestonKappa: z.preprocess(nanToUndef, z.number().optional()),
  hestonTheta: z.preprocess(nanToUndef, z.number().optional()),
  hestonXi: z.preprocess(nanToUndef, z.number().optional()),
  hestonRho: z.preprocess(nanToUndef, z.number().optional()),
  jumpLambda: z.preprocess(nanToUndef, z.number().optional()),
  jumpMuJ: z.preprocess(nanToUndef, z.number().optional()),
  jumpSigmaJ: z.preprocess(nanToUndef, z.number().optional()),
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
 *  - mode `cliff_linear` : cliffMonths ≤ totalMonths
 *
 * Tous les checks sont attachés au schéma global parce qu'ils croisent des
 * champs de plusieurs étapes ; les step-schemas individuels restent
 * réutilisables pour `methods.trigger(stepFields)`.
 *
 * ⚠️ Tension input/output Zod (à connaître côté wizard / Server Actions) :
 *
 * Plusieurs champs déclarent `.default(...)` (`useAntithetic`, `numPaths`,
 * `currency`, `volMethod`, `enablePartialScoring`, etc.). Conséquence :
 *   - `z.input<typeof planWizardSchema>`  → ces champs sont OPTIONNELS
 *     (l'utilisateur n'a pas à les fournir, le default s'applique au parse)
 *   - `z.output<typeof planWizardSchema>` (= `PlanWizardData` exporté ici)
 *     → ces champs sont REQUIS (après application des defaults)
 *
 * Le `zodResolver(planWizardSchema)` du frontend renvoie `Resolver<input>`,
 * mais `useForm<PlanWizardData>()` (= output) attend `Resolver<output>` →
 * mismatch, d'où le cast `as unknown as Resolver<PlanWizardData>` qu'on
 * trouve dans le sandbox et qu'on retrouvera dans le wizard container.
 *
 * Côté Server Actions, on parse en sortie (output), donc on récupère
 * directement `PlanWizardData` avec tous les defaults appliqués.
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

  // cliff_linear — cliffMonths ≤ totalMonths.
  // L'égalité représente un cliff unique sans paliers post-cliff (cas
  // dégénéré mais légal — generateCliffLinearTranches le supporte en
  // renvoyant 1 tranche au cliff date, drift-corrected à 100 %).
  if (
    data.vestingType === 'cliff_linear' &&
    data.cliffMonths != null &&
    data.totalMonths != null &&
    data.cliffMonths > data.totalMonths
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cliffMonths'],
      message: 'Le cliff ne peut pas dépasser la durée totale du vesting',
    });
  }

  // ---- Step 4 — branche NON_MARKET ----
  // Pour chaque condition de type NON_MARKET, on exige metric +
  // comparisonOperator + targetValue (non vide). Le targetUnit reste
  // optionnel : il sera auto-rempli côté UI à partir de
  // NON_MARKET_METRIC_DEFAULT_UNITS, sauf pour USERS / CUSTOM où l'on
  // demande à l'utilisateur de saisir explicitement (vérification ci-dessous).
  // Les seuils thresholdMin / thresholdMax sont parsés en number et
  // contraints aux bornes [0, 100] / [0, 200] avec la garantie min ≤ max.
  if (data.hasPerformanceConditions && data.conditions) {
    data.conditions.forEach((cond, idx) => {
      if (cond.conditionType !== 'NON_MARKET') return;

      if (!cond.metric) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'metric'],
          message: 'Métrique obligatoire pour une condition non-marché',
        });
      }
      if (!cond.comparisonOperator) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'comparisonOperator'],
          message: 'Opérateur de comparaison requis',
        });
      }
      const trimmedTarget = (cond.targetValue ?? '').trim();
      if (trimmedTarget.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'targetValue'],
          message: 'Valeur cible requise',
        });
      }

      // Pour USERS et CUSTOM on n'a pas de défaut → exiger une unité.
      if (cond.metric === 'USERS' || cond.metric === 'CUSTOM') {
        const trimmedUnit = (cond.targetUnit ?? '').trim();
        if (trimmedUnit.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['conditions', idx, 'targetUnit'],
            message: 'Unité requise pour cette métrique (pas de défaut)',
          });
        }
      }

      // Seuils — on parse manuellement parce qu'ils sont stockés en string
      // (input HTML number = string non-vide). On laisse passer null/empty.
      const minRaw = cond.thresholdMin?.trim();
      const maxRaw = cond.thresholdMax?.trim();
      const minNum = minRaw ? Number(minRaw) : null;
      const maxNum = maxRaw ? Number(maxRaw) : null;

      if (minNum !== null && Number.isFinite(minNum)) {
        if (
          minNum < PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_LOWER ||
          minNum > PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_UPPER
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['conditions', idx, 'thresholdMin'],
            message: `Le seuil min doit être entre ${PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_LOWER} et ${PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_UPPER} %`,
          });
        }
      } else if (minRaw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'thresholdMin'],
          message: 'Seuil min : nombre invalide',
        });
      }

      if (maxNum !== null && Number.isFinite(maxNum)) {
        if (
          maxNum < PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_LOWER ||
          maxNum > PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_UPPER
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['conditions', idx, 'thresholdMax'],
            message: `Le seuil max doit être entre ${PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_LOWER} et ${PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_UPPER} %`,
          });
        }
      } else if (maxRaw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'thresholdMax'],
          message: 'Seuil max : nombre invalide',
        });
      }

      if (
        minNum !== null &&
        maxNum !== null &&
        Number.isFinite(minNum) &&
        Number.isFinite(maxNum) &&
        minNum > maxNum
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'thresholdMax'],
          message: 'Le seuil max doit être ≥ au seuil min',
        });
      }
    });

    // ---- Step 4 — branche MARKET (commit 4.4 : SHARE_PRICE / TSR_ABS) ----
    // Pour chaque condition de type MARKET, on exige marketMetricType +
    // comparisonOperator + targetValue + dates de mesure (start + end).
    // L'unité (`targetUnit`) est auto-mappée côté UI (€ pour SHARE_PRICE,
    // % pour TSR_ABS) — donc optionnelle ici.
    // Les sous-types TSR_REL_INDEX / TSR_REL_PEERS ne sont pas encore
    // implémentés (commits 4.5 / 4.6) ; ils sont validés à minima ici
    // pour ne pas casser quand les futurs commits poseront leurs champs.
    data.conditions.forEach((cond, idx) => {
      if (cond.conditionType !== 'MARKET') return;

      if (!cond.marketMetricType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'marketMetricType'],
          message: 'Métrique marché obligatoire',
        });
      }
      if (!cond.comparisonOperator) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'comparisonOperator'],
          message: 'Opérateur de comparaison requis',
        });
      }
      const trimmedTarget = (cond.targetValue ?? '').trim();
      if (trimmedTarget.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'targetValue'],
          message: 'Valeur cible requise',
        });
      }

      // Dates de mesure obligatoires pour toutes les conditions MARKET.
      const start = cond.performanceStartDate?.trim();
      const end = cond.performanceEndDate?.trim();
      if (!start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'performanceStartDate'],
          message: 'Date de début de mesure obligatoire pour une condition de marché',
        });
      }
      if (!end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'performanceEndDate'],
          message: 'Date de fin de mesure obligatoire pour une condition de marché',
        });
      }
      if (start && end && end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'performanceEndDate'],
          message: 'La date de fin doit être strictement postérieure à la date de début',
        });
      }
      // Cohérence avec grantDate au niveau du plan.
      if (start && data.grantDate && start < data.grantDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditions', idx, 'performanceStartDate'],
          message: 'Doit être ≥ à la date d’attribution du plan',
        });
      }

      // Validations spécifiques au sous-type MARKET.
      if (cond.marketMetricType === 'TSR_REL_INDEX') {
        const idx_index = (cond.referenceIndex ?? '').trim();
        if (idx_index.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['conditions', idx, 'referenceIndex'],
            message: 'Indice de référence requis pour TSR relatif vs indice',
          });
        }
      }

      if (cond.marketMetricType === 'TSR_REL_PEERS') {
        // Mode WEIGHTED (4.7) : si `weightedPeerGroups` est non vide, on
        // ignore `peerGroup` et on valide les groupes hiérarchiques.
        // Mode flat (4.6) sinon : on valide la liste plate `peerGroup`.
        const wpgs = cond.weightedPeerGroups ?? [];
        if (wpgs.length > 0) {
          // Somme des weights = 100 % (tolérance 0.01)
          const totalWeight = wpgs.reduce((s, g) => s + (g.weight ?? 0), 0);
          if (Math.abs(totalWeight - 100) >= 0.01) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['conditions', idx, 'weightedPeerGroups'],
              message: `La somme des poids des groupes doit valoir 100 % (actuellement ${totalWeight.toFixed(2)} %)`,
            });
          }
          wpgs.forEach((group, gIdx) => {
            if (!group.name || group.name.trim().length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['conditions', idx, 'weightedPeerGroups', gIdx, 'name'],
                message: 'Nom du groupe requis',
              });
            }
            if (!group.peers || group.peers.length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['conditions', idx, 'weightedPeerGroups', gIdx, 'peers'],
                message: 'Au moins un peer requis dans ce groupe',
              });
            }
            (group.peers ?? []).forEach((peer, peerIdx) => {
              if (!peer.ticker || peer.ticker.trim().length === 0) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['conditions', idx, 'weightedPeerGroups', gIdx, 'peers', peerIdx, 'ticker'],
                  message: 'Ticker requis',
                });
              }
              if (!peer.name || peer.name.trim().length === 0) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['conditions', idx, 'weightedPeerGroups', gIdx, 'peers', peerIdx, 'name'],
                  message: 'Nom requis',
                });
              }
            });
          });
        } else {
          // Mode flat
          const peers = cond.peerGroup ?? [];
          if (peers.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['conditions', idx, 'peerGroup'],
              message: 'Au moins un peer est requis pour TSR relatif vs panel',
            });
          }
          peers.forEach((peer, peerIdx) => {
            if (!peer.ticker || peer.ticker.trim().length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['conditions', idx, 'peerGroup', peerIdx, 'ticker'],
                message: 'Ticker requis',
              });
            }
            if (!peer.name || peer.name.trim().length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['conditions', idx, 'peerGroup', peerIdx, 'name'],
                message: 'Nom requis',
              });
            }
          });
        }
      }

      // ---- Step 4.8 — ReferencePriceConfig V5 ----
      // Pour toute condition MARKET, les méthodes de prix Start et End
      // sont obligatoires. Selon la méthode :
      //   FIXED   → fixedPrice obligatoire (positif, ≤ 1 000 000)
      //   AVERAGE → averagingDays obligatoire (entier 1–90)
      //   SPOT    → pas de champ supplémentaire
      validateReferencePrice(
        ctx,
        idx,
        'start',
        cond.startPriceMethod,
        cond.startFixedPrice,
        cond.startAveragingDays,
      );
      validateReferencePrice(
        ctx,
        idx,
        'end',
        cond.endPriceMethod,
        cond.endFixedPrice,
        cond.endAveragingDays,
      );
    });

    // ---- Step 4.9 + 4.10 — AcquisitionScale (CURVE et TIERS) ----
    // Validé pour TOUTES les conditions (MARKET + NON_MARKET) où une
    // échelle est définie ; SERVICE n'expose pas le composant côté UI.
    data.conditions.forEach((cond, idx) => {
      const scale = cond.acquisitionScale;
      if (!scale) return;

      if (scale.mode === 'CURVE') {
        if (scale.points.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['conditions', idx, 'acquisitionScale', 'points'],
            message: 'Au moins 2 points requis pour définir une courbe',
          });
        }
        for (let i = 1; i < scale.points.length; i++) {
          const prev = scale.points[i - 1];
          const curr = scale.points[i];
          if (prev && curr && curr.threshold <= prev.threshold) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['conditions', idx, 'acquisitionScale', 'points', i, 'threshold'],
              message: 'Le threshold doit être strictement supérieur au précédent',
            });
          }
        }
      }

      if (scale.mode === 'TIERS') {
        if (scale.tiers.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['conditions', idx, 'acquisitionScale', 'tiers'],
            message: 'Au moins 2 paliers requis pour définir une échelle TIERS',
          });
        }
        scale.tiers.forEach((tier, tIdx) => {
          if (tier.min >= tier.max) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['conditions', idx, 'acquisitionScale', 'tiers', tIdx, 'max'],
              message: 'Le max doit être strictement supérieur au min',
            });
          }
        });
        // Vérifier que les tiers sont triés par `min` croissant et non
        // chevauchants. On compare tier[i].min ≥ tier[i-1].max.
        for (let i = 1; i < scale.tiers.length; i++) {
          const prev = scale.tiers[i - 1];
          const curr = scale.tiers[i];
          if (prev && curr && curr.min < prev.max) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['conditions', idx, 'acquisitionScale', 'tiers', i, 'min'],
              message: 'Les paliers ne doivent pas se chevaucher (min ≥ max du palier précédent)',
            });
          }
        }
      }
    });
  }

  // ---- Step 6 — Valuation ----
  if (
    data.dividendInputMode === 'amount' &&
    (data.dividendAmount == null || data.dividendAmount < 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dividendAmount'],
      message: 'Montant de dividende requis (≥ 0) en mode « amount »',
    });
  }
  if (data.underlyingModel === 'HESTON') {
    const hestonFields: Array<
      ['hestonV0' | 'hestonKappa' | 'hestonTheta' | 'hestonXi' | 'hestonRho', string]
    > = [
      ['hestonV0', 'V₀ (variance initiale)'],
      ['hestonKappa', 'Kappa (vitesse de retour à la moyenne)'],
      ['hestonTheta', 'Theta (variance long-terme)'],
      ['hestonXi', 'Xi (vol-of-vol)'],
      ['hestonRho', 'Rho (corrélation prix/vol)'],
    ];
    for (const [field, label] of hestonFields) {
      if (data[field] == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${label} requis pour le modèle HESTON`,
        });
      }
    }
  }
  if (data.underlyingModel === 'JUMP_DIFFUSION') {
    const jumpFields: Array<['jumpLambda' | 'jumpMuJ' | 'jumpSigmaJ', string]> = [
      ['jumpLambda', 'Lambda (intensité des sauts)'],
      ['jumpMuJ', 'Mu_J (taille moyenne des sauts)'],
      ['jumpSigmaJ', 'Sigma_J (volatilité des sauts)'],
    ];
    for (const [field, label] of jumpFields) {
      if (data[field] == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${label} requis pour le modèle JUMP_DIFFUSION`,
        });
      }
    }
  }

  // ---- Step 5 — Leavers ----
  // Validation cross-field : si le treatment est `accelerate`, on attend
  // `accelerationMonths > 0` (sinon c'est `full_accelerate`). Pour les
  // autres traitements, accelerationMonths n'a pas de sens.
  // exerciseWindowDays : optionnel sauf cohérence (≥ 0 déjà validé par Zod).
  if (data.leaverRules) {
    for (const [leaverType, rule] of Object.entries(data.leaverRules)) {
      if (!rule) continue;
      if (rule.treatment === 'accelerate') {
        if (rule.accelerationMonths == null || rule.accelerationMonths <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['leaverRules', leaverType, 'accelerationMonths'],
            message: 'Mois d’accélération requis (> 0) pour ce traitement',
          });
        }
      }
      if (
        (rule.treatment === 'forfeit_all' ||
          rule.treatment === 'keep_vested' ||
          rule.treatment === 'pro_rata' ||
          rule.treatment === 'full_accelerate') &&
        rule.accelerationMonths != null &&
        rule.accelerationMonths > 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['leaverRules', leaverType, 'accelerationMonths'],
          message: 'Mois d’accélération non applicables à ce traitement',
        });
      }
    }
  }
});

function validateReferencePrice(
  ctx: z.RefinementCtx,
  conditionIdx: number,
  side: 'start' | 'end',
  method: ReferencePriceMethod | undefined,
  fixedPrice: string | undefined,
  averagingDays: string | undefined,
) {
  const sideLabel = side === 'start' ? 'début' : 'fin';
  const methodPath = side === 'start' ? 'startPriceMethod' : 'endPriceMethod';
  const fixedPath = side === 'start' ? 'startFixedPrice' : 'endFixedPrice';
  const daysPath = side === 'start' ? 'startAveragingDays' : 'endAveragingDays';

  if (!method) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['conditions', conditionIdx, methodPath],
      message: `Méthode de prix de référence ${sideLabel} requise`,
    });
    return;
  }
  if (method === 'FIXED') {
    const trimmed = (fixedPrice ?? '').trim();
    if (trimmed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditions', conditionIdx, fixedPath],
        message: 'Prix fixé requis',
      });
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditions', conditionIdx, fixedPath],
        message: 'Prix fixé invalide (nombre > 0)',
      });
    } else if (value > PLAN_WIZARD_LIMITS.MAX_REFERENCE_PRICE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditions', conditionIdx, fixedPath],
        message: `Prix fixé trop élevé (max ${PLAN_WIZARD_LIMITS.MAX_REFERENCE_PRICE.toLocaleString('fr-FR')})`,
      });
    }
  }
  if (method === 'AVERAGE') {
    const trimmed = (averagingDays ?? '').trim();
    if (trimmed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditions', conditionIdx, daysPath],
        message: 'Nombre de jours requis',
      });
      return;
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditions', conditionIdx, daysPath],
        message: 'Doit être un entier',
      });
    } else if (
      value < PLAN_WIZARD_LIMITS.MIN_AVERAGING_DAYS ||
      value > PLAN_WIZARD_LIMITS.MAX_AVERAGING_DAYS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditions', conditionIdx, daysPath],
        message: `Doit être entre ${PLAN_WIZARD_LIMITS.MIN_AVERAGING_DAYS} et ${PLAN_WIZARD_LIMITS.MAX_AVERAGING_DAYS} jours`,
      });
    }
  }
}

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

// ---------------------------------------------------------------------------
// Step 4 — Métadonnées UI : conditions de performance
// ---------------------------------------------------------------------------

/**
 * Unité par défaut suggérée selon la métrique non-marché. Pré-remplit
 * `targetUnit` quand l'utilisateur sélectionne une métrique. L'utilisateur
 * peut écraser librement (champ texte). USERS et CUSTOM ont une chaîne
 * vide : on laisse à l'utilisateur le soin de saisir l'unité (utilisateurs,
 * dossiers traités, équipes formées…).
 */
/**
 * Unité par défaut suggérée selon la métrique marché. SHARE_PRICE → €
 * (prix absolu en euros) ; TSR_ABS / TSR_REL_INDEX / TSR_REL_PEERS → %
 * (taux de rendement exprimé en pourcentage).
 */
export const MARKET_METRIC_DEFAULT_UNITS: Record<MarketMetric, string> = {
  SHARE_PRICE: '€',
  TSR_ABS: '%',
  TSR_REL_INDEX: '%',
  TSR_REL_PEERS: '%',
};

export const MARKET_METRIC_UI_LABELS: Record<MarketMetric, string> = {
  SHARE_PRICE: 'Cours de bourse (prix absolu)',
  TSR_ABS: 'TSR absolu',
  TSR_REL_INDEX: 'TSR relatif vs indice',
  TSR_REL_PEERS: 'TSR relatif vs panel',
};

/**
 * Sous-ensemble de `MarketMetric` livré jusqu'au commit courant. Mis à
 * jour à chaque commit qui ouvre un nouveau sous-type :
 *  - 4.4 : SHARE_PRICE, TSR_ABS
 *  - 4.5 : + TSR_REL_INDEX (avec YahooIndexSearch)
 *  - 4.6 : + TSR_REL_PEERS (avec PeerGroupEditor flat)
 *  - 4.7 : + WeightedPeerGroupsEditor (extension de TSR_REL_PEERS)
 */
export const MARKET_METRICS_AVAILABLE: ReadonlySet<MarketMetric> = new Set([
  'SHARE_PRICE',
  'TSR_ABS',
  'TSR_REL_INDEX',
  'TSR_REL_PEERS',
]);

/** Référence de compatibilité pour les imports antérieurs (à supprimer
 *  quand toutes les branches MARKET seront livrées). */
export const MARKET_METRICS_AVAILABLE_4_4 = MARKET_METRICS_AVAILABLE;

export const NON_MARKET_METRIC_DEFAULT_UNITS: Record<NonMarketMetric, string> = {
  EBITDA: '€',
  REVENUE: '€',
  NET_INCOME: '€',
  USERS: '',
  ARR: '€',
  NPS: 'pts',
  ESG_SCORE: 'pts',
  CARBON: 'tCO2',
  CUSTOM: '',
};

export const NON_MARKET_METRIC_UI_LABELS: Record<NonMarketMetric, string> = {
  EBITDA: 'EBITDA',
  REVENUE: 'Chiffre d’affaires',
  NET_INCOME: 'Résultat net',
  USERS: 'Utilisateurs',
  ARR: 'ARR (revenu récurrent)',
  NPS: 'NPS',
  ESG_SCORE: 'Score ESG',
  CARBON: 'Empreinte carbone',
  CUSTOM: 'Métrique libre',
};

export const COMPARISON_OPERATOR_UI_LABELS: Record<ComparisonOperator, string> = {
  '>=': '≥ (supérieur ou égal)',
  '<=': '≤ (inférieur ou égal)',
  '>': '> (strictement supérieur)',
  '<': '< (strictement inférieur)',
  '=': '= (égal à)',
  '!=': '≠ (différent de)',
};

export const CONDITION_CATEGORY_UI_LABELS: Record<ConditionCategory, string> = {
  FINANCIAL: 'Financière',
  PRODUCT: 'Produit',
  OPERATIONAL: 'Opérationnelle',
  STRATEGIC: 'Stratégique',
  ESG: 'ESG',
};

export const CONDITION_TYPE_UI_LABELS: Record<ConditionType, string> = {
  MARKET: 'Marché',
  NON_MARKET: 'Non-marché',
  SERVICE: 'Service (présence)',
};

/**
 * Bornes des seuils min/max d'une condition non-marché. Le seuil min
 * représente le pourcentage de la cible à partir duquel le scoring
 * commence (ex : 50 % → on commence à acquérir à mi-cible) ; le seuil
 * max représente le pourcentage à partir duquel on est plafonné (ex :
 * 120 % → tout dépassement au-delà n'augmente plus le scoring).
 */
export const PERFORMANCE_THRESHOLD_LIMITS = {
  MIN_PCT_LOWER: 0,
  MIN_PCT_UPPER: 100,
  MAX_PCT_LOWER: 0,
  MAX_PCT_UPPER: 200,
} as const;

/**
 * Labels FR pour les méthodes de prix de référence (commit 4.8).
 * SPOT     = cours instantané à la date
 * FIXED    = prix fixé manuellement (override)
 * AVERAGE  = moyenne sur N jours précédant la date
 */
export const REFERENCE_PRICE_METHOD_UI_LABELS: Record<ReferencePriceMethod, string> = {
  SPOT: 'Cours instantané (à la date)',
  FIXED: 'Prix fixé manuellement',
  AVERAGE: 'Moyenne sur N jours précédents',
};

/**
 * Champs spécifiques à chaque type de condition. Sert de source de vérité
 * pour purger les champs orphelins au switch de type (cf.
 * {@link cleanConditionForType}). Les champs partagés (id, name,
 * conditionType, category, weight, enablePartialScoring,
 * performanceStartDate, performanceEndDate, acquisitionScale) ne sont
 * jamais nullifiés.
 */
const CONDITION_FIELDS_BY_TYPE: Record<
  ConditionType,
  ReadonlyArray<keyof PerformanceConditionInput>
> = {
  NON_MARKET: [
    'metric',
    'comparisonOperator',
    'targetValue',
    'targetUnit',
    'thresholdMin',
    'thresholdMax',
  ],
  MARKET: [
    'marketMetricType',
    'comparisonOperator',
    'targetValue',
    'targetUnit',
    'thresholdMin',
    'thresholdMax',
    'referenceIndex',
    'referenceIndexDisplayName',
    'peerGroup',
    'weightedPeerGroups',
    'comparisonMethod',
    'startPriceMethod',
    'startFixedPrice',
    'startAveragingDays',
    'endPriceMethod',
    'endFixedPrice',
    'endAveragingDays',
    'measurementPeriodYears',
  ],
  SERVICE: [],
};

// ---------------------------------------------------------------------------
// Step 6 — Métadonnées UI : valuation Monte Carlo
// ---------------------------------------------------------------------------

export const CURRENCY_UI_LABELS: Record<WizardCurrency, string> = {
  EUR: 'Euro (EUR)',
  USD: 'Dollar US (USD)',
  GBP: 'Livre Sterling (GBP)',
  CHF: 'Franc Suisse (CHF)',
};

export const VOL_METHOD_UI_LABELS: Record<VolMethod, string> = {
  MANUAL: 'Saisie manuelle',
  HISTORICAL: 'Historique (lookback)',
  IMPLIED: 'Implicite (options)',
  MIXED: 'Mixte (historique + implicite)',
};

export const MODEL_CHOICE_UI_LABELS: Record<ModelChoice, string> = {
  auto: 'Auto (le moteur décide)',
  black_scholes: 'Black-Scholes (formule fermée)',
  monte_carlo: 'Monte Carlo (simulation)',
};

export const UNDERLYING_MODEL_UI_LABELS: Record<UnderlyingModel, string> = {
  GBM: 'GBM — Mouvement brownien géométrique (standard)',
  HESTON: 'HESTON — Volatilité stochastique',
  JUMP_DIFFUSION: 'JUMP_DIFFUSION — Sauts de Merton',
};

export const STEPS_PER_YEAR_UI_LABELS: Record<12 | 52 | 252, string> = {
  12: 'Mensuel (12 / an)',
  52: 'Hebdomadaire (52 / an)',
  252: 'Quotidien (252 jours ouvrés / an)',
};

// ---------------------------------------------------------------------------
// Step 5 — Métadonnées UI : leavers
// ---------------------------------------------------------------------------

export const LEAVER_TYPE_UI_LABELS: Record<WizardLeaverType, string> = {
  resignation: 'Démission',
  termination_cause: 'Licenciement pour faute',
  termination_no_cause: 'Licenciement sans faute (économique)',
  death: 'Décès',
  retirement: 'Départ à la retraite',
  company_sale: 'Cession de la société (change-of-control)',
  mutual_agreement: 'Rupture conventionnelle',
  end_of_contract: 'Fin de contrat (CDD, mission)',
};

/**
 * Description courte du sens "business" de chaque leaver type, affichée
 * sous le titre de chaque carte pour aider à choisir le traitement.
 */
export const LEAVER_TYPE_UI_DESCRIPTIONS: Record<WizardLeaverType, string> = {
  resignation: 'Le bénéficiaire quitte volontairement l’entreprise.',
  termination_cause: 'Faute grave ou lourde — généralement perte totale.',
  termination_no_cause: 'Initiative employeur sans faute (motif économique, etc.).',
  death: 'Décès du bénéficiaire — droits transférés aux ayants droit.',
  retirement: 'Départ légal à la retraite.',
  company_sale: 'Vente / fusion / IPO — souvent accélération automatique.',
  mutual_agreement: 'Rupture conventionnelle négociée.',
  end_of_contract: 'Fin naturelle de CDD / contrat de mission.',
};

export const LEAVER_TREATMENT_UI_LABELS: Record<WizardLeaverTreatment, string> = {
  forfeit_all: 'Forfait total — tous les droits sont perdus',
  keep_vested: 'Garde les droits acquis (vested) ; perte des non-acquis',
  pro_rata: 'Pro-rata temporis — calcul au jour de départ',
  accelerate: 'Accélération partielle (X mois supplémentaires)',
  full_accelerate: 'Accélération totale — 100 % des droits acquis',
};

/**
 * Heuristique : pour quels `planType` doit-on demander une fenêtre
 * d'exercice (`exerciseWindowDays`) après le départ ? Les plans à
 * exercice ont besoin de cette fenêtre pour que le bénéficiaire puisse
 * encore exercer ses droits (lever ses options) après son départ.
 */
export const PLAN_TYPES_REQUIRING_EXERCISE_WINDOW: ReadonlySet<PlanWizardType> = new Set([
  'BSPCE',
  'STOCK_OPTION',
  'BSA',
  'SAR',
]);

/**
 * Champs partagés entre NON_MARKET et MARKET (mêmes noms de champs) mais
 * dont la sémantique diffère (% TSR vs € EBITDA, opérateurs valides
 * différents…). À purger explicitement au switch UI entre ces deux
 * types — sinon ils survivraient avec une valeur orpheline du type
 * précédent (ex : `targetUnit: '%'` qui reste après un switch
 * MARKET TSR_ABS → NON_MARKET).
 *
 * Exporté pour réutilisation côté UI (cf. ConditionEditor.tsx).
 */
export const SHARED_PER_TYPE_CONDITION_FIELDS: ReadonlyArray<keyof PerformanceConditionInput> = [
  'comparisonOperator',
  'targetValue',
  'targetUnit',
  'thresholdMin',
  'thresholdMax',
];

/**
 * Retourne une copie de la condition avec tous les champs étrangers au
 * `nextType` nullifiés. Utilisé quand l'utilisateur change le type d'une
 * condition existante : on évite de garder des données orphelines (un
 * `marketMetricType` zombie sur une condition NON_MARKET, par exemple)
 * qui contamineraient les Server Actions et les exports DocuSign / Yousign.
 *
 * Note : pour les champs partagés entre NON_MARKET et MARKET dont la
 * sémantique diffère (`comparisonOperator`, `targetValue`, `targetUnit`,
 * etc.), on les nullifie aussi automatiquement quand le type d'origine
 * de la condition est différent du `nextType` (= vrai switch UI). Si
 * `condition.conditionType === nextType` (appel de "nettoyage" côté
 * Server Action sans switch), ces champs sont préservés.
 *
 * Pure function : ne mute pas l'input.
 */
export function cleanConditionForType(
  condition: PerformanceConditionInput,
  nextType: ConditionType,
): PerformanceConditionInput {
  const isSwitch = condition.conditionType !== nextType;
  // Union de tous les champs spécifiques à un type quelconque
  const allTypeSpecificFields = new Set<keyof PerformanceConditionInput>([
    ...CONDITION_FIELDS_BY_TYPE.NON_MARKET,
    ...CONDITION_FIELDS_BY_TYPE.MARKET,
    ...CONDITION_FIELDS_BY_TYPE.SERVICE,
  ]);
  // Champs autorisés pour le nouveau type
  const allowed = new Set<keyof PerformanceConditionInput>(CONDITION_FIELDS_BY_TYPE[nextType]);
  // Copie + nullifie tout ce qui est spécifique à un autre type
  const next: PerformanceConditionInput = { ...condition, conditionType: nextType };
  for (const field of allTypeSpecificFields) {
    if (!allowed.has(field)) {
      (next as Record<string, unknown>)[field] = undefined;
    }
  }
  // Sur un VRAI switch de type, purge aussi les champs sémantiquement
  // type-spécifiques (cf. SHARED_PER_TYPE_CONDITION_FIELDS).
  if (isSwitch) {
    for (const field of SHARED_PER_TYPE_CONDITION_FIELDS) {
      (next as Record<string, unknown>)[field] = undefined;
    }
  }
  return next;
}
