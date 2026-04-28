import 'server-only';
import type { Json } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server queries pour les plans (lectures, pas de mutations).
 *
 * Toutes les queries utilisent `createSupabaseServerClient` (= anon key
 * + cookies user) → soumis aux RLS du Module 1 §6.4 :
 *   - SELECT plans          → org_id = current_org_id() + plans.read
 *   - SELECT vesting_*      → idem (templates org_id NULL aussi accessibles)
 *   - SELECT performance_*  → idem
 *   - SELECT early_term_*   → idem
 *   - SELECT hypothesis_*   → idem
 *
 * Donc le user ne voit que les plans de son org active. Pas besoin de
 * vérifications redondantes côté code.
 */

// ---------------------------------------------------------------------------
// Types — version dérivée de Database['public']['Tables'] enrichie pour
// l'usage UI (badges, statuts, JOINs).
// ---------------------------------------------------------------------------

export type PlanListFilters = {
  search?: string;
  /** Statut(s) à inclure. Vide ou undefined = tous. */
  status?: string[];
  /** Type(s) de plan à inclure. Vide ou undefined = tous. */
  planType?: string[];
};

export type PlanListRow = {
  id: string;
  name: string;
  description: string | null;
  plan_type: string;
  status: string;
  pool_size: number;
  pool_allocated: number;
  pool_vested: number;
  exercise_price: number | null;
  board_date: string | null;
  grant_date: string;
  is_locked: boolean;
  version: number;
  created_at: string;
  company: { id: string; name: string } | null;
};

export type PlanDetail = {
  plan: {
    id: string;
    name: string;
    description: string | null;
    plan_type: string;
    settlement_type: string;
    status: string;
    version: number;
    is_locked: boolean;
    pool_size: number;
    pool_allocated: number;
    pool_vested: number;
    pool_exercised: number;
    pool_cancelled: number;
    exercise_price: number | null;
    reference_share_price: number | null;
    board_date: string | null;
    grant_date: string;
    shareholder_meeting_date: string | null;
    shareholder_authorization_expires_at: string | null;
    performance_combination_type: string;
    performance_evaluation_moment: string;
    performance_failure_action: string;
    parent_plan_id: string | null;
    compliance_warnings: Json;
    created_at: string;
    updated_at: string;
    created_by: string | null;
  };
  company: { id: string; name: string; country_code: string; ticker: string | null } | null;
  vestingSchedule: {
    id: string;
    vesting_type: string | null;
    cliff_months: number | null;
    cliff_percentage: number | null;
    total_months: number | null;
    frequency: string | null;
    linear_after_cliff: boolean | null;
    single_vesting_date: string | null;
    tranches: Array<{
      id: string;
      sort_order: number;
      vesting_date: string;
      percentage_of_award: number;
    }>;
  } | null;
  conditions: Array<{
    id: string;
    name: string | null;
    condition_type: string | null;
    category: string | null;
    weight: number | null;
    enable_partial_scoring: boolean;
    metric: string | null;
    target_value: string | null;
    target_unit: string | null;
    comparison_operator: string | null;
    threshold_min: number | null;
    threshold_max: number | null;
    market_metric_type: string | null;
    reference_index: string | null;
    reference_index_display_name: string | null;
    comparison_method: string | null;
    measurement_period_years: number | null;
    performance_start_date: string | null;
    performance_end_date: string | null;
    start_price_method: string | null;
    end_price_method: string | null;
    start_fixed_price: number | null;
    end_fixed_price: number | null;
    start_averaging_days: number | null;
    end_averaging_days: number | null;
    peer_group: Json;
    weighted_peer_groups: Json;
    acquisition_scale: Json;
  }>;
  leavers: Array<{
    id: string;
    leaver_type: string;
    treatment: string;
    acceleration_months: number | null;
    exercise_window_days: number | null;
  }>;
  hypothesisSets: Array<{
    id: string;
    as_of_date: string | null;
    s0: number | null;
    rate_flat: number | null;
    dividend_yield: number | null;
    vol_method: string | null;
    ticker_override: string | null;
    currency: string | null;
    volatility: number | null;
    underlying_model: string | null;
    model_choice: string | null;
    time_horizon_years: number | null;
    created_at: string;
  }>;
  valuationRuns: Array<{
    id: string;
    status: string | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    created_at: string;
  }>;
  /**
   * Dernière valorisation aboutie (status='DONE') avec son résultat joint.
   * `null` si aucune valorisation n'a encore été lancée ou aucune n'a réussi.
   * Utilisé par la card « Valorisation » de l'onglet Synthèse pour afficher
   * la juste-valeur sans avoir à charger la page détail B5.5 dédiée.
   */
  latestValuation: {
    runId: string;
    completedAt: string | null;
    pricerUsed: string | null;
    engineVersion: string | null;
    fairValuePerInstrument: number | null;
    fairValueTotal: number | null;
    stdError: number | null;
    ci95Low: number | null;
    ci95High: number | null;
  } | null;
  versions: Array<{
    id: string;
    version: number;
    name: string;
    status: string;
    created_at: string;
  }>;
};

// ---------------------------------------------------------------------------
// listPlans — utilisé par /dashboard/plans (page liste)
// ---------------------------------------------------------------------------

const PLAN_LIST_SELECT = `
  id, name, description, plan_type, status, pool_size, pool_allocated, pool_vested,
  exercise_price, board_date, grant_date, is_locked, version, created_at,
  company:companies!plans_company_id_fkey ( id, name )
`;

export async function listPlans(filters: PlanListFilters = {}): Promise<PlanListRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('plans')
    .select(PLAN_LIST_SELECT)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }
  if (filters.planType && filters.planType.length > 0) {
    query = query.in('plan_type', filters.planType);
  }
  if (filters.search && filters.search.trim().length > 0) {
    // ilike: case-insensitive partial match — compatible RLS et indexes B-tree
    // (le user ne devrait pas avoir besoin de full-text pour la V1)
    const safeSearch = filters.search.trim().replace(/[%_]/g, '');
    query = query.ilike('name', `%${safeSearch}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    plan_type: row.plan_type,
    status: row.status,
    pool_size: row.pool_size,
    pool_allocated: row.pool_allocated,
    pool_vested: row.pool_vested,
    exercise_price: row.exercise_price,
    board_date: row.board_date,
    grant_date: row.grant_date,
    is_locked: row.is_locked,
    version: row.version,
    created_at: row.created_at,
    company: row.company ? { id: row.company.id, name: row.company.name } : null,
  }));
}

// ---------------------------------------------------------------------------
// getPlanDetails — utilisé par /dashboard/plans/[id] (page détail 8 onglets)
//
// Pas de single mega-JOIN : 6 queries parallélisées via Promise.all. Plus
// lisible + moins de risque de cartesien sur les arrays (vesting_tranches
// par schedule, multiples conditions, etc.). Coût latence ≈ max(query)
// car parallèle, négligeable en V1.
// ---------------------------------------------------------------------------

export async function getPlanDetails(planId: string): Promise<PlanDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('*, company:companies!plans_company_id_fkey ( id, name, country_code, ticker )')
    .eq('id', planId)
    .is('deleted_at', null)
    .maybeSingle();

  if (planError || !plan) return null;

  // 7 queries parallèles (sub-requêtes du detail)
  const [
    vestingResult,
    conditionsResult,
    leaversResult,
    hypoResult,
    runsResult,
    versionsResult,
    latestValuationResult,
  ] = await Promise.all([
    supabase
      .from('vesting_schedules')
      .select(
        'id, vesting_type, cliff_months, cliff_percentage, total_months, frequency, linear_after_cliff, single_vesting_date, vesting_tranches ( id, sort_order, vesting_date, percentage_of_award )',
      )
      .eq('plan_id', planId)
      .maybeSingle(),
    supabase
      .from('performance_conditions')
      .select(
        'id, name, condition_type, category, weight, enable_partial_scoring, metric, target_value, target_unit, comparison_operator, threshold_min, threshold_max, market_metric_type, reference_index, reference_index_display_name, comparison_method, measurement_period_years, performance_start_date, performance_end_date, start_price_method, end_price_method, start_fixed_price, end_fixed_price, start_averaging_days, end_averaging_days, peer_group, weighted_peer_groups, acquisition_scale',
      )
      .eq('plan_id', planId)
      .order('weight', { ascending: false, nullsFirst: false }),
    supabase
      .from('early_termination_rules')
      .select('id, leaver_type, treatment, acceleration_months, exercise_window_days')
      .eq('plan_id', planId)
      .order('leaver_type', { ascending: true }),
    supabase
      .from('hypothesis_sets')
      .select(
        'id, as_of_date, s0, rate_flat, dividend_yield, vol_method, ticker_override, currency, volatility, underlying_model, model_choice, time_horizon_years, created_at',
      )
      .eq('plan_id', planId)
      .order('created_at', { ascending: false }),
    supabase
      .from('valuation_runs')
      .select('id, status, started_at, completed_at, error_message, created_at')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false })
      .limit(20),
    // Versions : tous les plans avec le même parent_plan_id (lineage)
    // ou ce plan lui-même + ceux dont parent_plan_id = ce plan.
    // V1 : seulement le plan courant (lineage arrive en B3 quand
    // duplicatePlan créera des versions).
    supabase
      .from('plans')
      .select('id, version, name, status, created_at')
      .or(`id.eq.${planId},parent_plan_id.eq.${planId}`)
      .is('deleted_at', null)
      .order('version', { ascending: false }),
    // Dernière valorisation DONE + son résultat joint, pour affichage
    // direct sur l'onglet Synthèse sans avoir à attendre B5.5.
    supabase
      .from('valuation_runs')
      .select(
        'id, completed_at, pricer_used, engine_version, valuation_results ( fair_value_per_instrument, fair_value_total, std_error, ci95_low, ci95_high )',
      )
      .eq('plan_id', planId)
      .eq('status', 'DONE')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const vesting = vestingResult.data;
  const conditions = conditionsResult.data ?? [];
  const leavers = leaversResult.data ?? [];
  const hypothesisSets = hypoResult.data ?? [];
  const valuationRuns = runsResult.data ?? [];
  const versions = versionsResult.data ?? [];

  // valuation_results est un array (relation 1:N côté Supabase) — on prend
  // le premier élément, qui est l'unique résultat associé à ce run DONE.
  const latestRun = latestValuationResult.data;
  const latestResultRow = Array.isArray(latestRun?.valuation_results)
    ? latestRun.valuation_results[0]
    : (latestRun?.valuation_results ?? null);
  const latestValuation = latestRun
    ? {
        runId: latestRun.id,
        completedAt: latestRun.completed_at,
        pricerUsed: latestRun.pricer_used,
        engineVersion: latestRun.engine_version,
        fairValuePerInstrument: latestResultRow?.fair_value_per_instrument ?? null,
        fairValueTotal: latestResultRow?.fair_value_total ?? null,
        stdError: latestResultRow?.std_error ?? null,
        ci95Low: latestResultRow?.ci95_low ?? null,
        ci95High: latestResultRow?.ci95_high ?? null,
      }
    : null;

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      plan_type: plan.plan_type,
      settlement_type: plan.settlement_type,
      status: plan.status,
      version: plan.version,
      is_locked: plan.is_locked,
      pool_size: plan.pool_size,
      pool_allocated: plan.pool_allocated,
      pool_vested: plan.pool_vested,
      pool_exercised: plan.pool_exercised,
      pool_cancelled: plan.pool_cancelled,
      exercise_price: plan.exercise_price,
      reference_share_price: plan.reference_share_price,
      board_date: plan.board_date,
      grant_date: plan.grant_date,
      shareholder_meeting_date: plan.shareholder_meeting_date,
      shareholder_authorization_expires_at: plan.shareholder_authorization_expires_at,
      performance_combination_type: plan.performance_combination_type,
      performance_evaluation_moment: plan.performance_evaluation_moment,
      performance_failure_action: plan.performance_failure_action,
      parent_plan_id: plan.parent_plan_id,
      compliance_warnings: plan.compliance_warnings,
      created_at: plan.created_at,
      updated_at: plan.updated_at,
      created_by: plan.created_by,
    },
    company: plan.company
      ? {
          id: plan.company.id,
          name: plan.company.name,
          country_code: plan.company.country_code,
          ticker: plan.company.ticker,
        }
      : null,
    vestingSchedule: vesting
      ? {
          id: vesting.id,
          vesting_type: vesting.vesting_type,
          cliff_months: vesting.cliff_months,
          cliff_percentage: vesting.cliff_percentage,
          total_months: vesting.total_months,
          frequency: vesting.frequency,
          linear_after_cliff: vesting.linear_after_cliff,
          single_vesting_date: vesting.single_vesting_date,
          tranches: (vesting.vesting_tranches ?? [])
            .map((t) => ({
              id: t.id,
              sort_order: t.sort_order,
              vesting_date: t.vesting_date,
              percentage_of_award: t.percentage_of_award,
            }))
            .sort((a, b) => a.sort_order - b.sort_order),
        }
      : null,
    conditions,
    leavers,
    hypothesisSets,
    valuationRuns,
    latestValuation,
    versions,
  };
}
