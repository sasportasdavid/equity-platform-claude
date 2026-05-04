'use server';

import { revalidatePath } from 'next/cache';
import {
  computeIncrementalFairValueSchema,
  uuidSchema,
  type ComputeIncrementalFairValueInput,
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
