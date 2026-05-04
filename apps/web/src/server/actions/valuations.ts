'use server';

import { revalidatePath } from 'next/cache';
import {
  computeIncrementalFairValueSchema,
  listValuationRunsSchema,
  requestValuationRunSchema,
  uuidSchema,
  type ComputeIncrementalFairValueInput,
  type ListValuationRunsInput,
  type RequestValuationRunInput,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server Action B5.3 — runValuation
 *
 * Workflow async :
 *  1. Permission check `valuations.run`
 *  2. Resolve hypothesisSetId (= dernier hypo du plan si non fourni)
 *  3. Vérifie qu'il y a bien un simulation_config pour ce hypothesis_set
 *  4. INSERT valuation_runs (status='QUEUED' default)
 *  5. invoke('compute-valuation', { run_id }) — ASYNC, ne pas await la réponse
 *     pour ne pas bloquer la Server Action (l'Edge a un timeout 60s, on
 *     veut juste mettre en file)
 *  6. logAuditEvent valuation.started
 *  7. Return { ok: true, runId } — le client lit le statut via Realtime
 *     (useValuationRunStatus B5.4)
 *
 * Sur erreur : INSERT échoué ou invoke KO → ok: false avec error message.
 * L'Edge Function gère elle-même les erreurs runtime (status='ERROR' en DB).
 */
export type RunValuationSuccess = { ok: true; runId: string };
export type RunValuationError = { ok: false; error: string };

export async function runValuation(
  planId: string,
  hypothesisSetId?: string,
): Promise<RunValuationSuccess | RunValuationError> {
  const planIdCheck = uuidSchema.safeParse(planId);
  if (!planIdCheck.success) {
    return { ok: false, error: 'plan_id invalide' };
  }
  if (hypothesisSetId !== undefined) {
    const check = uuidSchema.safeParse(hypothesisSetId);
    if (!check.success) return { ok: false, error: 'hypothesis_set_id invalide' };
  }

  const user = await requirePermission('valuations.run');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Resolve hypothesisSetId (= dernier si non fourni)
  let hypoId = hypothesisSetId;
  if (!hypoId) {
    const { data: lastHypo } = await supabase
      .from('hypothesis_sets')
      .select('id')
      .eq('plan_id', planIdCheck.data)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastHypo?.id) {
      return {
        ok: false,
        error: 'Aucun hypothesis_set trouvé pour ce plan. Créez-en un avant de valoriser.',
      };
    }
    hypoId = lastHypo.id;
  }

  // Vérif simulation_config présent (chaîne FK)
  const { data: simConfig } = await supabase
    .from('simulation_configs')
    .select('id')
    .eq('hypothesis_set_id', hypoId)
    .limit(1)
    .maybeSingle();
  if (!simConfig?.id) {
    return {
      ok: false,
      error: 'Aucun simulation_config rattaché à l’hypothesis_set. Créez-en un avant de valoriser.',
    };
  }

  // INSERT valuation_run en QUEUED (status default défini par migration 00016)
  const { data: run, error: insertError } = await supabase
    .from('valuation_runs')
    .insert({
      org_id: user.activeOrgId,
      plan_id: planIdCheck.data,
      simulation_config_id: simConfig.id,
      triggered_by: user.id,
      status: 'QUEUED',
    })
    .select('id')
    .single();

  if (insertError || !run) {
    return { ok: false, error: insertError?.message ?? 'Erreur création run' };
  }

  // Invoke Edge Function compute-valuation — best effort, on ne await pas le
  // résultat (l'Edge a son propre lifecycle avec timeout 60s ; le client lit
  // le statut via Realtime).
  const { error: invokeError } = await supabase.functions.invoke('compute-valuation', {
    body: { run_id: run.id },
  });

  if (invokeError) {
    // L'Edge Function peut elle-même avoir écrit un error_message spécifique
    // (try/catch interne) avant qu'on ne reçoive le non-2xx. On lit d'abord
    // ce qu'elle a écrit pour ne pas masquer la vraie cause par notre wrapper
    // générique « non-2xx status code ».
    const { data: existing } = await supabase
      .from('valuation_runs')
      .select('status, error_message')
      .eq('id', run.id)
      .maybeSingle();

    const edgeMessage = existing?.error_message ?? null;
    const finalMessage = edgeMessage ?? `Invoke compute-valuation échoué : ${invokeError.message}`;

    if (existing?.status !== 'ERROR') {
      await supabase
        .from('valuation_runs')
        .update({
          status: 'ERROR',
          error_message: finalMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id);
    }
    return { ok: false, error: finalMessage };
  }

  // Audit
  await logAuditEvent({
    eventType: 'valuation.started',
    resourceType: 'VALUATION_RUN',
    resourceId: run.id,
    metadata: { plan_id: planIdCheck.data, hypothesis_set_id: hypoId },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath(`/dashboard/plans/${planIdCheck.data}`);

  return { ok: true, runId: run.id };
}

export type RunValuationResult =
  ReturnType<typeof runValuation> extends Promise<infer R> ? R : never;

// =============================================================================
// Module 11 B2 — computeIncrementalFairValue (résolution dette #11)
// =============================================================================

export type ComputeIncrementalFairValueResult =
  | {
      ok: true;
      incrementalFairValue: number;
      fairValuePreUnit: number;
      fairValuePostUnit: number;
      unitsOutstanding: number;
    }
  | { ok: false; error: string };

/**
 * Calcule l'incremental fair value IFRS 2.27-28 sur une modification d'award
 * existante. Le caller fournit les 2 `valuation_run_id` (pre + post) déjà
 * calculés DONE — la SA orchestre la lecture des `valuation_award_results`,
 * le delta, et l'UPDATE des colonnes audit sur `award_modifications`.
 *
 * Approche V1.5 simplifiée : pas de re-call Python depuis la SA. La spec
 * MODULE_11 §3.4 visait un build payload Python + 2 calls directs, mais
 * `buildPythonPayload` vit côté Deno EF (`supabase/functions/_shared/`).
 * Son port Node sera livré en B5+ (refactor compute-valuation EF). Pour
 * la résolution effective de la dette #11 sans bloquer le module, V1
 * lit les résultats déjà calculés via le pipeline existant
 * (`apply_award_modification` RPC insère un valuation_run en QUEUED, le
 * cron / Edge Function le pricke, et `valuation_award_results` reçoit le
 * fair_value_per_unit).
 *
 * Workflow :
 *   1. requirePermission('valuations.run')
 *   2. Validation Zod + ownership check sur la modification
 *   3. SELECT fair_value_per_unit depuis valuation_award_results (× 2 runs)
 *   4. SELECT units_outstanding depuis awards (lié à la modification)
 *   5. delta = fv_post - fv_pre
 *   6. incrementalFV = delta * units_outstanding
 *   7. UPDATE award_modifications SET valuation_pre, valuation_post,
 *      incremental_fair_value, valuation_computed_at
 *   8. Audit `award_modifications.incremental_fv_computed`
 */
export async function computeIncrementalFairValue(
  input: ComputeIncrementalFairValueInput,
): Promise<ComputeIncrementalFairValueResult> {
  const parsed = computeIncrementalFairValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
  }
  const { modificationId, valuationRunIdPre, valuationRunIdPost } = parsed.data;

  const user = await requirePermission('valuations.run');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // 1. Charge la modification + l'award lié (units_outstanding)
  const { data: modification, error: modErr } = await supabase
    .from('award_modifications')
    .select('id, award_id, org_id, modification_type')
    .eq('id', modificationId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (modErr || !modification) {
    return { ok: false, error: 'Modification introuvable ou hors org' };
  }

  const { data: award, error: awardErr } = await supabase
    .from('awards')
    .select('id, units_outstanding')
    .eq('id', modification.award_id)
    .maybeSingle();

  if (awardErr || !award) {
    return { ok: false, error: 'Award lié à la modification introuvable' };
  }

  const unitsOutstanding = Number(award.units_outstanding ?? 0);
  if (unitsOutstanding <= 0) {
    return { ok: false, error: 'Award sans units_outstanding > 0 — calcul impossible' };
  }

  // 2. Charge les 2 valuation_award_results (pre + post)
  const [preRes, postRes] = await Promise.all([
    supabase
      .from('valuation_award_results')
      .select('fair_value_per_unit, valuation_run_id')
      .eq('valuation_run_id', valuationRunIdPre)
      .eq('award_id', modification.award_id)
      .eq('org_id', user.activeOrgId)
      .maybeSingle(),
    supabase
      .from('valuation_award_results')
      .select('fair_value_per_unit, valuation_run_id')
      .eq('valuation_run_id', valuationRunIdPost)
      .eq('award_id', modification.award_id)
      .eq('org_id', user.activeOrgId)
      .maybeSingle(),
  ]);

  if (preRes.error || !preRes.data) {
    return {
      ok: false,
      error: `Valuation pre-modification introuvable (run_id=${valuationRunIdPre})`,
    };
  }
  if (postRes.error || !postRes.data) {
    return {
      ok: false,
      error: `Valuation post-modification introuvable (run_id=${valuationRunIdPost})`,
    };
  }

  const fvPre = Number(preRes.data.fair_value_per_unit);
  const fvPost = Number(postRes.data.fair_value_per_unit);
  if (!Number.isFinite(fvPre) || !Number.isFinite(fvPost)) {
    return { ok: false, error: 'fair_value_per_unit invalide dans valuation_award_results' };
  }

  const delta = fvPost - fvPre;
  const incrementalFV = delta * unitsOutstanding;

  // 3. UPDATE award_modifications avec audit colonnes
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('award_modifications')
    .update({
      valuation_pre_modification: fvPre,
      valuation_post_modification: fvPost,
      incremental_fair_value: incrementalFV,
      valuation_computed_at: nowIso,
    })
    .eq('id', modificationId)
    .eq('org_id', user.activeOrgId);

  if (updateErr) {
    return { ok: false, error: `UPDATE award_modifications échoué: ${updateErr.message}` };
  }

  // 4. Audit log
  await logAuditEvent({
    eventType: 'award_modifications.incremental_fv_computed',
    resourceType: 'award_modifications',
    resourceId: modificationId,
    metadata: {
      modification_type: modification.modification_type,
      valuation_run_id_pre: valuationRunIdPre,
      valuation_run_id_post: valuationRunIdPost,
      fair_value_pre: fvPre,
      fair_value_post: fvPost,
      delta,
      units_outstanding: unitsOutstanding,
      incremental_fair_value: incrementalFV,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath(`/dashboard/awards/${modification.award_id}`);

  return {
    ok: true,
    incrementalFairValue: incrementalFV,
    fairValuePreUnit: fvPre,
    fairValuePostUnit: fvPost,
    unitsOutstanding,
  };
}

// =============================================================================
// Module 11 B5 — requestValuationRun / listValuationRuns / getValuationRunById
// =============================================================================

export type RequestValuationRunResult =
  | { ok: true; runId: string; includesVisualization: boolean }
  | { ok: false; error: string };

/**
 * Server Action B5 — Demande un nouveau valuation_run, avec les options
 * Module 11 (includeVisualization, numPaths, numTimeSteps, seed).
 *
 * Différences vs `runValuation` legacy :
 *   - Input typé via Zod (`requestValuationRunSchema`)
 *   - Persiste `includes_visualization` ET `run_type='MANUAL'` (default
 *     migration 00092 mais set explicit pour traçabilité audit)
 *   - Override les overrides simulation_config (numPaths, numTimeSteps, seed)
 *     via `valuation_runs.parameters` jsonb — l'EF priorisera ces overrides
 *     dans une V1.5 (V1 utilise simulation_config par plan).
 *
 * Workflow :
 *   1. Permission `valuations.run`
 *   2. Validation Zod
 *   3. Resolve hypothesis_set (le plus récent du plan)
 *   4. Resolve simulation_config (chaîné depuis hypo)
 *   5. INSERT QUEUED + flag includes_visualization + parameters
 *   6. invoke('compute-valuation', { run_id })
 *   7. Audit valuation.requested
 *   8. revalidate /dashboard/plans/[id]/valuation
 */
export async function requestValuationRun(
  input: RequestValuationRunInput,
): Promise<RequestValuationRunResult> {
  const parsed = requestValuationRunSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
  }
  const { planId, includeVisualization, numPaths, numTimeSteps, seed } = parsed.data;

  const user = await requirePermission('valuations.run');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: lastHypo } = await supabase
    .from('hypothesis_sets')
    .select('id')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastHypo?.id) {
    return {
      ok: false,
      error: 'Aucun hypothesis_set trouvé pour ce plan. Créez-en un avant de valoriser.',
    };
  }

  const { data: simConfig } = await supabase
    .from('simulation_configs')
    .select('id')
    .eq('hypothesis_set_id', lastHypo.id)
    .limit(1)
    .maybeSingle();
  if (!simConfig?.id) {
    return {
      ok: false,
      error: 'Aucun simulation_config rattaché à l’hypothesis_set.',
    };
  }

  const { data: run, error: insertError } = await supabase
    .from('valuation_runs')
    .insert({
      org_id: user.activeOrgId,
      plan_id: planId,
      simulation_config_id: simConfig.id,
      triggered_by: user.id,
      status: 'QUEUED',
      includes_visualization: includeVisualization,
      run_type: 'MANUAL',
      parameters: {
        num_paths: numPaths,
        num_time_steps: numTimeSteps,
        ...(seed !== undefined ? { seed } : {}),
        include_visualization: includeVisualization,
      },
    })
    .select('id')
    .single();

  if (insertError || !run) {
    return { ok: false, error: insertError?.message ?? 'Erreur création run' };
  }

  const { error: invokeError } = await supabase.functions.invoke('compute-valuation', {
    body: { run_id: run.id },
  });

  if (invokeError) {
    const { data: existing } = await supabase
      .from('valuation_runs')
      .select('status, error_message')
      .eq('id', run.id)
      .maybeSingle();

    const edgeMessage = existing?.error_message ?? null;
    const finalMessage = edgeMessage ?? `Invoke compute-valuation échoué : ${invokeError.message}`;

    if (existing?.status !== 'ERROR') {
      await supabase
        .from('valuation_runs')
        .update({
          status: 'ERROR',
          error_message: finalMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id);
    }
    return { ok: false, error: finalMessage };
  }

  await logAuditEvent({
    eventType: 'valuation.requested',
    resourceType: 'VALUATION_RUN',
    resourceId: run.id,
    metadata: {
      plan_id: planId,
      hypothesis_set_id: lastHypo.id,
      include_visualization: includeVisualization,
      num_paths: numPaths,
      num_time_steps: numTimeSteps,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath(`/dashboard/plans/${planId}/valuation`);
  revalidatePath(`/dashboard/plans/${planId}`);

  return { ok: true, runId: run.id, includesVisualization: includeVisualization };
}

export type ValuationRunListItem = {
  id: string;
  planId: string | null;
  planName: string | null;
  status: string;
  runType: string;
  pricerUsed: string | null;
  engineVersion: string | null;
  includesVisualization: boolean;
  triggeredBy: string | null;
  triggeredByEmail: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  fairValuePerUnit: number | null;
};

export type ListValuationRunsResult =
  | { ok: true; runs: ValuationRunListItem[]; total: number }
  | { ok: false; error: string };

/**
 * Server Action B5 — Liste paginée des valuation_runs de l'org active,
 * jointe sur plans (pour le nom) et user_profiles (pour l'email du
 * triggered_by). Filtres optionnels par plan / status / run_type / viz.
 *
 * SELECT joints :
 *   - plans (plan_name) via FK plan_id
 *   - user_profiles (email) via FK triggered_by → auth.users.id, le profile
 *     est lookuppé par id == auth user id.
 *   - valuation_results (fair_value_per_instrument) — un seul row par run
 *     attendu en V1.
 */
export async function listValuationRuns(
  input: ListValuationRunsInput = {},
): Promise<ListValuationRunsResult> {
  const parsed = listValuationRunsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
  }
  const { planId, status, runType, includesVisualization, limit, offset } = parsed.data;

  const user = await requirePermission('valuations.read');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('valuation_runs')
    .select(
      'id, plan_id, status, run_type, pricer_used, engine_version, includes_visualization, triggered_by, started_at, completed_at, created_at, error_message, plans!valuation_runs_plan_id_fkey ( name ), valuation_results ( fair_value_per_instrument )',
      { count: 'exact' },
    )
    .eq('org_id', user.activeOrgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (planId) query = query.eq('plan_id', planId);
  if (status) query = query.eq('status', status);
  if (runType) query = query.eq('run_type', runType);
  if (includesVisualization !== undefined)
    query = query.eq('includes_visualization', includesVisualization);

  const { data, error, count } = await query;
  if (error) return { ok: false, error: error.message };

  const triggeredByIds = Array.from(
    new Set((data ?? []).map((r) => r.triggered_by).filter((v): v is string => !!v)),
  );

  const emailById = new Map<string, string>();
  if (triggeredByIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email')
      .in('id', triggeredByIds);
    for (const p of profiles ?? []) {
      if (p.email) emailById.set(p.id, p.email);
    }
  }

  const runs: ValuationRunListItem[] = (data ?? []).map((r) => {
    const plansJoin = r.plans as { name: string | null } | null;
    const resultsJoin = r.valuation_results as Array<{
      fair_value_per_instrument: number | null;
    }> | null;
    const fv =
      Array.isArray(resultsJoin) && resultsJoin.length > 0
        ? (resultsJoin[0]?.fair_value_per_instrument ?? null)
        : null;
    return {
      id: r.id,
      planId: r.plan_id,
      planName: plansJoin?.name ?? null,
      status: r.status ?? 'QUEUED',
      runType: r.run_type ?? 'MANUAL',
      pricerUsed: r.pricer_used,
      engineVersion: r.engine_version,
      includesVisualization: r.includes_visualization === true,
      triggeredBy: r.triggered_by,
      triggeredByEmail: r.triggered_by ? (emailById.get(r.triggered_by) ?? null) : null,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      errorMessage: r.error_message,
      fairValuePerUnit: fv != null ? Number(fv) : null,
    };
  });

  return { ok: true, runs, total: count ?? runs.length };
}

export type ValuationRunDetail = ValuationRunListItem & {
  inputHash: string | null;
  parameters: Record<string, unknown> | null;
  payloadSent: Record<string, unknown> | null;
  responseReceived: Record<string, unknown> | null;
  results: {
    fairValuePerInstrument: number | null;
    stdError: number | null;
    ci95Low: number | null;
    ci95High: number | null;
    sensitivities: Record<string, number> | null;
    distributionStats: Record<string, unknown> | null;
  } | null;
};

export type GetValuationRunByIdResult =
  | { ok: true; run: ValuationRunDetail }
  | { ok: false; error: string };

/**
 * Server Action B5 — Charge le détail complet d'un valuation_run pour la
 * page /dashboard/valuation/runs/[id] (replay viewer Monte Carlo).
 *
 * Retourne :
 *   - les colonnes du run (status, parameters, payload_sent, response_received,
 *     hash, run_type, etc.)
 *   - la jointure valuation_results (fv, stderr, sensitivities, distribution)
 *   - le plan_name + l'email de l'auteur
 *
 * RLS : valuation_runs SELECT requires `plans.read`. Si l'utilisateur n'a
 * pas la perm, le maybeSingle retourne null → 404.
 */
export async function getValuationRunById(runId: string): Promise<GetValuationRunByIdResult> {
  const parsed = uuidSchema.safeParse(runId);
  if (!parsed.success) return { ok: false, error: 'run_id invalide' };

  const user = await requirePermission('valuations.read');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: run, error } = await supabase
    .from('valuation_runs')
    .select(
      'id, plan_id, status, run_type, pricer_used, engine_version, input_hash, includes_visualization, triggered_by, started_at, completed_at, created_at, error_message, parameters, payload_sent, response_received, plans!valuation_runs_plan_id_fkey ( name )',
    )
    .eq('id', parsed.data)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!run) return { ok: false, error: 'Run introuvable ou accès refusé' };

  const { data: results } = await supabase
    .from('valuation_results')
    .select(
      'fair_value_per_instrument, std_error, ci95_low, ci95_high, sensitivities, distribution_stats',
    )
    .eq('valuation_run_id', run.id)
    .maybeSingle();

  let triggeredByEmail: string | null = null;
  if (run.triggered_by) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', run.triggered_by)
      .maybeSingle();
    triggeredByEmail = profile?.email ?? null;
  }

  const plansJoin = run.plans as { name: string | null } | null;
  const fvForList = results?.fair_value_per_instrument ?? null;

  const detail: ValuationRunDetail = {
    id: run.id,
    planId: run.plan_id,
    planName: plansJoin?.name ?? null,
    status: run.status ?? 'QUEUED',
    runType: run.run_type ?? 'MANUAL',
    pricerUsed: run.pricer_used,
    engineVersion: run.engine_version,
    includesVisualization: run.includes_visualization === true,
    triggeredBy: run.triggered_by,
    triggeredByEmail,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    createdAt: run.created_at,
    errorMessage: run.error_message,
    fairValuePerUnit: fvForList != null ? Number(fvForList) : null,
    inputHash: run.input_hash,
    parameters: (run.parameters ?? null) as Record<string, unknown> | null,
    payloadSent: (run.payload_sent ?? null) as Record<string, unknown> | null,
    responseReceived: (run.response_received ?? null) as Record<string, unknown> | null,
    results: results
      ? {
          fairValuePerInstrument:
            results.fair_value_per_instrument != null
              ? Number(results.fair_value_per_instrument)
              : null,
          stdError: results.std_error != null ? Number(results.std_error) : null,
          ci95Low: results.ci95_low != null ? Number(results.ci95_low) : null,
          ci95High: results.ci95_high != null ? Number(results.ci95_high) : null,
          sensitivities: (results.sensitivities ?? null) as Record<string, number> | null,
          distributionStats: (results.distribution_stats ?? null) as Record<string, unknown> | null,
        }
      : null,
  };

  return { ok: true, run: detail };
}
