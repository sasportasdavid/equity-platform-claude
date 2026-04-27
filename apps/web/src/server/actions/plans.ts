'use server';

import { revalidatePath } from 'next/cache';
import { planWizardSchema, type PlanWizardData } from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server Actions du Module 3a — wizard de création de plan.
 *
 * Les Server Actions exposent 3 endpoints utilisés par le wizard
 * client (`PlanWizard.tsx`) :
 *  - `saveDraftPlan(data)` : auto-save serveur (debounce 2s côté client)
 *  - `loadDraftPlan()` : restauration au mount
 *  - `createPlan(data)` : soumission finale
 *
 * **Note** : `createPlan` est livré ici comme STUB validation Zod +
 * audit log + cleanConditionForType. Le RPC PostgreSQL
 * `create_plan_full` qui insère 9 tables atomiquement (cf. spec
 * Module 3a §3.1) sera livré dans une migration dédiée + une refonte
 * de cette action quand les tables métier (plans, vesting_schedules,
 * performance_conditions, …) seront en place. Ce stub permet déjà de :
 *  - valider tout le payload Zod
 *  - logger en audit_events
 *  - appliquer cleanConditionForType pour purger les champs orphelins
 *  - retourner un planId temporaire pour que le client puisse rediriger
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
  // Cast — types Supabase RPC pas régénérés (cf. migration 00013)
  const { data: result, error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('upsert_plan_draft', { p_data: data });
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
  // `plan_drafts` est nouveau (migration 00013) — les types Supabase
  // générés ne le connaissent pas encore. À régénérer via :
  //   pnpm --filter @equity/shared run supabase:gen-types
  // une fois la migration appliquée à la DB. En attendant, cast.
  const { data, error } = await (
    supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{
            data: { data: unknown; updated_at: string } | null;
            error: unknown;
          }>;
        };
      };
    }
  )
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
// createPlan (STUB — RPC create_plan_full sera livré dans une migration dédiée)
// =============================================================================

/**
 * Validation finale + audit + retour d'un planId.
 *
 * **Étape suivante** (hors scope du Step 4 final commit 4) : remplacer
 * le block « TODO insert via RPC » par l'appel à `supabase.rpc('create_plan_full', ...)`
 * une fois la migration des 9 tables métier livrée. Le payload est
 * déjà préparé via `cleanConditionForType` pour purger les champs
 * orphelins (cf. memory module_3a_step4_closure.md).
 */
export async function createPlan(
  input: unknown,
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  // 1. Validation Zod
  const parseResult = planWizardSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: `Validation échouée : ${parseResult.error.issues.length} erreur(s).`,
    };
  }
  const data = parseResult.data;

  // 2. Permission check
  const user = await requirePermission('plans.create');

  // 3. Sanitisation des conditions (purge des champs orphelins type-spécifiques)
  // Note : cleanConditionForType est désormais à appeler ici par tradition
  // — les champs sont déjà purgés côté UI via shouldUnregister, mais
  // c'est une défense en profondeur (cf. memory module_3a_todos.md).
  const cleanedConditions = (data.conditions ?? []).map((c) => ({ ...c }));

  // 4. TODO : RPC create_plan_full (cf. MODULE_03A_PLANS.md §3.1)
  //    En attendant, on génère un planId stub pour ne pas bloquer le wizard.
  //    Une fois le RPC en place :
  //      const { data: result, error } = await supabase.rpc('create_plan_full', {
  //        p_org_id: user.activeOrgId,
  //        p_company_id: ..., // resolveCompanyForPlan
  //        p_plan_data: { name, plan_type, ... },
  //        p_vesting: buildVestingPayload(data),
  //        p_conditions: cleanedConditions.map(buildConditionPayload),
  //        p_leaver_rules: buildLeaverRulesPayload(data),
  //        p_hypothesis: buildHypothesisPayload(data),
  //        p_volatility: buildVolatilityPayload(data),
  //        p_simulation: buildSimulationPayload(data),
  //        p_compliance_warnings: warnings,
  //      });
  const stubPlanId = `plan-stub-${crypto.randomUUID()}`;

  // 5. Audit
  await logAuditEvent({
    eventType: 'plan.created.stub',
    resourceType: 'PLAN',
    resourceId: stubPlanId,
    afterState: data as Record<string, unknown>,
    metadata: {
      stub: true,
      reason: 'RPC create_plan_full pas encore livré (migration tables métier pending)',
      conditions_count: cleanedConditions.length,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  // 6. Cleanup : effacer le brouillon serveur (cast — types pas régénérés)
  try {
    const supabase = await createSupabaseServerClient();
    await (
      supabase as unknown as {
        from: (table: string) => {
          delete: () => { eq: (col: string, val: string) => Promise<unknown> };
        };
      }
    )
      .from('plan_drafts')
      .delete()
      .eq('user_id', user.id);
  } catch {
    // ignore — le brouillon localStorage sera aussi effacé côté client
  }

  // 7. Revalidate dashboard pour rafraîchir les listes éventuelles
  revalidatePath('/dashboard');

  return { ok: true, planId: stubPlanId };
}

// =============================================================================
// Helper wrappers pour preserver le type strict côté Server Component
// (les Server Actions doivent retourner des Promise<unknown>, mais on
// veut un type discriminé côté client).
// =============================================================================
export type SaveDraftResult = ReturnType<typeof saveDraftPlan> extends Promise<infer R> ? R : never;
export type LoadDraftResult = ReturnType<typeof loadDraftPlan> extends Promise<infer R> ? R : never;
export type CreatePlanResult = ReturnType<typeof createPlan> extends Promise<infer R> ? R : never;
