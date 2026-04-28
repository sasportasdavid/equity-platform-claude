'use server';

import { revalidatePath } from 'next/cache';
import { uuidSchema } from '@equity/shared';
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
    // L'Edge Function n'a pas démarré — on marque le run en ERROR pour
    // éviter qu'il reste QUEUED indéfiniment.
    await supabase
      .from('valuation_runs')
      .update({
        status: 'ERROR',
        error_message: `Invoke compute-valuation échoué : ${invokeError.message}`,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return { ok: false, error: `Edge Function inaccessible : ${invokeError.message}` };
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
