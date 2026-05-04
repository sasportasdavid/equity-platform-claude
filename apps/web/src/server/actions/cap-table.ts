'use server';

/**
 * Module 10 B2 — Server Actions cap-table CRUD
 *
 * 5 actions livrées (B2 scope) :
 *   - createShareClass        (perm captable.share_class.create)
 *   - updateShareClass        (perm captable.share_class.update)
 *   - deactivateShareClass    (perm captable.share_class.deactivate)
 *   - createFundingRound      (perm captable.round.create)
 *   - cancelFundingRound      (perm captable.round.cancel)
 *
 * Pattern Result `{ ok: true, ...data } | { ok: false, error: string }`.
 * Validation Zod systématique.
 * Audit via `logAuditEvent` (cf erratum spec : pas de trigger DB).
 *
 * Permissions :
 *   - Toutes les actions checkent via `requirePermission('captable.X.Y')`
 *     qui s'appuie sur la fonction DB `has_permission(perm)` (alias =
 *     `user_has_permission(p_perm)`).
 *
 * Hook Module 5 createFundingRound :
 *   V1 minimal — pas de wiring complet workflow. Si l'org a un workflow
 *   nommé 'FUNDING_ROUND.create' avec scope 'funding_rounds.create',
 *   l'action retourne `{ ok: false, error: 'Workflow approval requis V2' }`
 *   (passthrough). Sinon : INSERT direct via RPC create_funding_round.
 *   V2 (Module 12) = vrai routage approval.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  bulkImportPositionsSchema,
  cancelFundingRoundSchema,
  createFundingRoundSchema,
  createManualSnapshotSchema,
  createScenarioSchema,
  createShareClassSchema,
  deleteSnapshotSchema,
  freezeSnapshotSchema,
  updateShareClassSchema,
  uuidSchema,
  type BulkImportPositionsInput,
  type CancelFundingRoundInput,
  type CreateFundingRoundInput,
  type CreateManualSnapshotInput,
  type CreateScenarioInput,
  type CreateShareClassInput,
  type ImportPositionRowInput,
  type UpdateShareClassInput,
} from '@equity/shared';
import type { TablesUpdate } from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type ActionOk<T> = { ok: true } & T;
type ActionVoid = { ok: true };
type ActionError = { ok: false; error: string; validationIssues?: number };

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: err.issues[0]?.message ?? `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ============================================================================
// SHARE CLASSES
// ============================================================================

/**
 * Crée une nouvelle classe d'actions.
 *
 * Erreurs possibles :
 *  - validation Zod (CHECK pool_only_for_esop, code regex, etc.)
 *  - 23505 unique violation (code déjà existant pour cet org)
 *  - 23514 check violation (la DB a son propre CHECK pool_only_for_esop)
 */
export async function createShareClass(
  input: CreateShareClassInput,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const parsed = createShareClassSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('captable.share_class.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from('share_classes')
    .insert({
      org_id: user.activeOrgId,
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      class_type: data.classType,
      par_value: data.parValue ?? null,
      liquidation_preference_multiple: data.liquidationPreferenceMultiple,
      liquidation_preference_type: data.liquidationPreferenceType ?? null,
      liquidation_preference_cap: data.liquidationPreferenceCap ?? null,
      conversion_ratio: data.conversionRatio,
      is_convertible_to_common: data.isConvertibleToCommon,
      anti_dilution_type: data.antiDilutionType,
      voting_rights_per_share: data.votingRightsPerShare,
      pool_total_units: data.poolTotalUnits ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !row) {
    if (error?.code === '23505') {
      return { ok: false, error: `Code "${data.code}" déjà utilisé dans l'organisation` };
    }
    return { ok: false, error: error?.message ?? "Erreur création classe d'actions" };
  }

  await logAuditEvent({
    eventType: 'captable.share_class_created',
    resourceType: 'share_classes',
    resourceId: row.id,
    metadata: {
      code: data.code,
      class_type: data.classType,
      pool_total_units: data.poolTotalUnits ?? null,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/captable');

  return { ok: true, id: row.id };
}

/**
 * Modifie une classe d'actions existante. Ne permet PAS de changer
 * `code` ni `class_type` (immutable une fois créée).
 *
 * Validation métier : si la classe a déjà des positions, refuser le
 * changement de paramètres économiques sensibles (par sécurité on
 * autorise quand même name/description en V1).
 */
export async function updateShareClass(
  id: string,
  input: UpdateShareClassInput,
): Promise<ActionVoid | ActionError> {
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'id invalide' };

  const parsed = updateShareClassSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('captable.share_class.update');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Charger l'existant pour audit + check appartenance org
  const { data: existing, error: existingErr } = await supabase
    .from('share_classes')
    .select('*')
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (existingErr || !existing) {
    return { ok: false, error: "Classe d'actions introuvable ou hors org" };
  }

  // Map camelCase → snake_case (typed via shared Database types)
  const update: TablesUpdate<'share_classes'> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.parValue !== undefined) update.par_value = data.parValue;
  if (data.liquidationPreferenceMultiple !== undefined)
    update.liquidation_preference_multiple = data.liquidationPreferenceMultiple;
  if (data.liquidationPreferenceType !== undefined)
    update.liquidation_preference_type = data.liquidationPreferenceType;
  if (data.liquidationPreferenceCap !== undefined)
    update.liquidation_preference_cap = data.liquidationPreferenceCap;
  if (data.conversionRatio !== undefined) update.conversion_ratio = data.conversionRatio;
  if (data.isConvertibleToCommon !== undefined)
    update.is_convertible_to_common = data.isConvertibleToCommon;
  if (data.antiDilutionType !== undefined) update.anti_dilution_type = data.antiDilutionType;
  if (data.votingRightsPerShare !== undefined)
    update.voting_rights_per_share = data.votingRightsPerShare;
  if (data.poolTotalUnits !== undefined) update.pool_total_units = data.poolTotalUnits;

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'Aucun champ à modifier' };
  }

  const { error: updErr } = await supabase
    .from('share_classes')
    .update(update)
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  await logAuditEvent({
    eventType: 'captable.share_class_updated',
    resourceType: 'share_classes',
    resourceId: idCheck.data,
    beforeState: existing as Record<string, unknown>,
    afterState: update,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/captable');

  return { ok: true };
}

/**
 * Désactive (soft-delete) une classe d'actions : `is_active = FALSE`.
 *
 * Compliance : refuse si la classe a des positions actives. Évite de
 * désactiver une classe qui détient encore des actions (cohérence
 * audit IFRS / CAC).
 */
export async function deactivateShareClass(id: string): Promise<ActionVoid | ActionError> {
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'id invalide' };

  const user = await requirePermission('captable.share_class.deactivate');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Vérifier qu'il n'y a pas de positions actives
  const { count, error: countErr } = await supabase
    .from('cap_table_positions')
    .select('id', { count: 'exact', head: true })
    .eq('share_class_id', idCheck.data)
    .eq('org_id', user.activeOrgId)
    .is('position_closed_at', null);

  if (countErr) {
    return { ok: false, error: countErr.message };
  }
  if (count !== null && count > 0) {
    return {
      ok: false,
      error: `Impossible de désactiver : ${count} position(s) active(s) sur cette classe`,
    };
  }

  const { error: updErr } = await supabase
    .from('share_classes')
    .update({ is_active: false })
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId);

  if (updErr) return { ok: false, error: updErr.message };

  await logAuditEvent({
    eventType: 'captable.share_class_deactivated',
    resourceType: 'share_classes',
    resourceId: idCheck.data,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/captable');

  return { ok: true };
}

// ============================================================================
// FUNDING ROUNDS
// ============================================================================

/**
 * Crée une levée de fonds atomique via le RPC `create_funding_round`.
 *
 * Hook Module 5 V1 minimal :
 *   - Si un workflow `funding_round.create` est attaché à l'org → reject
 *     avec message clair (V2 = vrai routage approval).
 *   - Sinon : INSERT direct via RPC (status=CLOSED).
 *
 * Atomicité : le RPC INSERT funding_rounds + N positions investisseurs +
 * materialize_snapshot + audit_event en transaction unique. Tout ou rien.
 *
 * Erreurs possibles :
 *  - validation Zod (cohérence sum(units)*price ≈ amount)
 *  - 42501 permission denied (caller n'a pas captable.round.create)
 *  - business : share_class introuvable, hors org, etc.
 */
export async function createFundingRound(
  input: CreateFundingRoundInput,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const parsed = createFundingRoundSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('captable.round.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Hook Module 5 V1 : vérif présence d'un workflow approval pour
  // funding_round.create. Pattern Module 5 = approval_workflows table
  // avec applies_to = 'FUNDING_ROUND_CREATE' (V2 — pas seedé V1).
  const { data: workflow } = await supabase
    .from('approval_workflows')
    .select('id, name')
    .eq('org_id', user.activeOrgId)
    .eq('applies_to', 'FUNDING_ROUND_CREATE')
    .eq('is_active', true)
    .maybeSingle();

  if (workflow) {
    // V1 : passthrough — on ne sait pas encore router via Module 5
    return {
      ok: false,
      error:
        'Un workflow approval est attaché à funding_rounds.create. ' +
        'Le routage Module 5 est V2 — créer la levée temporairement sans workflow ' +
        'ou désactiver le workflow.',
    };
  }

  // RPC create_funding_round (atomique : INSERT round + N positions +
  // materialize_snapshot + audit_event).
  const { data: roundId, error } = await supabase.rpc('create_funding_round', {
    p_org_id: user.activeOrgId,
    p_name: data.name,
    p_round_type: data.roundType,
    p_share_class_id: data.shareClassId,
    p_pre_money_valuation: data.preMoneyValuation,
    p_amount_raised: data.amountRaised,
    p_price_per_share: data.pricePerShare,
    p_investors: data.investors as never,
  });

  if (error || !roundId) {
    return { ok: false, error: error?.message ?? 'Erreur création levée' };
  }

  // Note : audit_events 'captable.round_created' est inséré PAR le RPC
  // (cohérent avec pattern Module 4-9 : RPC SECURITY DEFINER auto-audit).
  // On NE refait PAS un logAuditEvent côté Server Action pour éviter les
  // doublons.

  revalidatePath('/dashboard/captable');
  revalidatePath('/dashboard/captable/rounds');

  return { ok: true, id: roundId as string };
}

/**
 * Annule une levée DRAFT ou PENDING_APPROVAL.
 *
 * Refuse si status='CLOSED' (les positions sont déjà émises et un cancel
 * casserait le registre).
 */
export async function cancelFundingRound(
  input: CancelFundingRoundInput,
): Promise<ActionVoid | ActionError> {
  const parsed = cancelFundingRoundSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('captable.round.cancel');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Vérif état actuel
  const { data: round, error: loadErr } = await supabase
    .from('funding_rounds')
    .select('id, status, name')
    .eq('id', data.id)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (loadErr || !round) {
    return { ok: false, error: 'Levée introuvable ou hors org' };
  }
  if (round.status === 'CLOSED') {
    return {
      ok: false,
      error: "Impossible d'annuler une levée CLOSED (positions déjà émises)",
    };
  }
  if (round.status === 'CANCELLED') {
    return { ok: false, error: 'Levée déjà annulée' };
  }

  const { error: updErr } = await supabase
    .from('funding_rounds')
    .update({
      status: 'CANCELLED',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: data.reason,
    })
    .eq('id', data.id)
    .eq('org_id', user.activeOrgId);

  if (updErr) return { ok: false, error: updErr.message };

  await logAuditEvent({
    eventType: 'captable.round_cancelled',
    resourceType: 'funding_rounds',
    resourceId: data.id,
    metadata: {
      previous_status: round.status,
      name: round.name,
      reason: data.reason,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/captable');
  revalidatePath('/dashboard/captable/rounds');

  return { ok: true };
}

// ============================================================================
// SCENARIOS — Module 10 B4 (déterministes, pas Monte Carlo)
// ============================================================================

const RESULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Crée un scénario de dilution. Le résultat est calculé à la volée via
 * `compute_cap_table(p_scenario_id=...)` puis cached 24h dans
 * `result_cache`. La table `dilution_scenarios.parameters` est typée
 * via discriminated union Zod (NEW_ROUND / POOL_TOPUP / BULK_EXERCISE / EXIT).
 *
 * Note : aucune mutation des positions réelles. Le scénario est un objet
 * de calcul pur. `apply_scenario` (helper privé DB côté 00085) fait la
 * mutation in-memory uniquement quand `compute_cap_table` est appelé
 * avec `p_scenario_id`.
 */
export async function createScenario(
  input: CreateScenarioInput,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const parsed = createScenarioSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('captable.scenario.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from('dilution_scenarios')
    .insert({
      org_id: user.activeOrgId,
      name: data.name,
      description: data.description ?? null,
      scenario_type: data.parameters.scenarioType,
      parameters: data.parameters as never,
      base_snapshot_id: data.baseSnapshotId ?? null,
      base_asof_date: data.baseAsofDate ?? null,
      is_shared: data.isShared,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Erreur création scénario' };
  }

  await logAuditEvent({
    eventType: 'captable.scenario_created',
    resourceType: 'dilution_scenarios',
    resourceId: row.id,
    metadata: {
      name: data.name,
      scenario_type: data.parameters.scenarioType,
      is_shared: data.isShared,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/captable/scenarios');
  revalidatePath('/dashboard/captable');

  return { ok: true, id: row.id };
}

/**
 * Update partial d'un scénario (nom / description / is_shared / parameters).
 * Owner check via RLS (`created_by = auth.uid()`). Invalide `result_cache`
 * (set à NULL) pour que le prochain `runScenario` recompute.
 *
 * Si parameters change, `scenario_type` est mis à jour aussi (cohérence).
 */
export async function updateScenario(
  id: string,
  input: Partial<Pick<CreateScenarioInput, 'name' | 'description' | 'isShared' | 'parameters'>>,
): Promise<ActionVoid | ActionError> {
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'id invalide' };

  // Validation partielle — on accepte que les champs fournis
  if (
    input.name === undefined &&
    input.description === undefined &&
    input.isShared === undefined &&
    input.parameters === undefined
  ) {
    return { ok: false, error: 'Aucun champ à modifier' };
  }

  const user = await requirePermission('captable.scenario.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Vérif existence + ownership (RLS update_own l'enforce mais double-check)
  const { data: existing, error: loadErr } = await supabase
    .from('dilution_scenarios')
    .select('id, created_by, scenario_type, name')
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (loadErr || !existing) {
    return { ok: false, error: 'Scénario introuvable ou hors org' };
  }
  if (existing.created_by !== user.id) {
    return {
      ok: false,
      error: 'Seul le créateur du scénario peut le modifier',
    };
  }

  const update: TablesUpdate<'dilution_scenarios'> = {
    // Invalidation cache
    result_cache: null,
    result_computed_at: null,
  };
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.isShared !== undefined) update.is_shared = input.isShared;
  if (input.parameters !== undefined) {
    // Validation Zod sur le sous-schéma parameters
    const subParse = createScenarioSchema.shape.parameters.safeParse(input.parameters);
    if (!subParse.success) return validationError(subParse.error);
    update.parameters = subParse.data as never;
    update.scenario_type = subParse.data.scenarioType;
  }

  const { error: updErr } = await supabase
    .from('dilution_scenarios')
    .update(update)
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId);

  if (updErr) return { ok: false, error: updErr.message };

  await logAuditEvent({
    eventType: 'captable.scenario_updated',
    resourceType: 'dilution_scenarios',
    resourceId: idCheck.data,
    metadata: {
      previous_name: existing.name,
      previous_scenario_type: existing.scenario_type,
      changed_fields: Object.keys(update).filter(
        (k) => k !== 'result_cache' && k !== 'result_computed_at',
      ),
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath(`/dashboard/captable/scenarios/${idCheck.data}`);

  return { ok: true };
}

/**
 * Supprime un scénario. Owner check via RLS (`delete_own` policy 00084).
 */
export async function deleteScenario(id: string): Promise<ActionVoid | ActionError> {
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'id invalide' };

  const user = await requirePermission('captable.scenario.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: loadErr } = await supabase
    .from('dilution_scenarios')
    .select('id, created_by, name, scenario_type')
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (loadErr || !existing) {
    return { ok: false, error: 'Scénario introuvable ou hors org' };
  }
  if (existing.created_by !== user.id) {
    return { ok: false, error: 'Seul le créateur peut supprimer ce scénario' };
  }

  const { error: delErr } = await supabase
    .from('dilution_scenarios')
    .delete()
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId);

  if (delErr) return { ok: false, error: delErr.message };

  await logAuditEvent({
    eventType: 'captable.scenario_deleted',
    resourceType: 'dilution_scenarios',
    resourceId: idCheck.data,
    metadata: {
      name: existing.name,
      scenario_type: existing.scenario_type,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/captable/scenarios');

  return { ok: true };
}

/**
 * Exécute un scénario en appelant `compute_cap_table(p_scenario_id=id)`.
 * Cache le résultat 24h dans `result_cache`. Si le cache est encore frais,
 * on retourne directement la valeur cached sans re-call la RPC.
 *
 * Pattern : pas une lecture pure car écrit `result_cache` + `result_computed_at`.
 * Donc Server Action `'use server'` (pas dans `server/queries/`).
 */
export async function runScenario(
  id: string,
): Promise<ActionOk<{ result: unknown; cached: boolean }> | ActionError> {
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'id invalide' };

  const user = await requirePermission('captable.read.all');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: loadErr } = await supabase
    .from('dilution_scenarios')
    .select('id, result_cache, result_computed_at')
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (loadErr || !existing) {
    return { ok: false, error: 'Scénario introuvable ou hors org' };
  }

  // Cache 24h — si frais, retourne directement
  if (existing.result_cache && existing.result_computed_at) {
    const ageMs = Date.now() - new Date(existing.result_computed_at).getTime();
    if (ageMs < RESULT_CACHE_TTL_MS) {
      return { ok: true, result: existing.result_cache, cached: true };
    }
  }

  // Cache absent ou stale → re-run via RPC
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('compute_cap_table', {
    p_org_id: user.activeOrgId,
    p_asof_date: new Date().toISOString().slice(0, 10),
    p_scenario_id: idCheck.data,
    p_view_mode: 'PRO_FORMA',
  });

  if (rpcErr || !rpcResult) {
    return { ok: false, error: `compute_cap_table échoué: ${rpcErr?.message ?? 'unknown'}` };
  }

  // Persist cache (best-effort — si UPDATE fail, on retourne quand même le résultat)
  await supabase
    .from('dilution_scenarios')
    .update({
      result_cache: rpcResult as never,
      result_computed_at: new Date().toISOString(),
    })
    .eq('id', idCheck.data)
    .eq('org_id', user.activeOrgId);

  return { ok: true, result: rpcResult, cached: false };
}

// ============================================================================
// SNAPSHOTS (B6)
// ============================================================================

/**
 * Crée un snapshot manuel via RPC `materialize_snapshot` (SECURITY DEFINER).
 *
 * Si `isImmutable=true`, freeze immédiatement après matérialisation (2 RPCs
 * mais atomicité best-effort — si freeze fail, le snapshot existe en mutable
 * et l'erreur est remontée).
 *
 * `snapshot_type='MANUAL_FREEZE'` (cf CHECK constraint 00083).
 */
export async function createManualSnapshot(
  input: CreateManualSnapshotInput,
): Promise<ActionOk<{ id: string; isImmutable: boolean }> | ActionError> {
  const parsed = createManualSnapshotSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('captable.snapshot.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: snapshotId, error: rpcErr } = await supabase.rpc('materialize_snapshot', {
    p_org_id: user.activeOrgId,
    p_asof_date: data.asofDate,
    p_snapshot_type: 'MANUAL_FREEZE',
    p_triggered_by_round_id: undefined,
    p_label: data.label ?? undefined,
  });

  if (rpcErr || !snapshotId) {
    return {
      ok: false,
      error: `materialize_snapshot échoué: ${rpcErr?.message ?? 'unknown'}`,
    };
  }

  // Optionnel : freeze immédiat (admin client bypass RLS no_update — cf freezeSnapshot)
  if (data.isImmutable) {
    const admin = getSupabaseAdminClient();
    const { error: freezeErr } = await admin
      .from('cap_table_snapshots')
      .update({ is_immutable: true, updated_at: new Date().toISOString() })
      .eq('id', snapshotId as string)
      .eq('org_id', user.activeOrgId);
    if (freezeErr) {
      return {
        ok: false,
        error: `Snapshot créé mais freeze échoué: ${freezeErr.message}`,
      };
    }
  }

  await logAuditEvent({
    eventType: 'captable.snapshot_created_manual',
    resourceType: 'cap_table_snapshots',
    resourceId: snapshotId as string,
    metadata: {
      asof_date: data.asofDate,
      label: data.label ?? null,
      is_immutable: data.isImmutable,
    },
  });

  revalidatePath('/dashboard/captable/snapshots');
  revalidatePath('/dashboard/captable');
  return { ok: true, id: snapshotId as string, isImmutable: data.isImmutable };
}

/**
 * Freeze un snapshot existant (`is_immutable: false → true`).
 *
 * La RLS policy `snapshots_no_update` (00083) = `USING (FALSE)` bloque tous
 * les UPDATE via le client cookie-based. Pour respecter cette policy sans
 * relâcher la sécurité côté DB, on utilise le client admin (service_role
 * bypass RLS) avec **double ownership check côté SA** :
 *   1. requirePermission('captable.snapshot.create')
 *   2. Vérification org_id du snapshot vs activeOrgId du user
 *   3. Idempotence : re-freeze d'un snapshot déjà immutable = no-op
 */
export async function freezeSnapshot(id: string): Promise<ActionVoid | ActionError> {
  const parsed = freezeSnapshotSchema.safeParse({ id });
  if (!parsed.success) return validationError(parsed.error);

  const user = await requirePermission('captable.snapshot.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const cookie = await createSupabaseServerClient();

  // Ownership check via cookie client (RLS SELECT actif → ne voit que son org)
  const { data: existing, error: loadErr } = await cookie
    .from('cap_table_snapshots')
    .select('id, org_id, is_immutable')
    .eq('id', parsed.data.id)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (loadErr || !existing) {
    return { ok: false, error: 'Snapshot introuvable ou hors org' };
  }

  // Idempotence : si déjà frozen, retour ok silencieux
  if (existing.is_immutable) {
    return { ok: true };
  }

  // UPDATE via admin client (bypass RLS no_update). Ownership déjà validée.
  const admin = getSupabaseAdminClient();
  const { error: updErr } = await admin
    .from('cap_table_snapshots')
    .update({ is_immutable: true, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('org_id', user.activeOrgId);

  if (updErr) {
    return { ok: false, error: `Freeze échoué: ${updErr.message}` };
  }

  await logAuditEvent({
    eventType: 'captable.snapshot_frozen',
    resourceType: 'cap_table_snapshots',
    resourceId: parsed.data.id,
    metadata: {},
  });

  revalidatePath('/dashboard/captable/snapshots');
  revalidatePath(`/dashboard/captable/snapshots/${parsed.data.id}`);
  return { ok: true };
}

/**
 * Supprime un snapshot mutable. RLS policy bloque DELETE si `is_immutable=true`.
 * Double-check côté SA pour message d'erreur clair.
 */
export async function deleteSnapshot(id: string): Promise<ActionVoid | ActionError> {
  const parsed = deleteSnapshotSchema.safeParse({ id });
  if (!parsed.success) return validationError(parsed.error);

  const user = await requirePermission('captable.snapshot.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: loadErr } = await supabase
    .from('cap_table_snapshots')
    .select('id, is_immutable, label, snapshot_type')
    .eq('id', parsed.data.id)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (loadErr || !existing) {
    return { ok: false, error: 'Snapshot introuvable ou hors org' };
  }

  if (existing.is_immutable) {
    return { ok: false, error: 'Snapshot immutable — suppression impossible (PRE_AUDIT lock).' };
  }

  const { error: delErr } = await supabase
    .from('cap_table_snapshots')
    .delete()
    .eq('id', parsed.data.id)
    .eq('org_id', user.activeOrgId);

  if (delErr) {
    return { ok: false, error: `Suppression échouée: ${delErr.message}` };
  }

  await logAuditEvent({
    eventType: 'captable.snapshot_deleted',
    resourceType: 'cap_table_snapshots',
    resourceId: parsed.data.id,
    metadata: {
      label: existing.label,
      snapshot_type: existing.snapshot_type,
    },
  });

  revalidatePath('/dashboard/captable/snapshots');
  return { ok: true };
}

// ============================================================================
// BULK IMPORT (B6)
// ============================================================================

export type ImportRowError = {
  rowIndex: number;
  field: string | null;
  message: string;
};

export type BulkImportSummary = {
  rowsTotal: number;
  rowsCreated: number;
  errors: ImportRowError[];
};

/**
 * Bulk import de positions cap_table via CSV.
 *
 * Pattern Module 4 bulkCreateBeneficiaries / Module 3b bulkCreateAwards :
 *  1. Validation Zod par row (collecte toutes les erreurs avant DB)
 *  2. Resolution share_class_id par code + beneficiary_id par email (si type=BENEFICIARY)
 *  3. INSERT batch atomique (rollback si une row fail)
 *
 * Limite : 500 rows max (cf BULK_IMPORT_MAX_ROWS).
 *
 * Note : on ne traite PAS l'upsert. Si une position existe déjà sur
 * (share_class, stakeholder, source), l'INSERT levera une erreur et toute
 * la transaction est annulée (atomicité).
 */
export async function bulkImportPositions(
  input: BulkImportPositionsInput,
): Promise<ActionOk<{ summary: BulkImportSummary }> | ActionError> {
  const parsed = bulkImportPositionsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('captable.import');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const errors: ImportRowError[] = [];

  // 1. Resolve share_classes par code (1 query consolidée)
  const codes = Array.from(new Set(data.rows.map((r) => r.shareClassCode)));
  const { data: classes, error: classesErr } = await supabase
    .from('share_classes')
    .select('id, code, is_active')
    .eq('org_id', user.activeOrgId)
    .in('code', codes);

  if (classesErr) {
    return { ok: false, error: `Lookup share_classes échoué: ${classesErr.message}` };
  }

  const classByCode = new Map<string, { id: string; deactivated: boolean }>();
  for (const c of classes ?? []) {
    classByCode.set(c.code, { id: c.id, deactivated: !c.is_active });
  }

  // 2. Resolve beneficiaries par email (uniquement pour rows BENEFICIARY)
  const beneficiaryEmails = Array.from(
    new Set(
      data.rows
        .filter((r) => r.stakeholderType === 'BENEFICIARY' && r.stakeholderEmail)
        .map((r) => r.stakeholderEmail as string),
    ),
  );

  const beneficiaryByEmail = new Map<string, string>();
  if (beneficiaryEmails.length > 0) {
    const { data: benefs, error: benefsErr } = await supabase
      .from('beneficiaries')
      .select('id, email')
      .eq('org_id', user.activeOrgId)
      .in('email', beneficiaryEmails)
      .is('deleted_at', null);

    if (benefsErr) {
      return { ok: false, error: `Lookup beneficiaries échoué: ${benefsErr.message}` };
    }
    for (const b of benefs ?? []) {
      if (b.email) beneficiaryByEmail.set(b.email, b.id);
    }
  }

  // 3. Build INSERT rows + collecte erreurs de résolution
  type InsertRow = {
    org_id: string;
    share_class_id: string;
    stakeholder_type: ImportPositionRowInput['stakeholderType'];
    stakeholder_id: string | null;
    stakeholder_name: string;
    stakeholder_email: string | null;
    units: number;
    cost_basis_per_unit: number | null;
    acquired_at: string;
    source: 'BULK_IMPORT';
    notes: string | null;
  };

  const insertRows: InsertRow[] = [];
  for (const [i, row] of data.rows.entries()) {
    const klass = classByCode.get(row.shareClassCode);
    if (!klass) {
      errors.push({
        rowIndex: i,
        field: 'shareClassCode',
        message: `Classe ${row.shareClassCode} introuvable dans cet org`,
      });
      continue;
    }
    if (klass.deactivated) {
      errors.push({
        rowIndex: i,
        field: 'shareClassCode',
        message: `Classe ${row.shareClassCode} désactivée`,
      });
      continue;
    }

    let stakeholderId: string | null = null;
    if (row.stakeholderType === 'BENEFICIARY') {
      if (!row.stakeholderEmail) {
        errors.push({
          rowIndex: i,
          field: 'stakeholderEmail',
          message: 'Email requis pour stakeholderType=BENEFICIARY',
        });
        continue;
      }
      stakeholderId = beneficiaryByEmail.get(row.stakeholderEmail) ?? null;
      if (!stakeholderId) {
        errors.push({
          rowIndex: i,
          field: 'stakeholderEmail',
          message: `Bénéficiaire ${row.stakeholderEmail} introuvable`,
        });
        continue;
      }
    } else if (row.stakeholderType !== 'POOL_RESERVE') {
      // FOUNDER / INVESTOR / ENTITY : pas de table dédiée V1.
      // Pattern aligné sur create_funding_round (00086) : UUID placeholder stable.
      // V2 = créer table `investors` + `entities` et résoudre par référence.
      stakeholderId = crypto.randomUUID();
    }

    insertRows.push({
      org_id: user.activeOrgId,
      share_class_id: klass.id,
      stakeholder_type: row.stakeholderType,
      stakeholder_id: stakeholderId,
      stakeholder_name: row.stakeholderName,
      stakeholder_email: row.stakeholderEmail ?? null,
      units: row.units,
      cost_basis_per_unit: row.costBasisPerUnit ?? null,
      acquired_at: row.acquiredAt,
      source: 'BULK_IMPORT',
      notes: row.notes ?? null,
    });
  }

  if (errors.length > 0) {
    const first = errors[0]!;
    return {
      ok: false,
      error: `${errors.length} ligne(s) en erreur — corrigez avant import. Première erreur ligne ${first.rowIndex + 1}: ${first.message}`,
      validationIssues: errors.length,
    };
  }

  // 4. Atomic INSERT (Postgres transaction implicite sur insert array)
  const { error: insertErr, count } = await supabase
    .from('cap_table_positions')
    .insert(insertRows, { count: 'exact' });

  if (insertErr) {
    return { ok: false, error: `Insert atomique échoué: ${insertErr.message}` };
  }

  await logAuditEvent({
    eventType: 'captable.positions_bulk_imported',
    resourceType: 'cap_table_positions',
    metadata: {
      rows_total: data.rows.length,
      rows_created: count ?? 0,
    },
  });

  revalidatePath('/dashboard/captable');

  return {
    ok: true,
    summary: {
      rowsTotal: data.rows.length,
      rowsCreated: count ?? 0,
      errors: [],
    },
  };
}
