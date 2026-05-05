import 'server-only';
import type { Json } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server queries pour les valuation_runs (lectures, pas de mutations).
 *
 * Toutes les queries utilisent `createSupabaseServerClient` (cookies user) →
 * RLS Pattern 1 (org_id + permission `valuations.read`) côté DB filtre
 * automatiquement à l'org active de l'utilisateur.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValuationDetail = {
  run: {
    id: string;
    planId: string;
    status: string | null;
    pricerUsed: string | null;
    engineVersion: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    errorMessage: string | null;
    triggeredBy: string | null;
    /** B0.5 — utilisé par la page legacy pour rediriger vers /dashboard/valuations/runs/[runId] (MonteCarloViewer Module 11) si le run inclut le bloc visualization. */
    includesVisualization: boolean;
  };
  /** Résultat associé — null si run pas encore DONE ou ERROR. */
  result: {
    id: string;
    fairValuePerInstrument: number | null;
    fairValueTotal: number | null;
    stdError: number | null;
    ci95Low: number | null;
    ci95High: number | null;
    /** Greeks si compute_greeks=true côté payload (sinon null en V1). */
    sensitivities: Json;
    /** Snapshot des inputs marché au moment du calcul (audit trail). */
    marketDataSnapshot: Json;
    /** Tout le JSONB distribution_stats (debug_paths, tranche_details, etc.). */
    distributionStats: Json;
    auditData: Json;
    computedAt: string;
  } | null;
  /** Métadonnées plan utiles pour breadcrumb / titre de page. */
  plan: {
    id: string;
    name: string;
    planType: string;
  } | null;
};

/**
 * Charge un run + son résultat (1:1) + métadonnées plan.
 *
 * Retourne null si le run n'existe pas, n'est pas dans l'org active de
 * l'utilisateur (RLS), ou si le plan associé est soft-deleted.
 */
export async function getValuationDetail(runId: string): Promise<ValuationDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: run, error } = await supabase
    .from('valuation_runs')
    .select(
      `
      id, plan_id, status, pricer_used, engine_version,
      started_at, completed_at, created_at, error_message, triggered_by,
      includes_visualization,
      plan:plans!valuation_runs_plan_id_fkey ( id, name, plan_type, deleted_at ),
      valuation_results ( id, fair_value_per_instrument, fair_value_total, std_error, ci95_low, ci95_high, sensitivities, market_data_snapshot, distribution_stats, audit_data, computed_at )
    `,
    )
    .eq('id', runId)
    .maybeSingle();

  if (error || !run) return null;

  // Plan soft-deleted ou run orphelin sans plan_id → on n'affiche pas
  if (!run.plan || run.plan.deleted_at || !run.plan_id) return null;

  // valuation_results est un array (relation 1:N côté Supabase mais 0/1 côté
  // métier — il y a au plus 1 résultat par run). On prend le premier.
  const resultRow = Array.isArray(run.valuation_results)
    ? run.valuation_results[0]
    : (run.valuation_results ?? null);

  return {
    run: {
      id: run.id,
      planId: run.plan_id,
      status: run.status,
      pricerUsed: run.pricer_used,
      engineVersion: run.engine_version,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      createdAt: run.created_at,
      errorMessage: run.error_message,
      triggeredBy: run.triggered_by,
      includesVisualization: run.includes_visualization === true,
    },
    result: resultRow
      ? {
          id: resultRow.id,
          fairValuePerInstrument: resultRow.fair_value_per_instrument,
          fairValueTotal: resultRow.fair_value_total,
          stdError: resultRow.std_error,
          ci95Low: resultRow.ci95_low,
          ci95High: resultRow.ci95_high,
          sensitivities: resultRow.sensitivities,
          marketDataSnapshot: resultRow.market_data_snapshot,
          distributionStats: resultRow.distribution_stats,
          auditData: resultRow.audit_data,
          computedAt: resultRow.computed_at,
        }
      : null,
    plan: {
      id: run.plan.id,
      name: run.plan.name,
      planType: run.plan.plan_type,
    },
  };
}
