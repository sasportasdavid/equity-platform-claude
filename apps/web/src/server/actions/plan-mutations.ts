'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { uuidSchema } from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server Actions du Module 3a — mutations sur les plans existants (B3).
 *
 * 5 endpoints :
 *   - updatePlan       : édite name / description / status (validation Zod stricte)
 *   - lockPlan         : verrouille (empêche futures modifs structurelles)
 *   - unlockPlan       : déverrouille (mêmes droits que lock)
 *   - archivePlan      : soft delete (deleted_at = now())
 *   - restorePlan      : annule un soft delete (deleted_at = null)
 *   - duplicatePlan    : copie cascade via RPC duplicate_plan_full (nouvelle
 *                        version v+1 du même lineage, status=DRAFT)
 *
 * Toutes les actions :
 *   1. requirePermission (plans.update / plans.lock / plans.delete / plans.create)
 *   2. uuidSchema.safeParse sur planId
 *   3. Vérifie que le plan n'est PAS verrouillé (sauf unlockPlan, archive d'un
 *      plan ARCHIVÉ pour restore, et l'action de lock elle-même)
 *   4. Mute via Supabase (RLS filtre déjà à l'org active)
 *   5. logAuditEvent
 *   6. revalidatePath des pages impactées
 *
 * Pattern de retour : `{ ok: true, ... }` ou `{ ok: false, error: string }`.
 */

// ---------------------------------------------------------------------------
// Types de retour communs
// ---------------------------------------------------------------------------

export type MutationOk = { ok: true };
export type MutationKo = { ok: false; error: string };
export type MutationResult = MutationOk | MutationKo;

// ---------------------------------------------------------------------------
// updatePlan
// ---------------------------------------------------------------------------

const PLAN_STATUS_VALUES = ['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const;

const updatePlanInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(PLAN_STATUS_VALUES).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Aucun champ à mettre à jour' });

export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;

/**
 * Met à jour les champs simples d'un plan (name, description, status).
 * Pour modifier la structure (vesting, conditions, etc.), il faut recréer
 * le plan via le wizard ou le dupliquer.
 *
 * Garde-fou : refuse si le plan est verrouillé (`is_locked = true`).
 */
export async function updatePlan(planId: string, input: UpdatePlanInput): Promise<MutationResult> {
  const idCheck = uuidSchema.safeParse(planId);
  if (!idCheck.success) return { ok: false, error: 'plan_id invalide' };
  const inputCheck = updatePlanInputSchema.safeParse(input);
  if (!inputCheck.success) {
    return { ok: false, error: `Validation échouée : ${inputCheck.error.issues.length} erreur(s)` };
  }

  const user = await requirePermission('plans.update');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };
  const supabase = await createSupabaseServerClient();

  const { data: plan } = await supabase
    .from('plans')
    .select('id, is_locked, deleted_at')
    .eq('id', idCheck.data)
    .maybeSingle();
  if (!plan) return { ok: false, error: 'Plan introuvable' };
  if (plan.is_locked) return { ok: false, error: 'Plan verrouillé — déverrouillez avant édition' };
  if (plan.deleted_at) return { ok: false, error: 'Plan archivé — restaurez avant édition' };

  const { error } = await supabase
    .from('plans')
    .update({ ...inputCheck.data, updated_at: new Date().toISOString() })
    .eq('id', idCheck.data);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'plan.updated',
    resourceType: 'PLAN',
    resourceId: idCheck.data,
    metadata: inputCheck.data as Record<string, unknown>,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath(`/dashboard/plans/${idCheck.data}`);
  revalidatePath('/dashboard/plans');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// lockPlan / unlockPlan
// ---------------------------------------------------------------------------

/**
 * Verrouille un plan : interdit toute modification structurelle ou de
 * statut (sauf unlockPlan).
 *
 * Use case typique : plan validé par le board, on fige pour audit IFRS 2 /
 * conformité légale (un BSPCE attribué ne doit plus changer en silence).
 */
export async function lockPlan(planId: string): Promise<MutationResult> {
  return setPlanLockState(planId, true);
}

export async function unlockPlan(planId: string): Promise<MutationResult> {
  return setPlanLockState(planId, false);
}

async function setPlanLockState(planId: string, locked: boolean): Promise<MutationResult> {
  const idCheck = uuidSchema.safeParse(planId);
  if (!idCheck.success) return { ok: false, error: 'plan_id invalide' };

  const user = await requirePermission('plans.lock');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };
  const supabase = await createSupabaseServerClient();

  const { data: plan } = await supabase
    .from('plans')
    .select('id, is_locked, deleted_at')
    .eq('id', idCheck.data)
    .maybeSingle();
  if (!plan) return { ok: false, error: 'Plan introuvable' };
  if (plan.deleted_at) return { ok: false, error: 'Plan archivé — restaurez d’abord' };
  if (plan.is_locked === locked) {
    return { ok: false, error: locked ? 'Plan déjà verrouillé' : 'Plan déjà déverrouillé' };
  }

  const { error } = await supabase
    .from('plans')
    .update({ is_locked: locked, updated_at: new Date().toISOString() })
    .eq('id', idCheck.data);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: locked ? 'plan.locked' : 'plan.unlocked',
    resourceType: 'PLAN',
    resourceId: idCheck.data,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath(`/dashboard/plans/${idCheck.data}`);
  revalidatePath('/dashboard/plans');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// archivePlan / restorePlan
// ---------------------------------------------------------------------------

/**
 * Soft-delete : marque le plan comme archivé (deleted_at = now()).
 * Toutes les queries existantes filtrent déjà `WHERE deleted_at IS NULL`,
 * donc le plan disparaît de la liste + page détail (notFound).
 *
 * Réversible via `restorePlan`.
 */
export async function archivePlan(planId: string): Promise<MutationResult> {
  const idCheck = uuidSchema.safeParse(planId);
  if (!idCheck.success) return { ok: false, error: 'plan_id invalide' };

  const user = await requirePermission('plans.delete');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };
  const supabase = await createSupabaseServerClient();

  const { data: plan } = await supabase
    .from('plans')
    .select('id, deleted_at, is_locked')
    .eq('id', idCheck.data)
    .maybeSingle();
  if (!plan) return { ok: false, error: 'Plan introuvable' };
  if (plan.deleted_at) return { ok: false, error: 'Plan déjà archivé' };
  if (plan.is_locked) return { ok: false, error: 'Plan verrouillé — déverrouillez avant archive' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('plans')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', idCheck.data);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'plan.archived',
    resourceType: 'PLAN',
    resourceId: idCheck.data,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/plans');
  return { ok: true };
}

/**
 * Restaure un plan soft-deleted : remet `deleted_at` à NULL.
 *
 * Note : pour accéder à un plan archivé, il faudra une vue spécifique
 * (« Corbeille »). En V1, restorePlan est utilisable depuis l'API mais
 * pas exposé en UI — la liste filtre `deleted_at IS NULL`.
 */
export async function restorePlan(planId: string): Promise<MutationResult> {
  const idCheck = uuidSchema.safeParse(planId);
  if (!idCheck.success) return { ok: false, error: 'plan_id invalide' };

  const user = await requirePermission('plans.delete');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };
  const supabase = await createSupabaseServerClient();

  // On NE peut PAS filtrer `deleted_at IS NULL` ici (RLS ou notre query
  // filtre par défaut) — il faut bypass via une query directe sur l'id.
  const { data: plan } = await supabase
    .from('plans')
    .select('id, deleted_at')
    .eq('id', idCheck.data)
    .maybeSingle();
  if (!plan) return { ok: false, error: 'Plan introuvable' };
  if (!plan.deleted_at) return { ok: false, error: 'Plan non archivé' };

  const { error } = await supabase
    .from('plans')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', idCheck.data);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'plan.restored',
    resourceType: 'PLAN',
    resourceId: idCheck.data,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/plans');
  revalidatePath(`/dashboard/plans/${idCheck.data}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// duplicatePlan
// ---------------------------------------------------------------------------

export type DuplicatePlanOk = { ok: true; newPlanId: string };
export type DuplicatePlanResult = DuplicatePlanOk | MutationKo;

/**
 * Duplique un plan existant en créant une nouvelle version v+1 du même
 * lineage. Le nouveau plan :
 *   - hérite de `parent_plan_id = source.id`
 *   - démarre en `status = 'DRAFT'`, `is_locked = false`, `version = source.version + 1`
 *   - copie cascade : vesting_schedule + tranches, performance_conditions,
 *     early_termination_rules, hypothesis_sets, volatility_schemes,
 *     simulation_configs (= toute la structure recréable par le wizard,
 *     pour qu'on puisse l'éditer puis l'activer indépendamment)
 *
 * Implémentation : RPC PL/pgSQL `duplicate_plan_full(p_source_id, p_user_id,
 * p_new_name)` (cf. migration 00019). Atomique côté DB pour garantir qu'on
 * ne crée pas un plan partiellement copié si une étape de la cascade
 * échoue.
 */
export async function duplicatePlan(
  planId: string,
  newName?: string,
): Promise<DuplicatePlanResult> {
  const idCheck = uuidSchema.safeParse(planId);
  if (!idCheck.success) return { ok: false, error: 'plan_id invalide' };

  const trimmedName = newName?.trim();
  if (trimmedName != null && (trimmedName.length === 0 || trimmedName.length > 200)) {
    return { ok: false, error: 'Nom invalide (1-200 caractères)' };
  }

  const user = await requirePermission('plans.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };
  const supabase = await createSupabaseServerClient();

  const { data: rpcResult, error: rpcError } = await supabase.rpc('duplicate_plan_full', {
    p_source_plan_id: idCheck.data,
    p_new_name: trimmedName ?? undefined,
  });
  if (rpcError) return { ok: false, error: rpcError.message };

  const result = rpcResult as { plan_id: string; version: number } | null;
  if (!result?.plan_id) return { ok: false, error: 'Réponse RPC inattendue (plan_id manquant)' };

  await logAuditEvent({
    eventType: 'plan.duplicated',
    resourceType: 'PLAN',
    resourceId: result.plan_id,
    metadata: { source_plan_id: idCheck.data, new_version: result.version },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/plans');
  return { ok: true, newPlanId: result.plan_id };
}
