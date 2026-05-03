'use server';

import { revalidatePath } from 'next/cache';
import {
  STANDARD_FR_LEAVER_RULES,
  planWizardSchema,
  step6Schema,
  type PlanWizardData,
  type WizardLeaverType,
} from '@equity/shared';
import { generateCliffLinearTranches } from '@/components/plans/wizard/lib/cliff-linear';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server Actions du Module 3a — wizard de création de plan.
 *
 * 3 endpoints utilisés par le wizard client (`PlanWizard.tsx`) :
 *  - `saveDraftPlan(data)` : auto-save serveur (debounce 2s côté client)
 *  - `loadDraftPlan()` : restauration au mount
 *  - `createPlan(data)` : soumission finale via RPC `create_plan_full`
 *    (cf. migration 00017 — cascade atomique sur 6+ tables).
 */

// =============================================================================
// saveDraftPlan
// =============================================================================

/**
 * Sauvegarde un brouillon de plan via la fonction RPC `upsert_plan_draft`
 * (1 brouillon par (org_id, user_id), upsert idempotent).
 *
 * Pas de validation Zod stricte : un brouillon peut être incomplet par
 * définition. On stocke tel quel et la validation s'applique à la
 * création finale.
 */
export async function saveDraftPlan(
  data: PlanWizardData,
): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  await requirePermission('plans.create');
  const supabase = await createSupabaseServerClient();
  const { data: result, error } = await supabase.rpc('upsert_plan_draft', {
    p_data: data as never,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  const payload = result as { id: string; saved_at: string } | null;
  if (!payload?.saved_at) {
    return { ok: false, error: 'Réponse RPC inattendue' };
  }
  return { ok: true, savedAt: payload.saved_at };
}

// =============================================================================
// loadDraftPlan
// =============================================================================

/**
 * Récupère le brouillon courant de l'utilisateur dans son org active.
 * Retourne `{ ok: false }` si aucun brouillon (plutôt qu'une erreur,
 * car c'est un cas normal au premier mount).
 */
export async function loadDraftPlan(): Promise<
  { ok: true; data: Partial<PlanWizardData>; savedAt: string } | { ok: false }
> {
  try {
    await requirePermission('plans.create');
  } catch {
    return { ok: false };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('plan_drafts')
    .select('data, updated_at')
    .maybeSingle();
  if (error || !data) return { ok: false };
  return {
    ok: true,
    data: data.data as Partial<PlanWizardData>,
    savedAt: new Date(data.updated_at).toISOString(),
  };
}

// =============================================================================
// createPlan — appel réel du RPC create_plan_full (B2)
// =============================================================================

export type CreatePlanSuccess = {
  ok: true;
  planId: string;
  companyId: string;
  complianceWarnings: ComplianceWarning[];
};

export type CreatePlanError = {
  ok: false;
  error: string;
  validationIssues?: number;
};

export type ComplianceWarning = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Création finale du plan via cascade atomique côté DB.
 *
 * Pipeline :
 *  1. Validation Zod (échec → ok=false avec issues count)
 *  2. Permission `plans.create`
 *  3. Build des 7 payloads JSONB (plan_data, vesting+tranches, conditions,
 *     leaver_rules, hypothesis, volatility, simulation) — mapping
 *     CamelCase wizard → snake_case DB documenté dans
 *     memory/module_3a_b1_post_check.md écarts 2 + 3.
 *  4. Appel RPC `create_plan_full(...)` — atomique, rollback total sur erreur
 *  5. Cleanup brouillon serveur (DELETE plan_drafts pour l'user)
 *  6. Audit `plan.created`
 *  7. Revalidate /dashboard
 *
 * Note : `compliance_warnings` est passé vide pour l'instant (la lib
 * `runComplianceChecks` arrivera dans un module dédié — Module 11). Le
 * RPC accepte un array vide et stocke `[]` dans plans.compliance_warnings.
 */
export async function createPlan(input: unknown): Promise<CreatePlanSuccess | CreatePlanError> {
  // 1. Validation Zod stricte
  const parseResult = planWizardSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: `Validation échouée : ${parseResult.error.issues.length} erreur(s).`,
      validationIssues: parseResult.error.issues.length,
    };
  }
  const data = parseResult.data;

  // 1.b. Re-check Step 6 strictement — `planWizardSchema` fait
  // `step6Schema.partial()` pour tolérer les drafts intermédiaires, donc
  // `volatility` / `riskFreeRate` / etc. peuvent être undefined au submit
  // final. Sans ce garde, on a vu un plan créé avec
  // `volatility_schemes.annualized_sigma = NULL`, qui faisait planter
  // l'Edge Function compute-valuation au moment du payload Python.
  const step6Check = step6Schema.safeParse(data);
  if (!step6Check.success) {
    const fields = step6Check.error.issues.map((i) => i.path.join('.')).join(', ');
    return {
      ok: false,
      error: `Étape 6 (Valorisation) incomplète : ${fields || step6Check.error.issues.length + ' erreur(s)'}`,
      validationIssues: step6Check.error.issues.length,
    };
  }

  // 2. Permission + activeOrgId requis
  const user = await requirePermission('plans.create');
  if (!user.activeOrgId) {
    return { ok: false, error: 'Organisation active manquante' };
  }

  // 3. Build des 7 payloads
  const planData = buildPlanPayload(data);
  const vesting = buildVestingPayload(data);
  const conditions = buildConditionsPayload(data);
  const leaverRules = buildLeaverRulesPayload(data);
  const hypothesis = buildHypothesisPayload(data);
  const volatility = buildVolatilityPayload(data);
  const simulation = buildSimulationPayload(data);
  const complianceWarnings: ComplianceWarning[] = [];

  // 4. RPC cascade atomique
  const supabase = await createSupabaseServerClient();
  // Cast `p_company_id: null` : Supabase type generator marque le param comme
  // string (UUID) non nullable alors que la fonction PL/pgSQL accepte NULL et
  // auto-crée une company. Le runtime gère NULL correctement (cf. migration
  // 00017 ligne « IF v_company_id IS NULL »).
  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_plan_full', {
    p_org_id: user.activeOrgId,
    p_company_id: null as unknown as string,
    p_plan_data: planData as never,
    p_vesting: vesting as never,
    p_conditions: conditions as never,
    p_leaver_rules: leaverRules as never,
    p_hypothesis: hypothesis as never,
    p_volatility: volatility as never,
    p_simulation: simulation as never,
    p_compliance_warnings: complianceWarnings as never,
  });

  if (rpcError) {
    // Pattern courant : `Permission denied`, `pool_size doit etre > 0`, etc.
    return { ok: false, error: rpcError.message };
  }

  const result = rpcResult as { plan_id: string; company_id: string } | null;
  if (!result?.plan_id) {
    return { ok: false, error: 'Réponse RPC inattendue (plan_id manquant)' };
  }

  // 5. Cleanup brouillon — best-effort, on ignore les erreurs
  try {
    await supabase.from('plan_drafts').delete().eq('user_id', user.id);
  } catch {
    /* ignore */
  }

  // 6. Audit
  await logAuditEvent({
    eventType: 'plan.created',
    resourceType: 'PLAN',
    resourceId: result.plan_id,
    afterState: data as Record<string, unknown>,
    metadata: {
      plan_type: data.planType,
      pool_size: data.poolSize,
      conditions_count: conditions.length,
      leavers_count: leaverRules.length,
      compliance_warnings_count: complianceWarnings.length,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/plans');

  return {
    ok: true,
    planId: result.plan_id,
    companyId: result.company_id,
    complianceWarnings,
  };
}

// =============================================================================
// Builders wizard → RPC payload
// -----------------------------------------------------------------------------
// Tous les builders mappent CamelCase Zod → snake_case DB. Les champs
// optionnels non remplis sont omis (le RPC fait `NULLIF(p->>'x', '')::T`
// pour les inputs string vides).
// =============================================================================

function buildPlanPayload(data: PlanWizardData): Record<string, unknown> {
  return {
    name: data.name,
    description: data.description,
    plan_type: data.planType,
    settlement_type: 'EQUITY', // TODO Module 3a §X : exposer dans le wizard
    board_date: data.boardDate,
    grant_date: data.grantDate,
    shareholder_meeting_date: data.shareholderMeetingDate,
    shareholder_authorization_expires_at: data.shareholderAuthorizationExpiresAt,
    pool_size: data.poolSize,
    exercise_price: data.exercisePrice,
    // reference_share_price : convention §3.1 — alimenté depuis underlyingPrice
    // du Step 6 (le prix sous-jacent à la date d'attribution sert de
    // référence pour le strike/FMV).
    reference_share_price: data.underlyingPrice,
    performance_combination_type: data.combinationType,
    performance_evaluation_moment: data.evaluationMoment,
    performance_failure_action: data.failureAction,
    auto_generate_document: data.autoGenerateDocument ?? false,
    status: 'DRAFT',
  };
}

type VestingPayload = {
  vesting_type: string;
  single_vesting_date?: string;
  cliff_months?: number;
  cliff_percentage?: number;
  total_months?: number;
  frequency?: string;
  linear_after_cliff?: boolean;
  tranches: Array<{ vesting_date: string; percentage_of_award: number; sort_order: number }>;
};

function buildVestingPayload(data: PlanWizardData): VestingPayload {
  const vestingType = data.vestingType ?? 'single';

  if (vestingType === 'single') {
    const date = data.singleVestingDate ?? data.grantDate;
    return {
      vesting_type: 'single',
      single_vesting_date: date,
      tranches: [{ vesting_date: date, percentage_of_award: 100, sort_order: 0 }],
    };
  }

  if (vestingType === 'tranches') {
    const tranches = (data.vestingTranches ?? []).map((t, i) => ({
      vesting_date: t.vestingDate,
      percentage_of_award: t.percentage,
      sort_order: i,
    }));
    return { vesting_type: 'tranches', tranches };
  }

  // cliff_linear : génération programmatique des tranches
  const cliffMonths = data.cliffMonths ?? 0;
  const cliffPercentage = data.cliffPercentage ?? 0;
  const totalMonths = data.totalMonths ?? 0;
  const frequency = data.frequency ?? 'monthly';
  const generated = generateCliffLinearTranches({
    grantDate: data.grantDate,
    cliffMonths,
    cliffPercentage,
    totalMonths,
    frequency,
  });
  return {
    vesting_type: 'cliff_linear',
    cliff_months: cliffMonths,
    cliff_percentage: cliffPercentage,
    total_months: totalMonths,
    frequency,
    linear_after_cliff: true,
    tranches: generated.map((t) => ({
      vesting_date: t.date,
      percentage_of_award: t.percentage,
      sort_order: t.index,
    })),
  };
}

function buildConditionsPayload(data: PlanWizardData): Record<string, unknown>[] {
  if (!data.hasPerformanceConditions) return [];
  const conditions = data.conditions ?? [];
  return conditions.map((c) => ({
    name: c.name,
    condition_type: c.conditionType,
    category: c.category,
    weight: c.weight,
    enable_partial_scoring: c.enablePartialScoring,
    performance_start_date: c.performanceStartDate,
    performance_end_date: c.performanceEndDate,
    metric: c.metric,
    target_value: c.targetValue,
    target_unit: c.targetUnit,
    comparison_operator: c.comparisonOperator,
    threshold_min: c.thresholdMin,
    threshold_max: c.thresholdMax,
    market_metric_type: c.marketMetricType,
    reference_index: c.referenceIndex,
    reference_index_display_name: c.referenceIndexDisplayName,
    comparison_method: c.comparisonMethod,
    measurement_period_years: c.measurementPeriodYears,
    start_price_method: c.startPriceMethod,
    start_fixed_price: c.startFixedPrice,
    start_averaging_days: c.startAveragingDays,
    end_price_method: c.endPriceMethod,
    end_fixed_price: c.endFixedPrice,
    end_averaging_days: c.endAveragingDays,
    peer_group: c.peerGroup,
    weighted_peer_groups: c.weightedPeerGroups,
    acquisition_scale: c.acquisitionScale,
    // V2 — Market Data (migrations 00070 + 00073). Snake_case côté DB.
    market_data_fetch_mode: c.marketDataFetchMode ?? 'SNAPSHOT_AT_GRANT',
    reference_index_s0: c.reference_index_s0 ?? null,
    reference_index_sigma: c.reference_index_sigma ?? null,
    reference_index_correlation: c.reference_index_correlation ?? null,
    reference_index_dividend_yield: c.reference_index_dividend_yield ?? null,
    reference_index_data_source: c.reference_index_data_source ?? null,
    reference_index_data_captured_at: c.reference_index_data_captured_at ?? null,
    reference_index_resolved_ticker: c.reference_index_resolved_ticker ?? null,
    market_data_warnings: c.market_data_warnings ?? null,
  }));
}

/**
 * Construit le payload des 8 règles leavers à insérer en DB.
 *
 * Garantie : retourne TOUJOURS les 8 leaver_types (anti-bug E2E B2 où
 * un user qui n'avait pas touché Step 5 finissait avec 0 leavers en DB
 * et un moteur Monte Carlo sans fallback). Pour chaque leaver_type non
 * renseigné par l'utilisateur, on applique le preset Standard FR Tech
 * (cf. STANDARD_FR_LEAVER_RULES dans @equity/shared).
 */
function buildLeaverRulesPayload(data: PlanWizardData): Record<string, unknown>[] {
  const userRules = data.leaverRules ?? ({} as Record<string, never>);
  const allLeaverTypes = Object.keys(STANDARD_FR_LEAVER_RULES) as WizardLeaverType[];
  return allLeaverTypes.map((leaverType) => {
    const userRule = (
      userRules as Record<
        string,
        { treatment?: string; accelerationMonths?: number; exerciseWindowDays?: number } | undefined
      >
    )[leaverType];
    const treatment = userRule?.treatment ?? STANDARD_FR_LEAVER_RULES[leaverType].treatment;
    return {
      leaver_type: leaverType,
      treatment,
      acceleration_months: userRule?.accelerationMonths,
      exercise_window_days: userRule?.exerciseWindowDays,
    };
  });
}

function buildHypothesisPayload(data: PlanWizardData): Record<string, unknown> {
  // Cf. memory/module_3a_b1_post_check.md écart 3 : alias wizard → DB.
  return {
    as_of_date: data.boardDate, // baseline pricing = date conseil par convention
    s0: data.underlyingPrice,
    rate_flat: data.riskFreeRate,
    dividend_yield: data.dividendYield,
    vol_method: data.volMethod,
    ticker_override: data.companyTicker || data.ticker,
    currency: data.currency,
    volatility: data.volatility,
    volatility_price_type: data.volatilityPriceType,
    volatility_winsorizing_pct: data.volatilityWinsorizingPct,
    dividend_input_mode: data.dividendInputMode,
    dividend_amount: data.dividendAmount,
    lookback_days: data.lookbackDays,
    correlation_override: data.correlationOverride,
    model_choice: data.modelChoice,
    underlying_model: data.underlyingModel,
    time_horizon_years: data.timeHorizonYears,
  };
}

function buildVolatilityPayload(data: PlanWizardData): Record<string, unknown> {
  // Le wizard pose volMethod côté hypothesis_sets ; on utilise la même valeur
  // pour volatility_schemes.method (CHECK accepte les mêmes options).
  // annualized_sigma = volatility (en %) / 100 pour avoir un sigma fraction.
  const annualizedSigma =
    data.volatility != null ? Number((data.volatility / 100).toFixed(4)) : undefined;

  // Heston / Jump params construits depuis les champs flat du Step 6.
  const hestonHas =
    data.hestonV0 != null ||
    data.hestonKappa != null ||
    data.hestonTheta != null ||
    data.hestonXi != null ||
    data.hestonRho != null;
  const jumpHas = data.jumpLambda != null || data.jumpMuJ != null || data.jumpSigmaJ != null;

  return {
    method: data.volMethod,
    annualized_sigma: annualizedSigma,
    lookback_period_days: data.lookbackDays,
    heston_params: hestonHas
      ? {
          v0: data.hestonV0,
          kappa: data.hestonKappa,
          theta: data.hestonTheta,
          xi: data.hestonXi,
          rho: data.hestonRho,
        }
      : undefined,
    jump_params: jumpHas
      ? {
          lambda: data.jumpLambda,
          muJ: data.jumpMuJ,
          sigmaJ: data.jumpSigmaJ,
        }
      : undefined,
  };
}

function buildSimulationPayload(data: PlanWizardData): Record<string, unknown> {
  return {
    pricer_type: data.modelChoice,
    effective_model: data.underlyingModel,
    underlying_model: data.underlyingModel,
    num_paths: data.numPaths,
    steps_per_year: data.stepsPerYear,
    time_horizon_years: data.timeHorizonYears,
    antithetic_variates: data.useAntithetic,
    // Heston / jump params dupliqués dans simulation_configs aussi (cf. spec
    // §3.1 : le moteur Python lit ces params directement depuis simulation_configs
    // pour le Monte Carlo, pas depuis volatility_schemes).
    heston_params:
      data.hestonV0 != null
        ? {
            v0: data.hestonV0,
            kappa: data.hestonKappa,
            theta: data.hestonTheta,
            xi: data.hestonXi,
            rho: data.hestonRho,
          }
        : undefined,
    jump_params:
      data.jumpLambda != null
        ? {
            lambda: data.jumpLambda,
            muJ: data.jumpMuJ,
            sigmaJ: data.jumpSigmaJ,
          }
        : undefined,
  };
}

// =============================================================================
// Type re-exports pour le client wizard
// =============================================================================
export type SaveDraftResult = ReturnType<typeof saveDraftPlan> extends Promise<infer R> ? R : never;
export type LoadDraftResult = ReturnType<typeof loadDraftPlan> extends Promise<infer R> ? R : never;
export type CreatePlanResult = ReturnType<typeof createPlan> extends Promise<infer R> ? R : never;
