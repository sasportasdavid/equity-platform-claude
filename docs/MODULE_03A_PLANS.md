# MODULE 3a — PLANS (CRUD + WIZARD)

> **Projet :** Equity Platform
> **Version :** 1.0
> **Date :** Avril 2026
> **Prérequis :** Modules 1 et 2 terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter **toute la couche de gestion des plans equity** : création via wizard 7 étapes, listing, édition, archivage, intégration avec le moteur de valorisation Python existant, et gestion du cycle de vie d'un plan.

Les plans sont la **structure** ; les awards (Module 3b) seront les **attributions individuelles** émises selon ces plans.

### 0.2 Périmètre exact

**Inclus dans ce module** :

- Wizard 7 étapes complet (réimplémentation du wizard Lovable existant en Next.js)
- CRUD Plans (création, lecture, modification, archivage)
- Listing avec filtres et recherche
- Page détail plan avec onglets (Synthesis, Snapshot, Performance, IFRS2, Hypotheses, Leavers, Versions, Grants)
- Wizard persistant (auto-save brouillon)
- Sociétés (Companies) — entité parente des plans
- Hypothèses de marché (hypothesis_sets, volatility_schemes, simulation_configs)
- Conditions de performance (peers, indices, payout curves)
- Vesting schedules et tranches
- Règles de départ (early termination)
- Intégration moteur Python (proxy `compute-valuation`)
- Calendrier IFRS 2 généré
- Versioning des plans
- Lock d'un plan (verrou si awards émis — préparation Module 3b)

**Exclus (modules ultérieurs)** :

- Awards (Module 3b)
- Bulk import (Module 3b)
- Documents/templates (Module 6)
- Signature électronique (Module 6)
- Cap table (Module 10)
- Portail bénéficiaire (Module 8)

### 0.3 Référence

Ce module **réimplémente** le wizard existant documenté dans la spec V1.0 du 22/02/2026 (les 7 étapes, schéma Zod, règles métier). La spec originale fait foi pour les détails fins. Ce document apporte :

- La structure Next.js (Server Components, Server Actions)
- Les Server Actions avec validation
- L'intégration au moteur Python existant
- Le versioning des plans
- L'audit trail

### 0.4 Dépendances

- Tables créées en Module 1 : `plans`, `companies`, `vesting_schedules`, `vesting_tranches`, `performance_conditions`, `early_termination_rules`, `hypothesis_sets`, `volatility_schemes`, `simulation_configs`, `valuation_runs`, `valuation_results`
- Module 2 : RBAC, permissions `plans.*`, `valuations.*`, `companies.*`
- Variables d'environnement : `QUANT_ENGINE_URL`, `QUANT_ENGINE_API_KEY`

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
┌──────────────────────────────────────────────────────────────────────┐
│                        WIZARD 7 ÉTAPES                                │
│  Step 1: Type → Step 2: Info → Step 3: Vesting → Step 4: Performance  │
│  → Step 5: Leavers → Step 6: Valuation → Step 7: Review               │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ submit
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Server Action: createPlan                            │
│  Insertion en cascade : plan → vesting → conditions → leavers →      │
│  hypothesis → volatility → simulation → audit                        │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   PLAN DÉTAIL (8 onglets)                             │
│  Visualisation, valorisation, IFRS 2, etc.                           │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ "Lancer valorisation"
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│         Server Action: runValuation → Python Engine (Fly.io)          │
│  Build payload → POST /compute/multi-tranche → save valuation_run    │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Routes Next.js

```
# Dashboard (admin/RH)
/dashboard/plans                          # Liste des plans
/dashboard/plans/new                      # Wizard création (7 étapes)
/dashboard/plans/[id]                     # Détail plan (8 onglets)
/dashboard/plans/[id]/edit                # Édition wizard (si pas locked)
/dashboard/plans/[id]/valuations          # Historique valos
/dashboard/plans/[id]/valuations/[runId]  # Détail d'une valo
/dashboard/plans/[id]/ifrs2               # Calendrier IFRS 2
/dashboard/plans/[id]/versions            # Historique versions du plan
/dashboard/companies                      # Liste des sociétés
/dashboard/companies/[id]                 # Détail société + plans associés
```

### 1.3 Routes API & Server Actions

```
# Server Actions (mutations)
src/server/actions/plans.ts:
  - createPlan(input)              # Crée plan + entités liées
  - updatePlan(id, input)          # Update si !locked
  - duplicatePlan(id)              # Crée nouvelle version
  - archivePlan(id)                # Soft delete
  - lockPlan(id)                   # Verrouille (post-1er award)
  - saveDraftPlan(input)           # Auto-save wizard brouillon

src/server/actions/companies.ts:
  - createCompany(input)
  - updateCompany(id, input)
  - assessBspceEligibility(id)     # Évalue éligibilité BSPCE

src/server/actions/valuations.ts:
  - runValuation(planId, hypothesisSetId)
  - cancelValuation(runId)

src/server/actions/market-data.ts:
  - searchTicker(query)            # Yahoo search
  - searchYahooIndex(query)        # Indices Yahoo
  - fetchMarketData(ticker, lookbackDays, asOfDate)
  - fetchPeerGroupData(companyTicker, peers, lookbackDays)
  - fetchHistoricalAverage(ticker, startDate, endDate)

# Server Queries (Server Components)
src/server/queries/plans.ts:
  - listPlans(filters)
  - getPlanDetails(id)
  - getPlanValuationHistory(id)

# Routes API (REST, pour les exceptions)
/api/plans/[id]/export-pdf        # Export PDF (Edge Function)
/api/webhooks/quant-engine        # Webhook Python engine (notifications de fin)
```

---

## 2. WIZARD 7 ÉTAPES — IMPLÉMENTATION NEXT.JS

### 2.1 Structure du wizard

Le wizard est un **Client Component** stateful (utilise React Hook Form + Zustand pour le state global). Il est monté à `/dashboard/plans/new` (création) et `/dashboard/plans/[id]/edit` (édition).

```
src/components/plans/wizard/
├── PlanWizard.tsx                    # Container principal
├── WizardSidebar.tsx                 # Liste des étapes (gauche)
├── WizardFooter.tsx                  # Boutons Précédent / Suivant
├── steps/
│   ├── Step1PlanType.tsx
│   ├── Step2GeneralInfo.tsx
│   ├── Step3Vesting.tsx
│   ├── Step4Performance.tsx
│   │   ├── ConditionEditor.tsx
│   │   ├── PeerGroupEditor.tsx
│   │   ├── WeightedPeerGroupsEditor.tsx
│   │   ├── YahooIndexSearch.tsx
│   │   ├── AcquisitionScaleEditor.tsx
│   │   └── ReferencePriceConfig.tsx
│   ├── Step5Leavers.tsx
│   ├── Step6Valuation.tsx
│   │   ├── MarketDataPanel.tsx
│   │   └── MonteCarloParams.tsx
│   └── Step7Review.tsx
├── shared/
│   ├── PlanTypeCard.tsx
│   ├── TickerSearchCombobox.tsx
│   ├── WeightValidationBanner.tsx
│   └── FieldError.tsx
└── hooks/
    ├── useWizardForm.ts              # React Hook Form + Zod
    ├── useWizardPersistence.ts       # Auto-save localStorage + DB draft
    └── useWizardNavigation.ts        # Navigation entre étapes
```

### 2.2 Schéma Zod centralisé

Créer dans `packages/shared/src/schemas/planWizard.ts` (réutilisable côté server). Reprendre **intégralement** le schéma de la spec wizard V1.0 (section 12).

Exemple de structure :

```typescript
// packages/shared/src/schemas/planWizard.ts
import { z } from 'zod';

export const LIMITS = {
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

export const VestingTypeEnum = z.enum(['single', 'tranches', 'cliff_linear']);
export const FrequencyEnum = z.enum(['monthly', 'quarterly', 'annually']);
export const ConditionTypeEnum = z.enum(['MARKET', 'NON_MARKET', 'SERVICE']);
export const CategoryEnum = z.enum(['FINANCIAL', 'PRODUCT', 'OPERATIONAL', 'STRATEGIC', 'ESG']);
export const MarketMetricEnum = z.enum([
  'SHARE_PRICE',
  'TSR_ABS',
  'TSR_REL_INDEX',
  'TSR_REL_PEERS',
]);
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
export const ComparisonOperatorEnum = z.enum(['>=', '<=', '>', '<', '=', '!=']);
export const CombinationTypeEnum = z.enum(['AND', 'OR', 'WEIGHTED']);
export const EvaluationMomentEnum = z.enum(['END', 'CONTINUOUS', 'ANNUAL']);
export const FailureActionEnum = z.enum(['FORFEIT', 'PARTIAL', 'DEFER']);
export const CurrencyEnum = z.enum(['EUR', 'USD', 'GBP', 'CHF']);
export const VolMethodEnum = z.enum(['MANUAL', 'HISTORICAL', 'IMPLIED', 'MIXED']);
export const ModelChoiceEnum = z.enum(['auto', 'black_scholes', 'monte_carlo']);
export const UnderlyingModelEnum = z.enum(['GBM', 'HESTON', 'JUMP_DIFFUSION']);
export const ReferencePriceMethodEnum = z.enum(['SPOT', 'FIXED', 'AVERAGE']);
export const ComparisonMethodEnum = z.enum(['WEIGHTED_AVERAGE', 'MEDIAN', 'RANKING']);
export const AcquisitionScaleModeEnum = z.enum(['TIERS', 'CURVE']);

// Step 1 : Plan Type
export const step1Schema = z.object({
  planType: PlanTypeEnum,
});

// Step 2 : General Info
export const step2Schema = z.object({
  name: z.string().trim().min(LIMITS.MIN_NAME_LENGTH).max(LIMITS.MAX_NAME_LENGTH),
  boardDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grantDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  poolSize: z.number().int().min(LIMITS.MIN_POOL_SIZE).max(LIMITS.MAX_POOL_SIZE),
  exercisePrice: z.number().min(0).optional(),
  description: z.string().max(LIMITS.MAX_DESCRIPTION_LENGTH).optional(),
  shareholderMeetingDate: z.string().optional(),
  shareholderAuthorizationExpiresAt: z.string().optional(),
});

// Step 3 : Vesting
export const vestingTrancheSchema = z.object({
  vestingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  percentage: z.number().min(0).max(100),
});

export const step3Schema = z.discriminatedUnion('vestingType', [
  z.object({
    vestingType: z.literal('single'),
    singleVestingDate: z.string(),
  }),
  z.object({
    vestingType: z.literal('tranches'),
    vestingTranches: z
      .array(vestingTrancheSchema)
      .min(1)
      .max(LIMITS.MAX_VESTING_TRANCHES)
      .refine((tranches) => Math.abs(tranches.reduce((s, t) => s + t.percentage, 0) - 100) < 0.01, {
        message: 'Total des pourcentages doit égaler 100%',
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

// Step 4 : Performance (le plus complexe)
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

export const peerGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  weight: z.number().min(0).max(100),
  peers: z.array(peerCompanySchema).min(1),
});

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
    points: z.array(acquisitionCurvePointSchema).min(2).max(LIMITS.MAX_CURVE_POINTS),
  }),
  z.object({
    mode: z.literal('TIERS'),
    tiers: z.array(acquisitionTierSchema).min(2).max(10),
  }),
]);

export const performanceConditionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    conditionType: ConditionTypeEnum,
    category: CategoryEnum,
    weight: z.number().min(0).max(100),
    enablePartialScoring: z.boolean().default(true),
    performanceStartDate: z.string().optional(),
    performanceEndDate: z.string().optional(),
    // Non-market
    metric: NonMarketMetricEnum.optional(),
    targetValue: z.string().max(LIMITS.MAX_TARGET_VALUE_LENGTH).optional(),
    targetUnit: z.string().optional(),
    comparisonOperator: ComparisonOperatorEnum.optional(),
    thresholdMin: z.string().optional(),
    thresholdMax: z.string().optional(),
    // Market
    marketMetricType: MarketMetricEnum.optional(),
    referenceIndex: z
      .string()
      .regex(/^[A-Z0-9\s.-]{1,30}$/)
      .optional(),
    referenceIndexDisplayName: z.string().optional(),
    peerGroup: z.array(peerCompanySchema).max(LIMITS.MAX_PEER_GROUP).optional(),
    weightedPeerGroups: z.array(peerGroupSchema).optional(),
    comparisonMethod: ComparisonMethodEnum.optional(),
    // V5 Reference Price
    startPriceMethod: ReferencePriceMethodEnum.optional(),
    startFixedPrice: z.string().optional(),
    startAveragingDays: z.string().optional(),
    endPriceMethod: ReferencePriceMethodEnum.optional(),
    endFixedPrice: z.string().optional(),
    endAveragingDays: z.string().optional(),
    // Auto-calculated
    measurementPeriodYears: z.string().optional(),
    // Acquisition scale
    acquisitionScale: acquisitionScaleSchema.optional(),
  })
  .refine(
    (cond) => {
      // MARKET → dates obligatoires
      if (cond.conditionType === 'MARKET') {
        if (!cond.performanceStartDate || !cond.performanceEndDate) return false;
      }
      return true;
    },
    { message: 'Conditions de marché : dates de mesure obligatoires' },
  );

export const step4Schema = z
  .object({
    hasPerformanceConditions: z.boolean(),
    combinationType: CombinationTypeEnum.optional(),
    evaluationMoment: EvaluationMomentEnum.optional(),
    failureAction: FailureActionEnum.optional(),
    conditions: z.array(performanceConditionSchema).max(LIMITS.MAX_CONDITIONS).optional(),
  })
  .refine(
    (data) => {
      // Si WEIGHTED, somme des poids = 100
      if (data.combinationType === 'WEIGHTED' && data.conditions) {
        const total = data.conditions.reduce((s, c) => s + c.weight, 0);
        return Math.abs(total - 100) < 0.01;
      }
      return true;
    },
    { message: 'Mode WEIGHTED : somme des poids doit être 100%' },
  );

// Step 5 : Leavers (8 types fixes)
export const leaverRulesSchema = z.record(
  z.enum([
    'resignation',
    'termination_cause',
    'termination_no_cause',
    'death',
    'retirement',
    'company_sale',
    'mutual_agreement',
    'end_of_contract',
  ]),
  z.object({
    treatment: z.enum(['forfeit_all', 'keep_vested', 'pro_rata', 'accelerate', 'full_accelerate']),
    accelerationMonths: z.number().int().min(0).optional(),
    exerciseWindowDays: z.number().int().min(0).optional(),
  }),
);

export const step5Schema = z.object({
  leaverRules: leaverRulesSchema,
});

// Step 6 : Valuation
export const step6Schema = z.object({
  ticker: z.string().optional(),
  companyTicker: z.string().optional(),
  underlyingPrice: z.number().min(0.01),
  currency: CurrencyEnum.default('EUR'),
  volMethod: VolMethodEnum.default('MANUAL'),
  volatility: z.number().min(LIMITS.MIN_VOLATILITY).max(LIMITS.MAX_VOLATILITY),
  volatilityPriceType: z.enum(['CLOSE', 'OPEN']).default('CLOSE'),
  volatilityWinsorizingPct: z.number().min(0).max(20).default(0),
  riskFreeRate: z.number().min(LIMITS.MIN_RISK_FREE_RATE).max(LIMITS.MAX_RISK_FREE_RATE),
  dividendYield: z.number().min(0).max(LIMITS.MAX_DIVIDEND_YIELD),
  dividendInputMode: z.enum(['percent', 'amount']).default('percent'),
  dividendAmount: z.number().optional(),
  lookbackDays: z.number().int().min(180).max(3650).default(1095),
  correlationOverride: z.number().min(-1).max(1).optional(),
  modelChoice: ModelChoiceEnum.default('auto'),
  underlyingModel: UnderlyingModelEnum.default('GBM'),
  numPaths: z.number().int().min(LIMITS.MIN_NUM_PATHS).max(LIMITS.MAX_NUM_PATHS).default(50000),
  stepsPerYear: z
    .number()
    .int()
    .refine((n) => [12, 52, 252].includes(n))
    .default(12),
  useAntithetic: z.boolean().default(true),
  timeHorizonYears: z.number().min(LIMITS.MIN_TIME_HORIZON).max(LIMITS.MAX_TIME_HORIZON),
  // Heston
  hestonV0: z.number().optional(),
  hestonKappa: z.number().optional(),
  hestonTheta: z.number().optional(),
  hestonXi: z.number().optional(),
  hestonRho: z.number().optional(),
  // Jump-Diffusion
  jumpLambda: z.number().optional(),
  jumpMuJ: z.number().optional(),
  jumpSigmaJ: z.number().optional(),
});

// Wizard complet
export const planWizardSchema = step1Schema
  .merge(step2Schema.partial())
  .merge(step3Schema.partial() as z.ZodType<any>)
  .merge(step4Schema.partial())
  .merge(step5Schema.partial())
  .merge(step6Schema.partial());

export type PlanWizardData = z.infer<typeof planWizardSchema>;
```

### 2.3 Container `PlanWizard.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { planWizardSchema, type PlanWizardData } from '@equity/shared/schemas/planWizard';
import { createPlan, saveDraftPlan } from '@/server/actions/plans';
import { useWizardPersistence } from './hooks/useWizardPersistence';
import { WizardSidebar } from './WizardSidebar';
import { WizardFooter } from './WizardFooter';
import { Step1PlanType } from './steps/Step1PlanType';
// ... autres imports steps

const STEPS = [
  { id: 'planType', label: 'Type de plan', component: Step1PlanType },
  { id: 'generalInfo', label: 'Informations générales', component: Step2GeneralInfo },
  { id: 'vesting', label: 'Vesting', component: Step3Vesting },
  { id: 'performance', label: 'Performance', component: Step4Performance },
  { id: 'leavers', label: 'Départs', component: Step5Leavers },
  { id: 'valuation', label: 'Valorisation', component: Step6Valuation },
  { id: 'review', label: 'Récapitulatif', component: Step7Review },
] as const;

const DEFAULT_VALUES: Partial<PlanWizardData> = {
  planType: 'BSPCE',
  boardDate: new Date().toISOString().split('T')[0],
  poolSize: 10000,
  vestingType: 'cliff_linear',
  cliffMonths: 12,
  cliffPercentage: 25,
  totalMonths: 48,
  frequency: 'monthly',
  hasPerformanceConditions: false,
  combinationType: 'AND',
  evaluationMoment: 'END',
  failureAction: 'FORFEIT',
  conditions: [],
  underlyingPrice: 100,
  currency: 'EUR',
  volMethod: 'MANUAL',
  volatility: 30,
  riskFreeRate: 3,
  dividendYield: 0,
  lookbackDays: 1095,
  modelChoice: 'auto',
  underlyingModel: 'GBM',
  numPaths: 50000,
  stepsPerYear: 12,
  useAntithetic: true,
  timeHorizonYears: 4,
};

export function PlanWizard({ planId }: { planId?: string }) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { loadDraft, saveDraft, clearDraft } = useWizardPersistence(planId);

  const methods = useForm<PlanWizardData>({
    resolver: zodResolver(planWizardSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });

  // Auto-save brouillon (debounce 500ms)
  useEffect(() => {
    const subscription = methods.watch((data) => {
      saveDraft(data as PlanWizardData);
    });
    return () => subscription.unsubscribe();
  }, [methods, saveDraft]);

  // Charger le brouillon au montage
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      methods.reset(draft);
      toast.info('Brouillon restauré');
    }
  }, []);

  const handleNext = async () => {
    // Valider l'étape courante avant de progresser
    const stepIsValid = await methods.trigger(getStepFieldsToValidate(currentStep));
    if (stepIsValid) {
      setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const data = methods.getValues();

    const result = await createPlan(data);

    if (result.error) {
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }

    clearDraft();
    toast.success('Plan créé avec succès');
    router.push(`/dashboard/plans/${result.data.id}`);
  };

  const StepComponent = STEPS[currentStep].component;

  return (
    <FormProvider {...methods}>
      <div className="grid min-h-screen grid-cols-12">
        <div className="bg-muted/30 col-span-3 border-r">
          <WizardSidebar
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={setCurrentStep}
            data={methods.watch()}
          />
        </div>
        <div className="col-span-9 flex flex-col">
          <div className="flex-1 overflow-y-auto p-8">
            <h2 className="mb-2 text-2xl font-bold">{STEPS[currentStep].label}</h2>
            <StepComponent />
          </div>
          <WizardFooter
            currentStep={currentStep}
            totalSteps={STEPS.length}
            onBack={handleBack}
            onNext={handleNext}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            canProceed={getCanProceed(currentStep, methods.watch())}
          />
        </div>
      </div>
    </FormProvider>
  );
}

function getStepFieldsToValidate(step: number): (keyof PlanWizardData)[] {
  const stepFields: Record<number, (keyof PlanWizardData)[]> = {
    0: ['planType'],
    1: ['name', 'boardDate', 'poolSize', 'exercisePrice'],
    2: [
      'vestingType',
      'vestingTranches',
      'cliffMonths',
      'cliffPercentage',
      'totalMonths',
      'frequency',
      'singleVestingDate',
    ],
    3: ['hasPerformanceConditions', 'conditions', 'combinationType'],
    4: ['leaverRules'],
    5: ['underlyingPrice', 'volatility', 'riskFreeRate'],
    6: [],
  };
  return stepFields[step] ?? [];
}

function getCanProceed(step: number, data: Partial<PlanWizardData>): boolean {
  // Implémenter selon spec wizard 1.0 section 9 (canProceed par étape)
  switch (step) {
    case 0:
      return !!data.planType;
    case 1:
      return !!(data.name && data.boardDate && data.poolSize);
    case 2: {
      if (data.vestingType === 'tranches') {
        const total = (data.vestingTranches ?? []).reduce((s, t) => s + t.percentage, 0);
        return Math.abs(total - 100) < 0.01;
      }
      return !!(data.vestingType && (data as any).totalMonths > 0);
    }
    case 3:
      return true;
    case 4:
      return true;
    case 5:
      return (data.underlyingPrice ?? 0) > 0;
    case 6: {
      // Validation combinée (vesting + S₀ + market conditions)
      const vestingValid =
        data.vestingType !== 'tranches' ||
        Math.abs((data.vestingTranches ?? []).reduce((s, t) => s + t.percentage, 0) - 100) < 0.01;
      const s0Valid = (data.underlyingPrice ?? 0) > 0;
      // Market conditions check (à implémenter)
      return vestingValid && s0Valid;
    }
    default:
      return false;
  }
}
```

### 2.4 Hook `useWizardPersistence`

```typescript
// src/components/plans/wizard/hooks/useWizardPersistence.ts
'use client';

import { useCallback, useRef } from 'react';
import { saveDraftPlan } from '@/server/actions/plans';
import { debounce } from 'lodash-es';
import type { PlanWizardData } from '@equity/shared/schemas/planWizard';

const STORAGE_KEY = 'plan-wizard-draft';

export function useWizardPersistence(planId?: string) {
  const debouncedSaveServerRef = useRef(
    debounce(async (data: PlanWizardData) => {
      // Save server-side draft (uniquement après step 2 quand on a un nom)
      if (data.name && data.planType) {
        await saveDraftPlan({ ...data, draftId: planId });
      }
    }, 2000),
  );

  const saveDraft = useCallback((data: PlanWizardData) => {
    // localStorage immédiat
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
    // Server-side debounced
    debouncedSaveServerRef.current(data);
  }, []);

  const loadDraft = useCallback((): PlanWizardData | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PlanWizardData;
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { saveDraft, loadDraft, clearDraft };
}
```

### 2.5 Implémentation des 7 étapes

Pour chaque étape, suivre rigoureusement la spec wizard V1.0 (sections 2-8). Voici les points-clés :

#### Step 1 — Type de plan

- 7 cartes cliquables (BSPCE, AGA, RSU, Stock Option, BSA, Phantom, ESOP)
- Bouton "Magic Import" (UI uniquement V1, fonctionnalité V2)
- Sélection unique → progression

#### Step 2 — Informations générales

- Champs : name, boardDate, grantDate (auto-copié), poolSize, exercisePrice (conditionnel), description
- **Auto-copie boardDate → grantDate** au premier remplissage (via useRef pour éviter boucle)
- **Validation strike vs FMV** : BSPCE ≥ 100% FMV, STOCK_OPTION ≥ 80% FMV
- Bannière info par type de plan

#### Step 3 — Vesting

- 3 modes visuels : single, tranches, cliff_linear
- Mode tranches : table éditable avec validation total = 100%
- Mode cliff_linear : génération auto du tableau récapitulatif
- Warning si totalMonths < minAcquisitionMonths du type de plan

#### Step 4 — Performance (le plus complexe)

**Sous-composants à implémenter** :

1. **`ConditionEditor`** : Collapsible avec header (résumé) + body (champs détaillés)
2. **`PeerGroupEditor`** : table éditable avec édition inline volatilité/corrélation
3. **`WeightedPeerGroupsEditor`** : groupes hiérarchiques avec poids effectifs
4. **`YahooIndexSearch`** : combobox avec debounce 300ms appelant `searchYahooIndex` Server Action
5. **`AcquisitionScaleEditor`** : 2 modes (CURVE/TIERS) avec preview Recharts
6. **`ReferencePriceConfig` (V5)** : config Start/End avec 3 méthodes chacune (SPOT/FIXED/AVERAGE)
7. **`TickerSearchCombobox`** : appelle `searchTicker` Server Action

**Logique critique** :

- Au changement de `conditionType`, appeler `cleanConditionForType()` pour nettoyer les champs spécifiques
- Auto-fetch des données de marché à la sélection d'un ticker/indice
- Synchronisation V5 → champs legacy (`startFixedPrice` → `initialReferencePrice`, etc.)
- Validation `WeightValidationBanner` si `combinationType === 'WEIGHTED'`

#### Step 5 — Leavers

- 8 types fixes avec selector de traitement par chacun
- Légende des catégories (good/bad/neutral/protected)
- Defaults selon type de plan

#### Step 6 — Valuation

- Section data marché (TickerSearchCombobox + auto-fetch)
- Section sous-jacent (S₀, currency)
- Section volatilité/taux/dividende (avec mode % ou €)
- Section modèle (auto/BS/MC) avec calcul `effectiveModel`
- Section MC params (collapsible) si MC effectif
- **Force `stepsPerYear = 252`** si conditions MARKET avec TSR ou averaging

#### Step 7 — Review

- 6 cartes récapitulatives
- Validation combinée affichée en haut
- Bouton "Créer le plan" (gradient)

### 2.6 Validation des étapes

Chaque étape a son propre schéma Zod. Le bouton "Suivant" appelle `methods.trigger([fields])` pour valider uniquement les champs de l'étape courante. Les erreurs s'affichent inline (`<FieldError>`).

---

## 3. SERVER ACTIONS — PLANS

### 3.1 `createPlan` — La cascade de création

C'est la Server Action la plus complexe du module. Elle doit insérer **9 entités** dans une transaction (ou pseudo-transaction si Supabase ne le permet pas en une fois).

```typescript
// src/server/actions/plans.ts
'use server';

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/audit';
import { runComplianceChecks } from '@/lib/compliance';
import { planWizardSchema } from '@equity/shared/schemas/planWizard';

export async function createPlan(input: unknown) {
  const data = planWizardSchema.parse(input);
  const user = await requirePermission('plans.create');
  const supabase = await createServerSupabase();

  // 1. Compliance pre-checks (soft warnings collectés, hard blocks rejetés)
  const compliance = await runComplianceChecks('PLAN_CREATION', data);
  if (compliance.hasHardBlocks) {
    return { error: 'compliance_blocked', warnings: compliance.errors };
  }

  // 2. Récupérer la company associée
  const companyId = await resolveCompanyForPlan(user.activeOrgId!, data);

  // 3. Mapping types
  const mappedPlanType = mapPlanType(data.planType);

  // 4. Insert plan (transaction logique via fonction RPC)
  const { data: result, error } = await supabase.rpc('create_plan_full', {
    p_org_id: user.activeOrgId,
    p_company_id: companyId,
    p_plan_data: {
      name: data.name,
      plan_type: mappedPlanType,
      grant_date: data.grantDate,
      board_date: data.boardDate,
      shareholder_meeting_date: data.shareholderMeetingDate,
      shareholder_authorization_expires_at: data.shareholderAuthorizationExpiresAt,
      pool_size: data.poolSize,
      exercise_price: data.exercisePrice,
      reference_share_price: data.underlyingPrice,
      performance_combination_type: data.combinationType,
      performance_evaluation_moment: data.evaluationMoment,
      performance_failure_action: data.failureAction,
      status: 'DRAFT',
    },
    p_vesting: buildVestingPayload(data),
    p_conditions: buildConditionsPayload(data),
    p_leaver_rules: buildLeaverRulesPayload(data),
    p_hypothesis: buildHypothesisPayload(data),
    p_volatility: buildVolatilityPayload(data),
    p_simulation: buildSimulationPayload(data),
    p_compliance_warnings: compliance.warnings,
  });

  if (error) {
    return { error: error.message };
  }

  // 5. Audit
  await logAuditEvent({
    eventType: 'plan.created',
    resourceType: 'PLAN',
    resourceId: result.plan_id,
    afterState: data,
    metadata: { compliance_warnings_count: compliance.warnings.length },
  });

  return { data: { id: result.plan_id, complianceWarnings: compliance.warnings } };
}
```

#### Fonction RPC `create_plan_full`

Tout dans une transaction PostgreSQL :

```sql
CREATE OR REPLACE FUNCTION create_plan_full(
  p_org_id UUID,
  p_company_id UUID,
  p_plan_data JSONB,
  p_vesting JSONB,
  p_conditions JSONB,
  p_leaver_rules JSONB,
  p_hypothesis JSONB,
  p_volatility JSONB,
  p_simulation JSONB,
  p_compliance_warnings JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id UUID;
  v_vesting_schedule_id UUID;
  v_hypothesis_set_id UUID;
  v_condition JSONB;
  v_tranche JSONB;
  v_leaver JSONB;
BEGIN
  -- Permission check
  IF NOT user_has_permission('plans.create') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- 1. Plan
  INSERT INTO plans (
    org_id, company_id, name, plan_type,
    grant_date, board_date, shareholder_meeting_date,
    shareholder_authorization_expires_at,
    pool_size, exercise_price, reference_share_price,
    performance_combination_type, performance_evaluation_moment,
    performance_failure_action, status,
    compliance_warnings, version
  ) VALUES (
    p_org_id, p_company_id,
    p_plan_data->>'name',
    p_plan_data->>'plan_type',
    (p_plan_data->>'grant_date')::DATE,
    (p_plan_data->>'board_date')::DATE,
    (p_plan_data->>'shareholder_meeting_date')::DATE,
    (p_plan_data->>'shareholder_authorization_expires_at')::DATE,
    (p_plan_data->>'pool_size')::BIGINT,
    (p_plan_data->>'exercise_price')::NUMERIC,
    (p_plan_data->>'reference_share_price')::NUMERIC,
    p_plan_data->>'performance_combination_type',
    p_plan_data->>'performance_evaluation_moment',
    p_plan_data->>'performance_failure_action',
    'DRAFT',
    p_compliance_warnings,
    1
  ) RETURNING id INTO v_plan_id;

  -- 2. Vesting schedule
  INSERT INTO vesting_schedules (
    org_id, plan_id, schedule_type, cliff_months,
    linear_after_cliff, frequency
  ) VALUES (
    p_org_id, v_plan_id,
    p_vesting->>'schedule_type',
    (p_vesting->>'cliff_months')::INTEGER,
    (p_vesting->>'linear_after_cliff')::BOOLEAN,
    p_vesting->>'frequency'
  ) RETURNING id INTO v_vesting_schedule_id;

  -- 3. Vesting tranches
  FOR v_tranche IN SELECT * FROM jsonb_array_elements(p_vesting->'tranches')
  LOOP
    INSERT INTO vesting_tranches (
      schedule_id, vesting_date, percentage_of_award, sort_order
    ) VALUES (
      v_vesting_schedule_id,
      (v_tranche->>'vesting_date')::DATE,
      (v_tranche->>'percentage')::NUMERIC,
      (v_tranche->>'sort_order')::INTEGER
    );
  END LOOP;

  -- 4. Performance conditions
  FOR v_condition IN SELECT * FROM jsonb_array_elements(p_conditions)
  LOOP
    INSERT INTO performance_conditions (
      org_id, plan_id, name, condition_type, metric, weight,
      market_metric_type, reference_index, reference_index_display_name,
      peer_group, acquisition_scale,
      measurement_period_years, initial_reference_price,
      measurement_start, measurement_end,
      use_averaging, averaging_days, avg_days_start, avg_days_end,
      comparison_method, market_data_params
    ) VALUES (
      p_org_id, v_plan_id,
      v_condition->>'name',
      v_condition->>'condition_type',
      v_condition->>'metric',
      (v_condition->>'weight')::NUMERIC,
      v_condition->>'market_metric_type',
      v_condition->>'reference_index',
      v_condition->>'reference_index_display_name',
      v_condition->'peer_group',
      v_condition->'acquisition_scale',
      (v_condition->>'measurement_period_years')::NUMERIC,
      (v_condition->>'initial_reference_price')::NUMERIC,
      (v_condition->>'measurement_start')::DATE,
      (v_condition->>'measurement_end')::DATE,
      (v_condition->>'use_averaging')::BOOLEAN,
      (v_condition->>'averaging_days')::INTEGER,
      (v_condition->>'avg_days_start')::INTEGER,
      (v_condition->>'avg_days_end')::INTEGER,
      v_condition->>'comparison_method',
      v_condition->'market_data_params'
    );
  END LOOP;

  -- 5. Early termination rules
  FOR v_leaver IN SELECT * FROM jsonb_array_elements(p_leaver_rules)
  LOOP
    INSERT INTO early_termination_rules (
      org_id, plan_id, leaver_type, treatment,
      acceleration_months, exercise_window_days
    ) VALUES (
      p_org_id, v_plan_id,
      v_leaver->>'leaver_type',
      v_leaver->>'treatment',
      (v_leaver->>'acceleration_months')::INTEGER,
      (v_leaver->>'exercise_window_days')::INTEGER
    );
  END LOOP;

  -- 6. Hypothesis set
  INSERT INTO hypothesis_sets (
    org_id, plan_id, company_id, as_of_date,
    s0, rate_flat, dividend_yield, vol_method, ticker_override, currency,
    multi_asset_params
  ) VALUES (
    p_org_id, v_plan_id, p_company_id,
    (p_hypothesis->>'as_of_date')::DATE,
    (p_hypothesis->>'s0')::NUMERIC,
    (p_hypothesis->>'rate_flat')::NUMERIC,
    (p_hypothesis->>'dividend_yield')::NUMERIC,
    p_hypothesis->>'vol_method',
    p_hypothesis->>'ticker_override',
    p_hypothesis->>'currency',
    p_hypothesis->'multi_asset_params'
  ) RETURNING id INTO v_hypothesis_set_id;

  -- 7. Volatility scheme
  INSERT INTO volatility_schemes (
    hypothesis_set_id, org_id, annualized_sigma,
    lookback_period_days, method
  ) VALUES (
    v_hypothesis_set_id, p_org_id,
    (p_volatility->>'annualized_sigma')::NUMERIC,
    (p_volatility->>'lookback_period_days')::INTEGER,
    p_volatility->>'method'
  );

  -- 8. Simulation config
  INSERT INTO simulation_configs (
    org_id, hypothesis_set_id, pricer_type, effective_model,
    underlying_model, num_paths, steps_per_year, time_horizon_years,
    antithetic_variates, heston_params, jump_params
  ) VALUES (
    p_org_id, v_hypothesis_set_id,
    p_simulation->>'pricer_type',
    p_simulation->>'effective_model',
    p_simulation->>'underlying_model',
    (p_simulation->>'num_paths')::INTEGER,
    (p_simulation->>'steps_per_year')::INTEGER,
    (p_simulation->>'time_horizon_years')::NUMERIC,
    (p_simulation->>'antithetic_variates')::BOOLEAN,
    p_simulation->'heston_params',
    p_simulation->'jump_params'
  );

  RETURN jsonb_build_object('plan_id', v_plan_id);
END $$;
```

> **Note** : si Supabase RPC pose problème pour les transactions complexes, on peut utiliser l'approche alternative côté Node.js avec `supabase.rpc('begin')` puis insertions séquentielles puis `commit/rollback`. Ma reco : la fonction RPC PostgreSQL est plus robuste.

### 3.2 `updatePlan`

```typescript
export async function updatePlan(planId: string, input: unknown) {
  const data = planWizardSchema.parse(input);
  const user = await requirePermission('plans.update');
  const supabase = await createServerSupabase();

  // Vérifier que le plan existe et n'est pas locked
  const { data: existingPlan } = await supabase
    .from('plans')
    .select('id, is_locked, version, status')
    .eq('id', planId)
    .single();

  if (!existingPlan) return { error: 'Plan not found' };
  if (existingPlan.is_locked) {
    return { error: 'Plan is locked (awards already issued). Use duplicatePlan to create a new version.' };
  }

  // Compliance check
  const compliance = await runComplianceChecks('PLAN_UPDATE', { ...data, planId });
  if (compliance.hasHardBlocks) {
    return { error: 'compliance_blocked', warnings: compliance.errors };
  }

  // Update via RPC similaire à create_plan_full mais sur plan existant
  const { error } = await supabase.rpc('update_plan_full', { p_plan_id: planId, ... });

  if (error) return { error: error.message };

  await logAuditEvent({
    eventType: 'plan.updated',
    resourceType: 'PLAN',
    resourceId: planId,
    beforeState: existingPlan,
    afterState: data,
  });

  return { success: true };
}
```

### 3.3 `duplicatePlan` (création de nouvelle version)

```typescript
export async function duplicatePlan(planId: string, newName?: string) {
  await requirePermission('plans.create');
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc('duplicate_plan', {
    p_source_plan_id: planId,
    p_new_name: newName,
  });

  if (error) return { error: error.message };

  await logAuditEvent({
    eventType: 'plan.duplicated',
    resourceType: 'PLAN',
    resourceId: data.new_plan_id,
    metadata: { source_plan_id: planId },
  });

  return { data: { id: data.new_plan_id } };
}
```

La fonction RPC `duplicate_plan` :

- Copie le plan avec `parent_plan_id = source.id`, `version = source.version + 1`, `status = 'DRAFT'`, `is_locked = false`
- Copie le vesting_schedule + tranches
- Copie les performance_conditions
- Copie les early_termination_rules
- **Ne copie PAS** : awards, valuation_runs, hypothesis_sets (le user en créera des nouveaux)

### 3.4 `archivePlan`

```typescript
export async function archivePlan(planId: string) {
  await requirePermission('plans.delete');
  const supabase = await createServerSupabase();

  // Soft delete + status CLOSED
  const { error } = await supabase
    .from('plans')
    .update({
      status: 'CLOSED',
      deleted_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (error) return { error: error.message };

  await logAuditEvent({
    eventType: 'plan.archived',
    resourceType: 'PLAN',
    resourceId: planId,
  });

  return { success: true };
}
```

### 3.5 `lockPlan`

Appelé automatiquement quand le **premier award** est émis (Module 3b). Disponible aussi manuellement.

```typescript
export async function lockPlan(planId: string) {
  await requirePermission('plans.lock');
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from('plans')
    .update({ is_locked: true, status: 'ACTIVE' })
    .eq('id', planId);

  if (error) return { error: error.message };

  await logAuditEvent({
    eventType: 'plan.locked',
    resourceType: 'PLAN',
    resourceId: planId,
  });

  return { success: true };
}
```

### 3.6 `saveDraftPlan` (auto-save wizard)

```typescript
export async function saveDraftPlan(input: any) {
  const user = await requirePermission('plans.create');
  const supabase = await createServerSupabase();

  // Validation light (pas le schéma complet, juste un objet valide)
  if (!input.name || !input.planType) return { skipped: true };

  // Stocke dans une table `plan_drafts` (à créer si pas en DB)
  const { error } = await supabase.from('plan_drafts').upsert({
    id: input.draftId ?? uuidv4(),
    org_id: user.activeOrgId,
    created_by: user.id,
    data: input,
    updated_at: new Date().toISOString(),
  });

  return { saved: !error };
}
```

> **Note** : ajouter migration pour `plan_drafts` si elle n'existe pas en Module 1.

```sql
-- Migration: add plan_drafts
CREATE TABLE IF NOT EXISTS plan_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_drafts_user ON plan_drafts(created_by, updated_at DESC);
```

### 3.7 Helpers de mapping

Ces helpers transforment les données du Wizard (`PlanWizardData`) vers les payloads SQL.

```typescript
// src/server/actions/plans/builders.ts

function mapPlanType(uiType: string): string {
  const map: Record<string, string> = {
    BSPCE: 'BSPCE',
    AGA: 'AGA',
    PERFORMANCE_SHARE: 'PERFORMANCE_SHARE',
    STOCK_OPTION: 'STOCK_OPTION',
    BSA: 'BSA',
    PHANTOM: 'STOCK_OPTION', // fallback (DB ne supporte pas PHANTOM en V1)
    ESOP: 'STOCK_OPTION',
    RSU: 'PERFORMANCE_SHARE',
    SAR: 'STOCK_OPTION',
  };
  return map[uiType] ?? uiType;
}

function buildVestingPayload(data: PlanWizardData) {
  if (data.vestingType === 'single') {
    return {
      schedule_type: 'single',
      tranches: [
        {
          vesting_date: data.singleVestingDate,
          percentage: 100,
          sort_order: 0,
        },
      ],
    };
  }

  if (data.vestingType === 'tranches') {
    return {
      schedule_type: 'tranches',
      tranches: (data.vestingTranches ?? []).map((t, i) => ({
        vesting_date: t.vestingDate,
        percentage: t.percentage,
        sort_order: i,
      })),
    };
  }

  // cliff_linear : générer les tranches
  if (data.vestingType === 'cliff_linear') {
    const tranches = generateCliffLinearTranches(data);
    return {
      schedule_type: 'cliff_linear',
      cliff_months: data.cliffMonths,
      linear_after_cliff: true,
      frequency: data.frequency,
      tranches,
    };
  }
}

function generateCliffLinearTranches(data: PlanWizardData) {
  const grantDate = new Date(data.grantDate ?? data.boardDate!);
  const tranches = [];

  // Cliff
  const cliffDate = new Date(grantDate);
  cliffDate.setMonth(cliffDate.getMonth() + (data.cliffMonths ?? 0));
  tranches.push({
    vesting_date: cliffDate.toISOString().split('T')[0],
    percentage: data.cliffPercentage,
    sort_order: 0,
  });

  // Post-cliff
  const intervalMonths = { monthly: 1, quarterly: 3, annually: 12 }[data.frequency ?? 'monthly'];
  const postCliffMonths = (data.totalMonths ?? 0) - (data.cliffMonths ?? 0);
  const numPostTranches = Math.floor(postCliffMonths / intervalMonths);
  const remainingPercentage = 100 - (data.cliffPercentage ?? 0);
  const perTranche = remainingPercentage / numPostTranches;

  for (let i = 1; i <= numPostTranches; i++) {
    const date = new Date(cliffDate);
    date.setMonth(date.getMonth() + i * intervalMonths);
    tranches.push({
      vesting_date: date.toISOString().split('T')[0],
      percentage: perTranche,
      sort_order: i,
    });
  }

  return tranches;
}

function buildConditionsPayload(data: PlanWizardData) {
  if (!data.hasPerformanceConditions || !data.conditions) return [];

  return data.conditions.map((cond) => ({
    name: cond.name,
    condition_type: cond.conditionType,
    metric: cond.metric ?? cond.marketMetricType,
    weight: cond.weight,
    market_metric_type: cond.marketMetricType,
    reference_index: cond.referenceIndex,
    reference_index_display_name: cond.referenceIndexDisplayName,
    peer_group: cond.weightedPeerGroups
      ? { type: 'weighted_groups', groups: cond.weightedPeerGroups }
      : (cond.peerGroup ?? null),
    acquisition_scale: cond.acquisitionScale,
    measurement_period_years: cond.measurementPeriodYears,
    initial_reference_price: cond.startFixedPrice ?? null,
    measurement_start: cond.performanceStartDate,
    measurement_end: cond.performanceEndDate,
    use_averaging: cond.endPriceMethod === 'AVERAGE',
    averaging_days: cond.endAveragingDays,
    avg_days_start: cond.startAveragingDays,
    avg_days_end: cond.endAveragingDays,
    comparison_method: cond.comparisonMethod ?? 'WEIGHTED_AVERAGE',
    market_data_params: {
      start_price_method: cond.startPriceMethod,
      start_fixed_price: cond.startFixedPrice,
      start_averaging_days: cond.startAveragingDays,
      end_price_method: cond.endPriceMethod,
      end_fixed_price: cond.endFixedPrice,
      end_averaging_days: cond.endAveragingDays,
    },
  }));
}

function buildLeaverRulesPayload(data: PlanWizardData) {
  if (!data.leaverRules) return [];

  return Object.entries(data.leaverRules).map(([leaverType, rule]) => ({
    leaver_type: leaverType,
    treatment: rule.treatment,
    acceleration_months: rule.accelerationMonths,
    exercise_window_days: rule.exerciseWindowDays,
  }));
}

function buildHypothesisPayload(data: PlanWizardData) {
  return {
    as_of_date: data.boardDate,
    s0: data.underlyingPrice,
    rate_flat: (data.riskFreeRate ?? 0) / 100,
    dividend_yield: (data.dividendYield ?? 0) / 100,
    vol_method: data.volMethod,
    ticker_override: data.ticker,
    currency: data.currency,
    multi_asset_params: {
      exercise_price: data.exercisePrice,
      heston_params:
        data.underlyingModel === 'HESTON'
          ? {
              v0: data.hestonV0,
              kappa: data.hestonKappa,
              theta: data.hestonTheta,
              xi: data.hestonXi,
              rho: data.hestonRho,
            }
          : null,
      jump_params:
        data.underlyingModel === 'JUMP_DIFFUSION'
          ? {
              lambda: data.jumpLambda,
              mu_j: data.jumpMuJ,
              sigma_j: data.jumpSigmaJ,
            }
          : null,
    },
  };
}

function buildVolatilityPayload(data: PlanWizardData) {
  return {
    annualized_sigma: (data.volatility ?? 30) / 100,
    lookback_period_days: data.lookbackDays,
    method: data.volMethod,
  };
}

function buildSimulationPayload(data: PlanWizardData) {
  const hasMarketCondition = (data.conditions ?? []).some((c) => c.conditionType === 'MARKET');
  const effectiveModel = computeEffectiveModel(data.modelChoice, hasMarketCondition);

  return {
    pricer_type: data.modelChoice,
    effective_model: effectiveModel,
    underlying_model: data.underlyingModel,
    num_paths: data.numPaths,
    steps_per_year: data.stepsPerYear,
    time_horizon_years: data.timeHorizonYears,
    antithetic_variates: data.useAntithetic,
    heston_params: data.underlyingModel === 'HESTON' ? {} : null,
    jump_params: data.underlyingModel === 'JUMP_DIFFUSION' ? {} : null,
  };
}

function computeEffectiveModel(choice: string, hasMarket: boolean): string {
  if (choice === 'auto') return hasMarket ? 'monte_carlo' : 'black_scholes';
  return choice;
}
```

---

## 4. INTÉGRATION MOTEUR PYTHON (FLY.IO)

### 4.1 Edge Function proxy

Pour appeler le Python engine, on passe par une Edge Function Supabase plutôt qu'un appel direct depuis la Server Action. Avantages :

- Timeout plus long (Edge Functions Supabase = 60s vs Vercel Hobby = 10s)
- Centralise les logs des appels
- Permet la reprise asynchrone si le calcul est long

```typescript
// supabase/functions/compute-valuation/index.ts
import { createClient } from '@supabase/supabase-js';

const QUANT_ENGINE_URL = Deno.env.get('QUANT_ENGINE_URL')!;
const QUANT_ENGINE_API_KEY = Deno.env.get('QUANT_ENGINE_API_KEY');

Deno.serve(async (req) => {
  const { run_id } = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Charger le contexte du run (plan, awards, conditions, hypothesis, etc.)
  const context = await loadValuationContext(supabase, run_id);

  // 2. Construire le payload Python
  const payload = buildPythonPayload(context);

  // 3. Update run status
  await supabase
    .from('valuation_runs')
    .update({ status: 'RUNNING', started_at: new Date().toISOString() })
    .eq('id', run_id);

  // 4. Appel Python
  try {
    const response = await fetch(`${QUANT_ENGINE_URL}/compute/multi-tranche`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(QUANT_ENGINE_API_KEY && { 'x-api-key': QUANT_ENGINE_API_KEY }),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Python engine error: ${response.status}`);
    }

    const result = await response.json();

    // 5. Save results
    await supabase.from('valuation_results').insert({
      run_id,
      org_id: context.orgId,
      fair_value_per_instrument: result.fair_value_per_unit,
      fair_value_total: result.fair_value,
      std_error: result.std_error,
      ci95_low: result.ci95_low,
      ci95_high: result.ci95_high,
      distribution_stats: {
        debug_paths: result.debug_paths,
        vesting_probability: result.vesting_probability,
        audit_trail: result.audit_trail,
        tranche_details: result.tranche_details,
        condition_breakdown: result.condition_breakdown,
      },
      sensitivities: result.sensitivities,
      market_data_snapshot: context.marketDataSnapshot,
    });

    await supabase
      .from('valuation_runs')
      .update({
        status: 'DONE',
        finished_at: new Date().toISOString(),
        pricer_used: payload.config.use_monte_carlo ? 'MONTE_CARLO_MULTI_TRANCHE' : 'BLACK_SCHOLES',
        engine_version: result.engine_version ?? 'V8',
      })
      .eq('id', run_id);

    // 6. Trigger IFRS 2 expense calculation
    await supabase.functions.invoke('compute-ifrs2-expense', { body: { run_id } });

    return new Response(JSON.stringify({ success: true, run_id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    await supabase
      .from('valuation_runs')
      .update({
        status: 'ERROR',
        error_message: error.message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run_id);

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

### 4.2 Builder du payload Python

C'est la **conversion canonique** entre la DB Supabase et le format attendu par le Python engine. Reprendre la logique exacte de l'edge function `valuation-run-create-and-compute` du moteur existant (V4.2 — règle ATM symétrique, etc.).

```typescript
// supabase/functions/_shared/buildPythonPayload.ts

interface ValuationContext {
  orgId: string;
  plan: any;
  hypothesisSet: any;
  volatilityScheme: any;
  simulationConfig: any;
  conditions: any[];
  vestingSchedule: any;
  vestingTranches: any[];
  marketDataSnapshot: any;
}

export function buildPythonPayload(ctx: ValuationContext) {
  const isMonteCarlo = shouldUseMonteCarlo(ctx);

  // Config
  const config = {
    num_paths: ctx.simulationConfig.num_paths,
    num_time_steps: Math.round(
      ctx.simulationConfig.time_horizon_years * ctx.simulationConfig.steps_per_year,
    ),
    seed: 42,
    antithetic_variates: ctx.simulationConfig.antithetic_variates,
    use_monte_carlo: isMonteCarlo,
  };

  // Market
  const market = {
    S0: ctx.hypothesisSet.s0,
    r: ctx.hypothesisSet.rate_flat,
    q: ctx.hypothesisSet.dividend_yield,
    sigma: ctx.volatilityScheme.annualized_sigma,
  };

  // Instrument (vesting schedule converti en format Python V4)
  const instrument = {
    strike: ctx.plan.exercise_price ?? 0,
    T: ctx.simulationConfig.time_horizon_years,
    type: ['BSPCE', 'STOCK_OPTION', 'BSA', 'SAR'].includes(ctx.plan.plan_type) ? 'option' : 'stock',
    vesting_schedule: convertVestingToFormatV4(ctx.vestingTranches, ctx.plan.grant_date),
  };

  // Conditions
  const conditions = ctx.conditions.map((cond) => buildConditionParams(cond, ctx));

  return { config, market, instrument, conditions };
}

function shouldUseMonteCarlo(ctx: ValuationContext): boolean {
  const hasMarketCondition = ctx.conditions.some((c) => c.condition_type === 'MARKET');
  const hasMultipleTranches = ctx.vestingTranches.length > 1;
  return hasMarketCondition || hasMultipleTranches;
}

function convertVestingToFormatV4(tranches: any[], grantDate: string) {
  const grant = new Date(grantDate).getTime();
  return tranches.map((t) => {
    const vestDate = new Date(t.vesting_date).getTime();
    const yearsFromGrant = (vestDate - grant) / (1000 * 60 * 60 * 24 * 365.25);
    return {
      time: yearsFromGrant,
      portion: t.percentage_of_award / 100,
    };
  });
}

function buildConditionParams(cond: any, ctx: ValuationContext) {
  // Logique copiée intégralement depuis l'edge function existante
  // V4.2 — règle ATM symétrique sur peers (cf. HANDOVER_PACK_V4.2 section 9.4)
  // ...
  const params: any = {
    type: cond.market_metric_type ?? cond.condition_type,
    weight: cond.weight,
    payout_curve: convertAcquisitionScale(cond.acquisition_scale),
    measurement_period_years: cond.measurement_period_years,
    use_averaging: cond.use_averaging,
    averaging_days: cond.averaging_days,
    comparison_method: cond.comparison_method ?? 'WEIGHTED_AVERAGE',
  };

  // ATM rule (V4.1)
  const isUserFixed =
    cond.market_data_params?.start_price_method === 'FIXED' &&
    cond.market_data_params?.start_fixed_price > 0;
  if (isUserFixed) {
    params.initial_reference_price = cond.market_data_params.start_fixed_price;
  } else {
    // Force ATM = S0
    params.initial_reference_price = ctx.hypothesisSet.s0;
  }

  // Index-specific
  if (cond.market_metric_type === 'TSR_REL_INDEX') {
    params.index_ticker = cond.reference_index;
    params.index_S0 = cond.market_data_params?.index_params?.S0;
    params.index_sigma = cond.market_data_params?.index_params?.sigma;
    params.correlation = cond.market_data_params?.index_correlation ?? 0.5;
  }

  // Peers-specific (V4.2 ATM symmetric)
  if (cond.market_metric_type === 'TSR_REL_PEERS') {
    const peerGroup = cond.peer_group;
    const enrichedPeers = enrichPeersWithATM(peerGroup, ctx.hypothesisSet.s0, !isUserFixed);
    if (peerGroup?.type === 'weighted_groups') {
      params.weighted_peer_groups = peerGroup.groups;
    } else {
      params.peer_group = enrichedPeers;
    }
  }

  return params;
}

function enrichPeersWithATM(peerGroup: any, mainS0: number, forceATM: boolean) {
  // Voir HANDOVER_PACK_V4.2 section 9.4
  if (!peerGroup) return [];
  const peers =
    peerGroup.type === 'weighted_groups'
      ? peerGroup.groups.flatMap((g: any) => g.peers)
      : peerGroup;
  return peers.map((p: any) => ({
    ...p,
    initial_reference_price: forceATM ? p.s0 : (p.initial_reference_price ?? p.s0),
    ref_price_source: forceATM ? 'ATM_SYMMETRIC' : 'CUSTOM',
  }));
}

function convertAcquisitionScale(scale: any) {
  if (!scale) return undefined;
  if (scale.mode === 'CURVE') {
    return scale.points.map((p: any) => ({
      performance_level: p.threshold,
      vesting_multiplier: p.acquisition / 100,
    }));
  }
  // TIERS
  return scale.tiers.flatMap((t: any) => [
    { performance_level: t.min, vesting_multiplier: t.acquisition / 100 },
    { performance_level: t.max, vesting_multiplier: t.acquisition / 100 },
  ]);
}
```

### 4.3 Server Action `runValuation`

```typescript
// src/server/actions/valuations.ts
'use server';

import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/audit';

export async function runValuation(planId: string, hypothesisSetId?: string) {
  const user = await requirePermission('valuations.run');
  const supabase = await createServerSupabase();

  // 1. Si pas de hypothesisSetId, prendre le dernier
  let hypoId = hypothesisSetId;
  if (!hypoId) {
    const { data } = await supabase
      .from('hypothesis_sets')
      .select('id')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    hypoId = data?.id;
  }

  if (!hypoId) return { error: 'No hypothesis set found' };

  // 2. Get simulation config
  const { data: simConfig } = await supabase
    .from('simulation_configs')
    .select('id')
    .eq('hypothesis_set_id', hypoId)
    .single();

  // 3. Create valuation_run
  const { data: run, error: insertError } = await supabase
    .from('valuation_runs')
    .insert({
      org_id: user.activeOrgId,
      plan_id: planId,
      hypothesis_set_id: hypoId,
      simulation_config_id: simConfig?.id,
      status: 'QUEUED',
    })
    .select()
    .single();

  if (insertError) return { error: insertError.message };

  // 4. Trigger edge function (async, fire and forget)
  await supabase.functions.invoke('compute-valuation', {
    body: { run_id: run.id },
  });

  await logAuditEvent({
    eventType: 'valuation.started',
    resourceType: 'VALUATION_RUN',
    resourceId: run.id,
    metadata: { plan_id: planId, hypothesis_set_id: hypoId },
  });

  return { data: { runId: run.id } };
}
```

### 4.4 Suivi en temps réel

Pour que le frontend voie le statut évoluer (QUEUED → RUNNING → DONE), utiliser les **Realtime subscriptions** Supabase :

```tsx
'use client';
import { useEffect, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';

export function useValuationRunStatus(runId: string | null) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    const supabase = createBrowserSupabase();

    // Initial fetch
    supabase
      .from('valuation_runs')
      .select('status, error_message')
      .eq('id', runId)
      .single()
      .then(({ data }) => setStatus(data?.status ?? null));

    // Realtime
    const channel = supabase
      .channel(`valuation_run:${runId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'valuation_runs',
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          setStatus(payload.new.status);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [runId]);

  return status;
}
```

> **Important** : activer Realtime sur la table `valuation_runs` côté Supabase (Database → Replication → Tables to broadcast).

---

## 5. SERVER ACTIONS — MARKET DATA

### 5.1 `searchTicker`

```typescript
// src/server/actions/market-data.ts
'use server';

import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/rbac';

export async function searchTicker(query: string) {
  if (query.length < 2) return { data: [] };
  await requirePermission('plans.read');

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.functions.invoke('search-ticker', {
    body: { query },
  });

  if (error) return { error: error.message };
  return { data };
}

export async function searchYahooIndex(query: string) {
  if (query.length < 2) return { data: [] };
  await requirePermission('plans.read');

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.functions.invoke('yahoo-search', {
    body: { query, quotesCount: 15 },
  });

  if (error) return { error: error.message };
  return { data: data?.results ?? [] };
}

export async function fetchMarketData(input: {
  ticker: string;
  asOfDate: string;
  lookbackDays: number;
  previewOnly?: boolean;
}) {
  await requirePermission('plans.read');
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.functions.invoke('market-data-fetch', {
    body: input,
  });

  if (error) return { error: error.message };
  return { data };
}

export async function fetchPeerGroupData(input: {
  companyTicker: string;
  peers: Array<{ ticker: string; id?: string }>;
  asOfDate: string;
  lookbackDays: number;
  planId?: string;
}) {
  const user = await requirePermission('plans.read');
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.functions.invoke('market-data-peer-group', {
    body: { ...input, org_id: user.activeOrgId },
  });

  if (error) return { error: error.message };
  return { data };
}

export async function fetchHistoricalAverage(input: {
  ticker: string;
  startDate: string;
  endDate: string;
}) {
  await requirePermission('plans.read');
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.functions.invoke('fetch-historical-average', {
    body: input,
  });

  if (error) return { error: error.message };
  return { data };
}
```

### 5.2 Edge Functions Yahoo/EODHD

Les edge functions `search-ticker`, `yahoo-search`, `market-data-fetch`, `market-data-peer-group`, `fetch-historical-average` existent déjà côté projet Lovable. **Les copier intégralement** dans le nouveau projet sous `supabase/functions/`.

Si tu n'as pas accès au code existant :

- `yahoo-search` : appelle `https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount={N}`
- `search-ticker` : variante de yahoo-search filtrée
- `market-data-fetch` : Yahoo finance + EODHD pour données historiques + calcul volatilité (log-returns annualisés)
- `market-data-peer-group` : multi-fetch + matrice de corrélation
- `fetch-historical-average` : EODHD historical prices + moyenne arithmétique

> Demande au moteur Python existant de te fournir le code source de ces edge functions, ou implémente-les depuis la spec V1.0 du wizard.

---

## 6. PAGE LISTE DES PLANS

### 6.1 Route et SSR

```tsx
// src/app/(dashboard)/dashboard/plans/page.tsx
import { listPlans } from '@/server/queries/plans';
import { requirePermissionOrRedirect } from '@/lib/auth/rbac';
import { PlansListClient } from '@/components/plans/PlansListClient';

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; search?: string }>;
}) {
  await requirePermissionOrRedirect('plans.read');

  const params = await searchParams;
  const plans = await listPlans({
    status: params.status,
    type: params.type,
    search: params.search,
  });

  return <PlansListClient initialPlans={plans} />;
}
```

### 6.2 Query

```typescript
// src/server/queries/plans.ts
'use server';

import { createServerSupabase } from '@/lib/supabase/server';

export async function listPlans(filters?: { status?: string; type?: string; search?: string }) {
  const supabase = await createServerSupabase();

  let query = supabase
    .from('plans')
    .select(
      `
      id, name, plan_type, status, is_locked, version,
      grant_date, board_date, pool_size, pool_allocated,
      exercise_price, created_at, updated_at,
      companies(name, ticker)
    `,
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.type) query = query.eq('plan_type', filters.type);
  if (filters?.search) query = query.ilike('name', `%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getPlanDetails(id: string) {
  const supabase = await createServerSupabase();

  const { data: plan } = await supabase
    .from('plans')
    .select(
      `
      *,
      companies(*),
      vesting_schedules(*, vesting_tranches(*)),
      performance_conditions(*),
      early_termination_rules(*)
    `,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!plan) return null;

  // Charger hypothèses + valos séparément (peuvent être nombreuses)
  const { data: hypotheses } = await supabase
    .from('hypothesis_sets')
    .select('*, volatility_schemes(*), simulation_configs(*)')
    .eq('plan_id', id)
    .order('created_at', { ascending: false });

  const { data: valuationRuns } = await supabase
    .from('valuation_runs')
    .select('*, valuation_results(*)')
    .eq('plan_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    plan,
    hypotheses: hypotheses ?? [],
    valuationRuns: valuationRuns ?? [],
  };
}
```

### 6.3 UI Liste

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable } from '@/components/shared/DataTable';
import { formatDate, formatNumber } from '@/lib/formatters';

export function PlansListClient({ initialPlans }: { initialPlans: any[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = initialPlans.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter !== 'all' && p.plan_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Plans</h1>
        <Link href="/dashboard/plans/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau plan
          </Button>
        </Link>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-3 h-4 w-4" />
          <Input
            placeholder="Rechercher un plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          {/* Items DRAFT, ACTIVE, CLOSED */}
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          {/* Items BSPCE, AGA, etc. */}
        </Select>
      </div>

      <DataTable
        columns={[
          {
            key: 'name',
            label: 'Nom',
            render: (p) => (
              <Link href={`/dashboard/plans/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
            ),
          },
          { key: 'plan_type', label: 'Type', render: (p) => <Badge>{p.plan_type}</Badge> },
          { key: 'status', label: 'Statut' },
          { key: 'company', label: 'Société', render: (p) => p.companies?.name },
          { key: 'pool_size', label: 'Pool', render: (p) => formatNumber(p.pool_size) },
          {
            key: 'pool_allocated',
            label: 'Attribué',
            render: (p) =>
              `${formatNumber(p.pool_allocated)} (${((p.pool_allocated / p.pool_size) * 100).toFixed(0)}%)`,
          },
          { key: 'grant_date', label: 'Date attribution', render: (p) => formatDate(p.grant_date) },
        ]}
        data={filtered}
        emptyMessage="Aucun plan trouvé."
      />
    </div>
  );
}
```

---

## 7. PAGE DÉTAIL DU PLAN (8 ONGLETS)

### 7.1 Layout

```tsx
// src/app/(dashboard)/dashboard/plans/[id]/page.tsx
import { getPlanDetails } from '@/server/queries/plans';
import { notFound } from 'next/navigation';
import { PlanDetailClient } from '@/components/plans/PlanDetailClient';

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPlanDetails(id);
  if (!data) notFound();

  return <PlanDetailClient {...data} />;
}
```

### 7.2 Composant Détail (8 onglets)

```tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlanSynthesisTab } from './tabs/PlanSynthesisTab';
import { PlanSnapshotTab } from './tabs/PlanSnapshotTab';
import { PlanPerformanceTab } from './tabs/PlanPerformanceTab';
import { PlanIfrs2Tab } from './tabs/PlanIfrs2Tab';
import { PlanHypothesesTab } from './tabs/PlanHypothesesTab';
import { PlanLeaversTab } from './tabs/PlanLeaversTab';
import { PlanVersionsTab } from './tabs/PlanVersionsTab';
import { PlanGrantsTab } from './tabs/PlanGrantsTab';

const TABS = [
  { id: 'synthesis', label: 'Synthèse', component: PlanSynthesisTab },
  { id: 'snapshot', label: 'État', component: PlanSnapshotTab },
  { id: 'performance', label: 'Performance', component: PlanPerformanceTab },
  { id: 'ifrs2', label: 'IFRS 2', component: PlanIfrs2Tab },
  { id: 'hypotheses', label: 'Hypothèses', component: PlanHypothesesTab },
  { id: 'leavers', label: 'Départs', component: PlanLeaversTab },
  { id: 'versions', label: 'Versions', component: PlanVersionsTab },
  { id: 'grants', label: 'Attributions', component: PlanGrantsTab },
];

export function PlanDetailClient({ plan, hypotheses, valuationRuns }: any) {
  return (
    <div className="space-y-6">
      <PlanHeader plan={plan} />

      <Tabs defaultValue="synthesis">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <t.component plan={plan} hypotheses={hypotheses} valuationRuns={valuationRuns} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

### 7.3 Onglets — Contenu

#### Synthesis

- KPIs (FV total, FV/unité, status, version)
- Graphique vesting (Recharts)
- Conditions de performance résumées
- Bouton "Lancer une valorisation"

#### Snapshot

- État actuel : pool size, allocated, vested, exercised, cancelled, outstanding
- Progress bars
- Liste des bénéficiaires (Module 3b)

#### Performance

- Liste détaillée des conditions (cards)
- Pour chaque condition : type, métrique, payout curve (chart Recharts), peer group si applicable
- État de la performance (en cours/atteinte/manquée — V2 pour évaluation continue)

#### IFRS2

- Calendrier de charges (table mensuelle/trimestrielle)
- Total expense, cumul par période
- Bouton export Excel/PDF

#### Hypotheses

- Liste des hypothesis_sets associés (versions)
- Bouton "Nouveau jeu d'hypothèses"
- Pour chaque set : S0, sigma, r, q, ticker, source data

#### Leavers

- 8 cards (un par leaver_type) avec traitement et paramètres
- Bouton édition (si !is_locked)

#### Versions

- Historique des versions du plan (parent_plan_id)
- Date de création, créateur, status, raison de duplication
- Bouton "Voir cette version"

#### Grants (preview Module 3b)

- Tableau des awards émis (vide en Module 3a)
- Bouton "Nouvelle attribution" (visible mais désactivé si is_locked = false)

---

## 8. VERSIONING DES PLANS

### 8.1 Principe

Quand un plan est utilisé pour des awards (locked), il devient immuable. Pour le modifier :

1. **Duplicate** crée une nouvelle version (`version + 1`, `parent_plan_id = ancien`)
2. La nouvelle version est en `DRAFT` et peut être éditée
3. Les nouveaux awards peuvent pointer vers la nouvelle version
4. Les awards existants gardent leur `plan_version` (snapshot)

### 8.2 Snapshot dans les awards

Quand un award est créé (Module 3b), il copie en JSONB :

- `vesting_schedule_snapshot`
- `performance_conditions_snapshot`
- `leaver_rules_snapshot`
- `plan_version`

Comme ça, même si le plan est modifié plus tard (nouvelle version), l'award garde ses règles initiales pour la valorisation et le calcul IFRS 2.

---

## 9. COMPLIANCE — RÈGLES DE BASE V1

> Module 12 (Compliance Engine) couvrira l'engine complet. Ici on implémente juste les règles **bloquantes** au niveau du plan.

### 9.1 Règles V1 à implémenter

```typescript
// src/lib/compliance/rules/planRules.ts

export const PLAN_COMPLIANCE_RULES = [
  {
    code: 'BSPCE_ELIGIBILITY',
    description: 'Société éligible BSPCE (CA, ancienneté, capital, contrôle)',
    appliesTo: ['BSPCE'],
    enforcement: 'hard',
    check: async (data: PlanWizardData, ctx: any) => {
      const { company } = ctx;
      if (data.planType !== 'BSPCE') return null;
      if (!company.is_bspce_eligible) {
        return {
          severity: 'ERROR',
          message:
            'Société non éligible aux BSPCE. Vérifier CA < 150M€, ancienneté < 15 ans, capital détenu ≥ 25% par personnes physiques.',
        };
      }
      return null;
    },
  },
  {
    code: 'BSPCE_MAX_EXERCISE_YEARS',
    description: "BSPCE : exercice avant 10 ans à compter de l'attribution",
    appliesTo: ['BSPCE'],
    enforcement: 'hard',
    check: async (data: PlanWizardData) => {
      if (data.planType !== 'BSPCE') return null;
      // Vérifier que toutes les tranches sont avant grant + 10 ans
      const grantDate = new Date(data.grantDate ?? data.boardDate!);
      const maxDate = new Date(grantDate);
      maxDate.setFullYear(maxDate.getFullYear() + 10);

      const lastVestingDate = computeLastVestingDate(data);
      if (lastVestingDate > maxDate) {
        return {
          severity: 'ERROR',
          message: 'Vesting au-delà des 10 ans (limite BSPCE).',
        };
      }
      return null;
    },
  },
  {
    code: 'BSPCE_18M_DELAY',
    description: 'BSPCE : attribution dans les 18 mois après autorisation AGE',
    appliesTo: ['BSPCE'],
    enforcement: 'soft',
    check: async (data: PlanWizardData) => {
      if (data.planType !== 'BSPCE' || !data.shareholderMeetingDate) return null;
      const meetingDate = new Date(data.shareholderMeetingDate);
      const grantDate = new Date(data.grantDate ?? data.boardDate!);
      const monthsDiff =
        (grantDate.getTime() - meetingDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      if (monthsDiff > 18) {
        return {
          severity: 'WARNING',
          message: `Attribution ${Math.round(monthsDiff)} mois après l'AGE (limite recommandée : 18 mois).`,
        };
      }
      return null;
    },
  },
  {
    code: 'AGA_MIN_VESTING_1Y',
    description: "AGA : période d'acquisition minimale de 1 an",
    appliesTo: ['AGA'],
    enforcement: 'hard',
    check: async (data: PlanWizardData) => {
      if (data.planType !== 'AGA') return null;
      const grantDate = new Date(data.grantDate ?? data.boardDate!);
      const firstVestingDate = computeFirstVestingDate(data);
      const monthsDiff =
        (firstVestingDate.getTime() - grantDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      if (monthsDiff < 12) {
        return {
          severity: 'ERROR',
          message: `Première date de vesting à ${Math.round(monthsDiff)} mois (minimum AGA : 12 mois).`,
        };
      }
      return null;
    },
  },
  {
    code: 'AGA_AUTHORIZATION_VALID',
    description: 'AGA : autorisation AGE valide (max 38 mois)',
    appliesTo: ['AGA', 'PERFORMANCE_SHARE'],
    enforcement: 'hard',
    check: async (data: PlanWizardData) => {
      if (!['AGA', 'PERFORMANCE_SHARE'].includes(data.planType)) return null;
      if (!data.shareholderAuthorizationExpiresAt) {
        return {
          severity: 'ERROR',
          message: "Date d'expiration de l'autorisation AGE requise pour AGA.",
        };
      }
      const grantDate = new Date(data.grantDate ?? data.boardDate!);
      const expiryDate = new Date(data.shareholderAuthorizationExpiresAt);
      if (expiryDate < grantDate) {
        return {
          severity: 'ERROR',
          message: "Autorisation AGE expirée à la date d'attribution.",
        };
      }
      return null;
    },
  },
  {
    code: 'POOL_NOT_EXCEEDED',
    description: 'Pool size cohérent (à vérifier au moment des awards, soft warning ici)',
    appliesTo: ['ALL'],
    enforcement: 'soft',
    check: async (data: PlanWizardData) => {
      // Au stade du plan, on vérifie juste que pool_size > 0
      if ((data.poolSize ?? 0) <= 0) {
        return { severity: 'ERROR', message: 'Taille du pool invalide.' };
      }
      return null;
    },
  },
];
```

### 9.2 Runner

```typescript
// src/lib/compliance/runner.ts

export async function runComplianceChecks(
  context: 'PLAN_CREATION' | 'PLAN_UPDATE' | 'AWARD_PROPOSAL' | 'EXERCISE_REQUEST',
  data: any,
  extraCtx?: any,
): Promise<{
  hasHardBlocks: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}> {
  const supabase = await createServerSupabase();
  const errors: any[] = [];
  const warnings: any[] = [];

  // Charger config compliance pour l'org (override des enforcements par défaut)
  const { data: orgConfig } = await supabase
    .from('compliance_rules_config')
    .select('rule_code, enforcement')
    .eq('org_id', extraCtx?.orgId);

  const configMap = new Map(orgConfig?.map((c) => [c.rule_code, c.enforcement]) ?? []);

  const rulesForContext =
    context === 'PLAN_CREATION' || context === 'PLAN_UPDATE' ? PLAN_COMPLIANCE_RULES : []; // À étoffer pour les autres contextes

  for (const rule of rulesForContext) {
    if (rule.appliesTo[0] !== 'ALL' && !rule.appliesTo.includes(data.planType)) continue;

    const result = await rule.check(data, extraCtx);
    if (!result) continue;

    const enforcement = configMap.get(rule.code) ?? rule.enforcement;
    if (enforcement === 'disabled') continue;

    const item = { code: rule.code, message: result.message };
    if (enforcement === 'hard' && result.severity === 'ERROR') {
      errors.push(item);
    } else {
      warnings.push(item);
    }
  }

  return {
    hasHardBlocks: errors.length > 0,
    errors,
    warnings,
  };
}
```

---

## 10. AUDIT TRAIL

### 10.1 Événements à logger

| Event Type                  | Trigger                           |
| --------------------------- | --------------------------------- |
| `plan.draft_saved`          | Auto-save wizard                  |
| `plan.created`              | Soumission wizard finale          |
| `plan.updated`              | Modification d'un plan existant   |
| `plan.duplicated`           | Création d'une nouvelle version   |
| `plan.archived`             | Archivage                         |
| `plan.locked`               | Verrou (auto ou manuel)           |
| `valuation.started`         | Démarrage d'une valo              |
| `valuation.completed`       | Fin de valo (status=DONE)         |
| `valuation.failed`          | Échec valo                        |
| `market_data.fetched`       | Récupération de données de marché |
| `compliance.warning_raised` | Soft warning généré               |
| `compliance.hard_block`     | Hard block en création/update     |

---

## 11. TESTS

### 11.1 Tests unitaires

- Schémas Zod (validation par étape, refinements croisés)
- `mapPlanType()`, `computeEffectiveModel()`, `generateCliffLinearTranches()`
- Compliance rules (chaque règle avec 2-3 cas)

### 11.2 Tests d'intégration

- `createPlan` end-to-end : wizard data → DB → entités créées correctement
- `duplicatePlan` : bonne copie sans awards
- `runValuation` : appel au mock Python engine, save des résultats

### 11.3 Tests E2E (Playwright)

Scénarios :

1. Admin crée un plan BSPCE simple sans condition → wizard 7 étapes → plan en DRAFT visible
2. Admin crée un plan AGA avec condition TSR_REL_INDEX → fetch indice → valorisation → résultat affiché
3. Admin essaie de créer BSPCE avec strike < FMV → erreur de validation
4. Admin duplique un plan locked → nouvelle version DRAFT créée
5. Admin lance valo → status RUNNING → DONE en realtime → résultats affichés

---

## 12. PERFORMANCES

### 12.1 Optimisations

- Le wizard est lourd (Step 4 surtout). Utiliser `React.memo` sur les composants de condition pour éviter re-renders inutiles
- TanStack Query avec `staleTime: 5min` pour les données de marché
- Préchargement de la liste des plans avec `React.cache()` côté SSR
- Pagination sur les listes (par défaut 20 plans, infinite scroll)
- Lazy-load des onglets de la page détail (pas tous chargés d'un coup)

### 12.2 Limites

- Wizard : max 60 tranches de vesting, 10 conditions, 30 peers, 20 points de courbe (LIMITS module)
- Liste plans : max 200 par page (au-delà → pagination)
- Valuation runs : timeout 60s côté Edge Function (extension à 300s côté Fly.io si nécessaire)

---

## 13. INSTRUCTIONS POUR CLAUDE CODE

### Prérequis

- Modules 1 et 2 finalisés et validés
- Variables d'env : `QUANT_ENGINE_URL` et `QUANT_ENGINE_API_KEY` configurées (clé créée côté Python engine)
- Edge Functions Yahoo/EODHD copiées depuis le projet existant ou réimplémentées

### Phase 1 — Schémas & Validation (priorité 1)

1. Créer `packages/shared/src/schemas/planWizard.ts` (section 2.2 du document)
2. Créer `packages/shared/src/types/plan.ts` (types TS)
3. Créer `apps/web/src/lib/compliance/rules/planRules.ts` (section 9)
4. Créer `apps/web/src/lib/compliance/runner.ts`
5. Migration `00012_plan_drafts.sql` (table `plan_drafts`)
6. Migration `00013_plan_compliance_warnings.sql` :
   ```sql
   ALTER TABLE plans ADD COLUMN IF NOT EXISTS compliance_warnings JSONB DEFAULT '[]';
   ```
7. Migration `00014_plan_rpc_functions.sql` (fonctions RPC `create_plan_full`, `update_plan_full`, `duplicate_plan`)

### Phase 2 — Server Actions & Backend (priorité 2)

1. Créer `src/server/actions/plans.ts` :
   - `createPlan`, `updatePlan`, `duplicatePlan`, `archivePlan`, `lockPlan`, `saveDraftPlan`
2. Créer `src/server/actions/companies.ts` (CRUD basique)
3. Créer `src/server/actions/market-data.ts` :
   - `searchTicker`, `searchYahooIndex`, `fetchMarketData`, `fetchPeerGroupData`, `fetchHistoricalAverage`
4. Créer `src/server/actions/valuations.ts` :
   - `runValuation`, `cancelValuation`
5. Créer `src/server/queries/plans.ts` :
   - `listPlans`, `getPlanDetails`, `getPlanValuationHistory`
6. Copier/réimplémenter les Edge Functions :
   - `search-ticker`, `yahoo-search`, `market-data-fetch`, `market-data-peer-group`, `fetch-historical-average`
7. Créer Edge Function `compute-valuation` (section 4.1)
8. Créer Edge Function `compute-ifrs2-expense` (depuis le moteur existant)
9. Créer `src/server/_shared/buildPythonPayload.ts` (section 4.2)

### Phase 3 — Wizard 7 étapes (priorité 3)

1. Créer la structure `src/components/plans/wizard/`
2. Container `PlanWizard.tsx` (section 2.3)
3. `WizardSidebar.tsx` (avec résumé contextuel)
4. `WizardFooter.tsx`
5. Hook `useWizardPersistence.ts` (section 2.4)
6. **Step 1** : `Step1PlanType.tsx` (7 cartes, sélection)
7. **Step 2** : `Step2GeneralInfo.tsx` (champs + auto-copie + bannière par type)
8. **Step 3** : `Step3Vesting.tsx` (3 modes, génération auto cliff_linear, validation tranches=100%)
9. **Step 4** : `Step4Performance.tsx` + sous-composants (le plus gros morceau) :
   - `ConditionEditor.tsx`
   - `PeerGroupEditor.tsx`
   - `WeightedPeerGroupsEditor.tsx`
   - `YahooIndexSearch.tsx`
   - `AcquisitionScaleEditor.tsx` (CURVE + TIERS)
   - `ReferencePriceConfig.tsx` (V5)
   - `TickerSearchCombobox.tsx`
   - `WeightValidationBanner.tsx`
10. **Step 5** : `Step5Leavers.tsx` (8 types, defaults par plan_type)
11. **Step 6** : `Step6Valuation.tsx` + sous-composants :
    - `MarketDataPanel.tsx` (auto-fetch ticker)
    - `MonteCarloParams.tsx` (collapsible Heston/JD)
12. **Step 7** : `Step7Review.tsx` (6 cartes récap + validation combinée)

### Phase 4 — Pages & Routes (priorité 4)

1. Route `/dashboard/plans` : page liste avec filtres
2. Route `/dashboard/plans/new` : wizard création
3. Route `/dashboard/plans/[id]` : page détail avec 8 onglets
4. Route `/dashboard/plans/[id]/edit` : wizard édition (si !locked)
5. Route `/dashboard/plans/[id]/valuations` : historique valos
6. Route `/dashboard/plans/[id]/valuations/[runId]` : détail valo (sensitivities, audit trail, sample paths)
7. Route `/dashboard/plans/[id]/ifrs2` : calendrier IFRS 2 + export
8. Route `/dashboard/plans/[id]/versions` : historique versions
9. Route `/dashboard/companies` : liste sociétés
10. Route `/dashboard/companies/[id]` : détail société

### Phase 5 — Intégration moteur Python (priorité 5)

1. Tester `runValuation` avec un plan simple (BSPCE, 1 tranche, pas de condition)
2. Tester avec un plan complexe (multi-tranches, TSR_REL_PEERS, payout curve)
3. Vérifier que les résultats Python sont bien sauvegardés
4. Implémenter le hook `useValuationRunStatus` avec Realtime
5. Activer Realtime sur `valuation_runs` côté Supabase
6. Vérifier que le chaînage `compute-valuation` → `compute-ifrs2-expense` fonctionne

### Phase 6 — Tests & Validation (priorité 6)

1. Tests unitaires Vitest (schémas, helpers, compliance rules)
2. Tests d'intégration (Server Actions avec Supabase test instance)
3. Tests E2E Playwright (5 scénarios section 11.3)

### Validations avant Module 3b

- [ ] Wizard 7 étapes complet et fonctionnel
- [ ] Création d'un plan BSPCE simple → DB cohérente (plan + vesting + ...)
- [ ] Édition d'un plan en DRAFT → modifications sauvegardées
- [ ] Plan locked (manuellement) → édition désactivée, duplication possible
- [ ] Compliance rules : BSPCE avec strike < FMV → bloque ; AGA avec vesting < 1 an → bloque
- [ ] Valorisation BS : plan AGA simple → FV = S₀ × exp(-qT)
- [ ] Valorisation MC : plan TSR_REL_PEERS → résultat avec audit_trail visible
- [ ] Calendrier IFRS 2 généré et somme cohérente avec total expense
- [ ] Status valo en realtime (QUEUED → RUNNING → DONE) sans refresh manuel
- [ ] Auto-save brouillon fonctionne (rechargement page = données restaurées)
- [ ] Audit events présents pour toutes les actions critiques
- [ ] Tests E2E verts

### Conventions strictes

- **Réutiliser** le code et la logique du moteur Python existant (V4.2 ATM symétrique notamment) — ne pas réinventer
- **Validation Zod** sur chaque Server Action
- **Pas de service_role côté client** (toujours server-side)
- **Fonctions RPC** pour les insertions multi-tables (transaction garantie)
- **Audit log** systématique sur les actions critiques
- **TipTap** sera intégré au Module 6 (Documents). Ici, pas d'éditeur WYSIWYG
- **Realtime** activé uniquement sur `valuation_runs` (les autres tables n'en ont pas besoin)

### Points de vigilance

- **Wizard Step 4 lourd** : performances UI à surveiller. Utiliser React.memo, virtualisation si > 100 items
- **Race conditions** sur saveDraftPlan : debounce + `idempotency_key` pour éviter writes concurrents
- **Pool size cohérence** : à vérifier au Module 3b (awards), pas au plan
- **Versioning** : un plan dupliqué doit copier les conditions ET les peer_groups (JSONB), pas juste les FK
- **ATM Symétrique V4.2** : ne pas oublier d'enrichir les peers avec `ref_price_source: 'ATM_SYMMETRIC'` quand applicable
- **Edge Function timeout** : Fly.io peut prendre 30-60s pour un MC à 100K paths. Configurer le timeout en conséquence
- **Limites du wizard** : respecter strictement les `LIMITS` (anti-DoS)

---

**FIN DU MODULE 3a — PLANS (CRUD + WIZARD)**

_Quand le Module 3a est implémenté et validé, reviens vers Claude (chat) pour "go module 3b" (Awards Lifecycle)._
