'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  bulkAwardImportSchema,
  cancelAwardSchema,
  createAwardSchema,
  createModificationSchema,
  forfeitAwardSchema,
  transitionAwardSchema,
  updateAwardDraftSchema,
  uuidSchema,
  type AwardStatus,
  type BulkAwardImportInput,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import {
  runApprovalAwardComplianceChecks,
  runComplianceChecks,
  runValuationComplianceChecks,
} from '@/lib/compliance/runChecks';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import {
  canTransition,
  isCancellable,
  timestampFieldForStatus,
} from '@/lib/stateMachines/awardStateMachine';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notifyApproversOfPendingApproval } from '@/server/actions/notifications';

/**
 * Module 3b — Server Actions pour le lifecycle des awards.
 *
 * 8 actions (cf. spec §5.1) :
 *   - createAwardDraft / updateAwardDraft / loadAward
 *   - transitionAward (pivot state machine)
 *   - cancelAward (wrapper transitionAward → CANCELLED)
 *   - forfeitAward (wrapper transitionAward → FORFEITED + metadata leaver)
 *   - bulkCreateAwards (CSV import via RPC bulk_create_awards)
 *   - createAwardModification (IFRS 2.27-28 modifications post-grant)
 *
 * Pattern de retour uniforme :
 *   { ok: true, ... } | { ok: false, error: string, validationIssues?: number }
 *
 * Toutes les actions :
 *   1. Zod parse → return validation error si KO
 *   2. requirePermission appropriée
 *   3. SELECT FOR UPDATE row-lock pour transitionAward (anti-race)
 *   4. Audit (best-effort, non-bloquant)
 *   5. revalidatePath des routes impactées
 */

// ---------------------------------------------------------------------------
// Types de retour communs
// ---------------------------------------------------------------------------

export type ActionOk<T> = { ok: true } & T;
export type ActionError = {
  ok: false;
  error: string;
  validationIssues?: number;
  /**
   * Issues compliance (B7) — uniquement présent si la transition vers
   * PROPOSED a été bloquée par `runComplianceChecks`. La modale les
   * affiche côté client dans un Dialog secondaire.
   */
  complianceIssues?: import('@/lib/compliance/types').ComplianceIssue[];
};
/** Réponse void — pas de payload data. */
export type ActionVoid = { ok: true } | ActionError;

function validationError<T>(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ---------------------------------------------------------------------------
// Bug #6 — Tenant guard helper (defense-in-depth, couche 2)
// ---------------------------------------------------------------------------

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Vérifie que les FK passées à un award (plan_id, beneficiary_id) appartiennent
 * bien à l'org active. Lecture directe des colonnes org_id sans dépendre de
 * RLS (les RPCs SECURITY DEFINER bypass RLS, ce check côté Server Action
 * arrive AVANT le RPC pour produire un message d'erreur lisible).
 *
 * La source de vérité reste la migration 00101 côté DB — ce helper évite
 * juste un round-trip Postgres et donne un meilleur retour UI.
 */
async function assertAwardTenant(input: {
  supabase: SupabaseServerClient;
  activeOrgId: string;
  planId: string | null;
  beneficiaryId: string | null;
}): Promise<{ ok: true } | ActionError> {
  const { supabase, activeOrgId, planId, beneficiaryId } = input;

  if (planId) {
    const { data: plan, error } = await supabase
      .from('plans')
      .select('id, org_id')
      .eq('id', planId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!plan) return { ok: false, error: 'Plan introuvable' };
    if (plan.org_id !== activeOrgId) {
      return { ok: false, error: 'TENANT_VIOLATION: plan appartient à une autre organisation' };
    }
  }

  if (beneficiaryId) {
    const { data: beneficiary, error } = await supabase
      .from('beneficiaries')
      .select('id, org_id')
      .eq('id', beneficiaryId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!beneficiary) return { ok: false, error: 'Bénéficiaire introuvable' };
    if (beneficiary.org_id !== activeOrgId) {
      return {
        ok: false,
        error: 'TENANT_VIOLATION: bénéficiaire appartient à une autre organisation',
      };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// 1. createAwardDraft — appelle RPC create_award_full
// ---------------------------------------------------------------------------

export type CreateAwardOk = ActionOk<{ id: string; awardNumber: string }>;
export type CreateAwardResult = CreateAwardOk | ActionError;

export async function createAwardDraft(input: unknown): Promise<CreateAwardResult> {
  const parsed = createAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const data = parsed.data;
  const user = await requirePermission('awards.propose');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Bug #6 — couche 2 defense-in-depth : valider que plan ET beneficiary
  // appartiennent à l'org active AVANT d'appeler le RPC. Le RPC valide
  // aussi côté DB (migration 00101), mais ce check côté Server Action
  // produit un message d'erreur plus parlant pour l'UI et évite un round
  // trip Postgres si l'UI envoie un payload corrompu (cache stale, race).
  const tenantCheck = await assertAwardTenant({
    supabase,
    activeOrgId: user.activeOrgId,
    planId: data.planId,
    beneficiaryId: data.beneficiaryId ?? null,
  });
  if (!tenantCheck.ok) return tenantCheck;

  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_award_full', {
    p_data: {
      planId: data.planId,
      beneficiaryId: data.beneficiaryId,
      unitsGranted: data.unitsGranted,
      exercisePrice: data.exercisePrice ?? '',
      grantDate: data.grantDate,
      vestingStartDate: data.vestingStartDate ?? '',
      expiryDate: data.expiryDate ?? '',
      acceptanceDeadline: data.acceptanceDeadline ?? '',
      initialStatus: data.initialStatus,
    } as never,
  });

  if (rpcError) return { ok: false, error: rpcError.message };
  const newId = rpcResult as unknown as string | null;
  if (!newId) return { ok: false, error: 'RPC create_award_full sans id retour' };

  // Récupérer l'award_number pour le retour API (le RPC ne le renvoie pas)
  const { data: row } = await supabase
    .from('awards')
    .select('award_number')
    .eq('id', newId)
    .maybeSingle();

  revalidatePath('/dashboard/awards');
  revalidatePath(`/dashboard/plans/${data.planId}`);

  return { ok: true, id: newId, awardNumber: row?.award_number ?? '' };
}

// ---------------------------------------------------------------------------
// 2. updateAwardDraft — UPDATE direct, refuse si status != DRAFT
// ---------------------------------------------------------------------------

export async function updateAwardDraft(
  awardId: string,
  patch: unknown,
): Promise<ActionVoid | ActionError> {
  const idCheck = uuidSchema.safeParse(awardId);
  if (!idCheck.success) return { ok: false, error: 'award_id invalide' };
  const patchCheck = updateAwardDraftSchema.safeParse(patch);
  if (!patchCheck.success) return validationError(patchCheck.error);

  const user = await requirePermission('awards.propose');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from('awards')
    .select('id, status, plan_id, org_id')
    .eq('id', idCheck.data)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'Award introuvable' };
  if (existing.org_id !== user.activeOrgId) {
    // Bug #6 — defense-in-depth : un award visible via RLS doit forcément
    // matcher activeOrgId, mais on ferme la porte au cas où une route
    // d'édition serait appelée avec un id cross-org via cache stale.
    return { ok: false, error: 'TENANT_VIOLATION: award appartient à une autre organisation' };
  }
  if (existing.status !== 'DRAFT') {
    return {
      ok: false,
      error: `Award en status ${existing.status} — édition possible uniquement en DRAFT`,
    };
  }

  // Mapping camelCase → snake_case
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const p = patchCheck.data;
  if (p.beneficiaryId !== undefined) {
    // Bug #6 — couche 2 : si on remplace le bénéficiaire, valider l'org
    // du nouveau bénéficiaire. RLS sur beneficiaries.update bloquerait
    // déjà mais ici c'est un UPDATE awards.beneficiary_id (FK) qui ne
    // déclenche pas de check côté table beneficiaries.
    const tenantCheck = await assertAwardTenant({
      supabase,
      activeOrgId: user.activeOrgId,
      planId: null,
      beneficiaryId: p.beneficiaryId,
    });
    if (!tenantCheck.ok) return tenantCheck;
    updateData.beneficiary_id = p.beneficiaryId;
  }
  if (p.unitsGranted !== undefined) updateData.units_granted = p.unitsGranted;
  if (p.exercisePrice !== undefined) updateData.exercise_price = p.exercisePrice;
  if (p.grantDate !== undefined) updateData.grant_date = p.grantDate;
  if (p.vestingStartDate !== undefined) updateData.vesting_start_date = p.vestingStartDate;
  if (p.expiryDate !== undefined) updateData.expiry_date = p.expiryDate;
  if (p.acceptanceDeadline !== undefined) updateData.acceptance_deadline = p.acceptanceDeadline;

  const { error } = await supabase
    .from('awards')
    .update(updateData as never)
    .eq('id', idCheck.data);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'award.updated',
    resourceType: 'AWARD',
    resourceId: idCheck.data,
    metadata: p as Record<string, unknown>,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/awards');
  revalidatePath(`/dashboard/plans/${existing.plan_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. loadAward — SELECT joint awards + plan + beneficiary + counts
// ---------------------------------------------------------------------------

export type AwardDetail = {
  id: string;
  awardNumber: string | null;
  status: string;
  unitsGranted: number;
  unitsVested: number | null;
  exercisePrice: number | null;
  grantDate: string;
  vestingStartDate: string | null;
  expiryDate: string | null;
  createdAt: string;
  updatedAt: string | null;
  plan: { id: string; name: string; planType: string } | null;
  beneficiary: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  vestingEventsCount: number;
  modificationsCount: number;
};

export async function loadAward(
  awardId: string,
): Promise<ActionOk<{ award: AwardDetail }> | ActionError> {
  const idCheck = uuidSchema.safeParse(awardId);
  if (!idCheck.success) return { ok: false, error: 'award_id invalide' };

  const can = await hasPermission('awards.read.all');
  if (!can) return { ok: false, error: 'Permission awards.read.all requise' };

  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from('awards')
    .select(
      `id, award_number, status, units_granted, units_vested, exercise_price, grant_date,
       vesting_start_date, expiry_date, created_at, updated_at,
       plan:plans!awards_plan_id_fkey ( id, name, plan_type ),
       beneficiary:beneficiaries!awards_beneficiary_id_fkey ( id, first_name, last_name, email )`,
    )
    .eq('id', idCheck.data)
    .maybeSingle();

  if (error || !row) return { ok: false, error: error?.message ?? 'Award introuvable' };

  const [{ count: veCount }, { count: modCount }] = await Promise.all([
    supabase
      .from('vesting_events')
      .select('id', { count: 'exact', head: true })
      .eq('award_id', idCheck.data),
    supabase
      .from('award_modifications')
      .select('id', { count: 'exact', head: true })
      .eq('award_id', idCheck.data),
  ]);

  return {
    ok: true,
    award: {
      id: row.id,
      awardNumber: row.award_number,
      status: row.status,
      unitsGranted: Number(row.units_granted),
      unitsVested: row.units_vested != null ? Number(row.units_vested) : null,
      exercisePrice: row.exercise_price != null ? Number(row.exercise_price) : null,
      grantDate: row.grant_date,
      vestingStartDate: row.vesting_start_date,
      expiryDate: row.expiry_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      plan: row.plan
        ? { id: row.plan.id, name: row.plan.name, planType: row.plan.plan_type }
        : null,
      beneficiary: row.beneficiary
        ? {
            id: row.beneficiary.id,
            firstName: row.beneficiary.first_name,
            lastName: row.beneficiary.last_name,
            email: row.beneficiary.email,
          }
        : null,
      vestingEventsCount: veCount ?? 0,
      modificationsCount: modCount ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. transitionAward — la plus critique
// ---------------------------------------------------------------------------
// Permission mapping selon §2.4 :
//   PROPOSED ← DRAFT          : awards.propose
//   PENDING_APPROVAL ← *      : awards.propose
//   APPROVED ← PENDING_APPROVAL : awards.approve
//   BOARD_APPROVED ← PENDING_BOARD : awards.board.approve (fallback awards.approve V1)
//   PENDING_SIGNATURE ← *     : awards.propose
//   GRANTED ← PENDING_SIGNATURE : awards.propose (admin flip manuel V1)
//   * ← VESTING/POST          : awards.update (transitions cron)
//   * → CANCELLED             : awards.cancel
//   * → FORFEITED             : awards.modify

function permissionForTransition(_from: AwardStatus, to: AwardStatus): string {
  if (to === 'CANCELLED') return 'awards.cancel';
  if (to === 'FORFEITED') return 'awards.modify';
  if (to === 'APPROVED') return 'awards.approve';
  if (to === 'BOARD_APPROVED') return 'awards.approve'; // V1 : fallback (awards.board.approve viendra B7)
  // Tous les autres transitions (PROPOSED, PENDING_*, GRANTED…) → propose
  return 'awards.propose';
}

export async function transitionAward(input: unknown): Promise<ActionVoid | ActionError> {
  const parsed = transitionAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, toStatus, reason, skipApprovalHook } = parsed.data;

  const supabase = await createSupabaseServerClient();

  // Charger l'award (pas de SELECT FOR UPDATE car Supabase JS ne l'expose pas
  // — la course est très improbable côté UX, et les triggers DB attrapent
  // les violations cohérence pool/lock).
  const { data: award } = await supabase
    .from('awards')
    .select(
      'id, status, plan_id, beneficiary_id, units_granted, units_vested, vesting_start_date, grant_date',
    )
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { ok: false, error: 'Award introuvable' };

  const fromStatus = award.status as AwardStatus;
  if (!canTransition(fromStatus, toStatus)) {
    return {
      ok: false,
      error: `Transition interdite : ${fromStatus} → ${toStatus}`,
    };
  }

  // Permission check selon la transition cible
  const requiredPerm = permissionForTransition(fromStatus, toStatus);
  const user = await requirePermission(requiredPerm as never);
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  // Compliance V1 — Module 3b B7 + Module 11 B6. On check sur la transition
  // vers PROPOSED (= soumission au workflow d'approbation). Les autres
  // transitions (GRANTED, FORFEITED, CANCELLED…) sont gouvernées par la
  // state machine ou des RPCs dédiés.
  //
  // Module 11 B6 : on ajoute les rules valuation (STALE_BLOCKING + FMV_DEVIATION).
  // Aggregation : les errors des 2 jeux de rules sont mergées avant le hard
  // block. Les warnings sont concaténés et stockés ensemble.
  if (toStatus === 'PROPOSED') {
    // Module 12.5 B4 — Résolution dette #14 : runApprovalAwardComplianceChecks
    // ajouté en parallèle pour brancher WORKFLOW_REQUIRED_FOR_AGA (hard block
    // si plan AGA sans workflow attaché ni default org). L'admin peut downgrade
    // ou désactiver via Module 12 settings.
    const [compliance, valuationCompliance, approvalCompliance] = await Promise.all([
      runComplianceChecks('AWARD_PROPOSAL', {
        planId: award.plan_id,
        beneficiaryId: award.beneficiary_id,
        unitsGranted: Number(award.units_granted),
        grantDate: award.grant_date as unknown as string,
      }),
      runValuationComplianceChecks({
        scope: 'AWARD_TRANSITION',
        planId: award.plan_id,
        toStatus: 'PROPOSED',
      }),
      runApprovalAwardComplianceChecks({ awardId, planId: award.plan_id }, user.activeOrgId),
    ]);

    const allErrors = [
      ...compliance.errors,
      ...valuationCompliance.errors,
      ...approvalCompliance.errors,
    ];
    const allWarnings = [
      ...compliance.warnings,
      ...valuationCompliance.warnings,
      ...approvalCompliance.warnings,
    ];

    // Bug #5bis sprint 6 mai 2026 PM — observabilité serveur (Vercel logs)
    console.log('[compliance] award.transition', {
      awardId,
      toStatus,
      errors: allErrors.length,
      warnings: allWarnings.length,
      errorCodes: allErrors.map((e) => e.code),
      warningCodes: allWarnings.map((w) => w.code),
    });

    if (allErrors.length > 0) {
      // Bug #5bis sprint 6 mai 2026 PM — persister les errors bloquantes
      // dans compliance_alerts (subject_type='AWARD'). Idempotent :
      // delete-then-insert sur OPEN pour ce subject. Migration 00102 ajoute
      // les RLS policies INSERT + DELETE nécessaires.
      try {
        await supabase
          .from('compliance_alerts')
          .delete()
          .eq('org_id', user.activeOrgId)
          .eq('subject_type', 'AWARD')
          .eq('subject_id', awardId)
          .eq('status', 'OPEN');

        const alertRows = allErrors.map((err) => ({
          org_id: user.activeOrgId!,
          rule_code: err.code,
          severity: err.severity,
          subject_type: 'AWARD',
          subject_id: awardId,
          message: err.message,
          details: {
            suggested_action: err.suggestedAction ?? null,
            transition_target: toStatus,
          } as never,
          status: 'OPEN',
        }));
        const { error: alertErr } = await supabase.from('compliance_alerts').insert(alertRows);
        if (alertErr) {
          console.error('[compliance] compliance_alerts insert failed', {
            awardId,
            err: alertErr.message,
          });
        }
      } catch (err) {
        // Best-effort : la persistance ne doit pas casser la réponse user
        console.error('[compliance] compliance_alerts persist threw', {
          awardId,
          err: err instanceof Error ? err.message : String(err),
        });
      }

      return {
        ok: false,
        error: `Compliance check failed : ${allErrors.length} erreur(s) bloquante(s)`,
        complianceIssues: allErrors,
      };
    }
    // Pas d'errors → resolve les alerts OPEN précédentes (le user a corrigé
    // entre-temps, ex: lancé un valuation_run pour fixer VALUATION_STALE_BLOCKING).
    try {
      await supabase
        .from('compliance_alerts')
        .delete()
        .eq('org_id', user.activeOrgId)
        .eq('subject_type', 'AWARD')
        .eq('subject_id', awardId)
        .eq('status', 'OPEN');
    } catch (err) {
      console.error('[compliance] compliance_alerts cleanup threw', {
        awardId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    // Soft warnings : on les stocke dans compliance_warnings de l'award
    // pour affichage UI, mais on continue la transition.
    if (allWarnings.length > 0) {
      await supabase
        .from('awards')
        .update({ compliance_warnings: allWarnings as never })
        .eq('id', awardId);
    }
  }

  // Side-effect GRANTED → matérialiser vesting_events
  if (toStatus === 'GRANTED') {
    const { error: matError } = await supabase.rpc('materialize_vesting_events', {
      p_award_id: awardId,
    });
    if (matError) {
      return { ok: false, error: `materialize_vesting_events échoué : ${matError.message}` };
    }
  }

  // UPDATE status + timestamp dédié si applicable
  const updateData: Record<string, unknown> = {
    status: toStatus,
    updated_at: new Date().toISOString(),
  };
  const tsField = timestampFieldForStatus(toStatus);
  if (tsField) updateData[tsField] = new Date().toISOString();
  if (toStatus === 'CANCELLED' && reason) updateData.cancellation_reason = reason;

  const { error: updError } = await supabase
    .from('awards')
    .update(updateData as never)
    .eq('id', awardId);
  if (updError) return { ok: false, error: updError.message };

  await logAuditEvent({
    eventType: 'award.status_changed',
    resourceType: 'AWARD',
    resourceId: awardId,
    beforeState: { status: fromStatus },
    afterState: { status: toStatus },
    metadata: { from: fromStatus, to: toStatus, reason: reason ?? null },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  // Module 5 B2 — Hook approval workflow.
  // À la transition vers PROPOSED, on tente de démarrer le workflow
  // configuré (attaché au plan ou default org pour AWARD_GRANT). Si un
  // workflow existe → re-transition automatique vers PENDING_APPROVAL avec
  // skipApprovalHook=true pour éviter la récursion. Sinon (legacy) → reste
  // en PROPOSED, l'admin flippe manuellement.
  if (toStatus === 'PROPOSED' && !skipApprovalHook) {
    const { data: workflowResult } = await supabase.rpc('start_approval_workflow', {
      p_award_id: awardId,
      p_workflow_id: undefined,
    });

    const requestId = (workflowResult as { request_id?: string | null } | null)?.request_id;
    if (requestId) {
      const auto = await transitionAward({
        awardId,
        toStatus: 'PENDING_APPROVAL',
        reason: 'Auto-transitioned by approval workflow',
        skipApprovalHook: true,
      });
      if (!auto.ok) return auto;

      // Module 7 B5 — Hook notif EMAIL approval_pending aux APPROVERs.
      // Fire-and-forget : si la notif fail, on ne bloque pas la transition.
      // Les notifs IN_APP du RPC start_approval_workflow restent en place
      // (orphan rendering possible via renderPendingNotificationsBatch).
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      void notifyApproversOfPendingApproval({ requestId, awardId, appUrl }).catch((err) => {
        console.error(
          `[transitionAward] notifyApproversOfPendingApproval failed for award ${awardId}:`,
          err,
        );
      });
    }
  }

  revalidatePath('/dashboard/awards');
  if (award.plan_id) revalidatePath(`/dashboard/plans/${award.plan_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4 bis. createAndPropose — helper « créer + soumettre » (modale UI B3)
// ---------------------------------------------------------------------------
// Wrap createAwardDraft + transitionAward → PROPOSED en 1 appel.
//
// Décision archi : on FORCE `initialStatus='DRAFT'` au create (même si
// l'input demande 'PROPOSED'), puis on appelle transitionAward(_, 'PROPOSED').
// Pourquoi : cohérence d'audit. La transition DRAFT → PROPOSED émet
// systématiquement `award.status_changed`. Si on shortcut en créant
// directement en PROPOSED, l'audit ne montre que `award.created` et un
// futur dev sera surpris de ne pas voir l'event de soumission.
//
// Si la transition échoue (compliance, pool exceeded au PROPOSED, etc.),
// l'award reste en DRAFT et l'utilisateur peut le reprendre depuis la liste.

export async function createAndPropose(input: unknown): Promise<CreateAwardResult> {
  // Validation upfront pour pouvoir injecter initialStatus='DRAFT'
  const parsed = createAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const created = await createAwardDraft({ ...parsed.data, initialStatus: 'DRAFT' });
  if (!created.ok) return created;

  const transition = await transitionAward({ awardId: created.id, toStatus: 'PROPOSED' });
  if (!transition.ok) {
    return {
      ok: false,
      error: `Award ${created.awardNumber} créé en DRAFT, soumission échouée : ${transition.error}. Vous pouvez le reprendre depuis la liste.`,
    };
  }
  return created;
}

// ---------------------------------------------------------------------------
// 5. cancelAward — wrapper transitionAward → CANCELLED
// ---------------------------------------------------------------------------

export async function cancelAward(input: unknown): Promise<ActionVoid | ActionError> {
  const parsed = cancelAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, reason } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: award } = await supabase
    .from('awards')
    .select('status')
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { ok: false, error: 'Award introuvable' };
  if (!isCancellable(award.status as AwardStatus)) {
    return {
      ok: false,
      error: `Award en status ${award.status} non cancellable (utilisez forfeitAward ou createAwardModification post-GRANTED)`,
    };
  }

  // Module 5 B2 — Hook : si l'award a un approval workflow IN_PROGRESS,
  // l'annuler avant de cancel l'award (cohérence des audit events).
  const { data: pendingRequest } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('award_id', awardId)
    .eq('status', 'IN_PROGRESS')
    .maybeSingle();

  if (pendingRequest?.id) {
    await supabase.rpc('cancel_approval_request', {
      p_request_id: pendingRequest.id,
      p_reason: `Award cancelled : ${reason}`,
    });
  }

  return transitionAward({ awardId, toStatus: 'CANCELLED', reason, skipApprovalHook: true });
}

// ---------------------------------------------------------------------------
// 6. forfeitAward — wrapper transitionAward → FORFEITED
// ---------------------------------------------------------------------------
//
// V1 — units_forfeited = units_granted - units_vested (les non-vested partent).
// Le treatment fin (forfeit_all / keep_vested / pro_rata / accelerate)
// par leaver_type sera géré au Module 9.

export async function forfeitAward(input: unknown): Promise<ActionVoid | ActionError> {
  const parsed = forfeitAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, leaverType, eventDate, reason } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: award } = await supabase
    .from('awards')
    .select('id, status, units_granted, units_vested, plan_id')
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { ok: false, error: 'Award introuvable' };
  if (!canTransition(award.status as AwardStatus, 'FORFEITED')) {
    return { ok: false, error: `Award en status ${award.status} non forfeitable` };
  }

  const unitsForfeited = Math.max(0, Number(award.units_granted) - Number(award.units_vested ?? 0));

  // Audit forfeit metadata avant la transition (pour avoir tous les détails)
  const user = await requirePermission('awards.modify');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  await logAuditEvent({
    eventType: 'award.forfeited',
    resourceType: 'AWARD',
    resourceId: awardId,
    metadata: {
      leaver_type: leaverType,
      event_date: eventDate,
      units_forfeited: unitsForfeited,
      units_granted: Number(award.units_granted),
      units_vested: Number(award.units_vested ?? 0),
      reason: reason ?? null,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  return transitionAward({
    awardId,
    toStatus: 'FORFEITED',
    reason: reason ?? `Leaver event ${leaverType} @ ${eventDate}`,
  });
}

// ---------------------------------------------------------------------------
// 7. bulkCreateAwards — appelle RPC bulk_create_awards
// ---------------------------------------------------------------------------

export type BulkResult = ActionOk<{ created: number; awardIds: string[] }> | ActionError;

/**
 * Mapping CSV beneficiary_type → DB beneficiary_type enum.
 *   employee   → EMPLOYEE
 *   consultant → CONSULTANT
 *   dirigeant  → OFFICER
 *   external   → OTHER
 *
 * Cohérent avec MODULE_03B §5.3 (CSV format) et la table beneficiaries
 * (Module 1 — enum DB).
 */
const CSV_TYPE_TO_DB: Record<
  BulkAwardImportInput['rows'][number]['beneficiaryType'],
  'EMPLOYEE' | 'OFFICER' | 'CONSULTANT' | 'ADVISOR' | 'OTHER'
> = {
  employee: 'EMPLOYEE',
  consultant: 'CONSULTANT',
  dirigeant: 'OFFICER',
  external: 'OTHER',
};

/**
 * Bulk import CSV — Module 3b B5.
 *
 * Pipeline :
 *   1. Validation Zod du payload (planId + array de rows pré-parsées)
 *   2. requirePermission('awards.bulk_import')
 *   3. Résolution email → beneficiary_id par upsert (déduplication intra-CSV
 *      pour minimiser les round-trips)
 *   4. Appel RPC bulk_create_awards avec un array de payloads create_award_full
 *      enrichis du beneficiaryId résolu
 *   5. Revalidate la liste
 *
 * Atomicité : le RPC est ROLLBACK-total — soit les N awards sont créés, soit
 * aucun. Les beneficiaries upsertés en amont restent en cas d'échec RPC : c'est
 * acceptable (idempotents sur email, pas de pollution data — un retry de
 * l'import les réutilisera).
 *
 * Audit : `award.bulk_imported` est inséré par le RPC lui-même (cf.
 * migration 00021), pas besoin de logAuditEvent côté Server Action.
 */
export async function bulkCreateAwards(input: unknown): Promise<BulkResult> {
  const parsed = bulkAwardImportSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const data = parsed.data as BulkAwardImportInput;
  const user = await requirePermission('awards.bulk_import');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // 1. Déduplication des emails (un même bénéficiaire peut apparaître plusieurs
  //    fois dans le CSV avec des awards différents — un seul upsert suffit).
  const emailIndex = new Map<
    string,
    { fullName: string; type: BulkAwardImportInput['rows'][number]['beneficiaryType'] }
  >();
  for (const row of data.rows) {
    const key = row.beneficiaryEmail.toLowerCase();
    if (!emailIndex.has(key)) {
      emailIndex.set(key, { fullName: row.beneficiaryFullName, type: row.beneficiaryType });
    }
  }

  // 2. Upsert beneficiaries inline (SELECT par email + INSERT si absent).
  //    Pas d'appel à upsertBeneficiary() pour éviter N×requirePermission +
  //    N×audit_event "beneficiary.created" individuels — on batch tout ici.
  const emailToId = new Map<string, string>();

  // 2a. SELECT en bulk les bénéficiaires déjà existants
  const lowerEmails = Array.from(emailIndex.keys());
  const { data: existing } = await supabase
    .from('beneficiaries')
    .select('id, email')
    .eq('org_id', user.activeOrgId)
    .in('email', lowerEmails)
    .is('deleted_at', null);
  for (const ben of existing ?? []) {
    emailToId.set(ben.email.toLowerCase(), ben.id);
  }

  // 2b. INSERT les bénéficiaires manquants
  const toInsert = Array.from(emailIndex.entries())
    .filter(([email]) => !emailToId.has(email))
    .map(([email, info]) => {
      const parts = info.fullName.trim().split(/\s+/);
      const firstName = parts[0] ?? info.fullName;
      const lastName = parts.slice(1).join(' ') || '—';
      return {
        org_id: user.activeOrgId!,
        email,
        first_name: firstName,
        last_name: lastName,
        beneficiary_type: CSV_TYPE_TO_DB[info.type],
        status: 'active' as const,
        tax_residence_country: 'FR',
      };
    });

  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from('beneficiaries')
      .insert(toInsert)
      .select('id, email');
    if (insErr || !inserted) {
      return { ok: false, error: `Échec upsert bénéficiaires : ${insErr?.message ?? 'inconnu'}` };
    }
    for (const ben of inserted) {
      emailToId.set(ben.email.toLowerCase(), ben.id);
    }
    // Audit per beneficiary created — best-effort, non-bloquant.
    await Promise.allSettled(
      inserted.map((ben) =>
        logAuditEvent({
          eventType: 'beneficiary.created',
          resourceType: 'BENEFICIARY',
          resourceId: ben.id,
          metadata: { source: 'bulk_import_csv', email: ben.email },
          userId: user.id,
          userEmail: user.email,
          orgId: user.activeOrgId!,
        }),
      ),
    );
  }

  // 3. Mapping des rows CSV vers les payloads create_award_full
  const rpcRows = data.rows.map((r) => {
    const benId = emailToId.get(r.beneficiaryEmail.toLowerCase());
    if (!benId) {
      // Ne devrait jamais arriver (étape 2 a tout résolu), defense-in-depth.
      throw new Error(`Bénéficiaire non résolu pour ${r.beneficiaryEmail}`);
    }
    return {
      planId: data.planId,
      beneficiaryId: benId,
      unitsGranted: r.unitsGranted,
      exercisePrice: r.exercisePrice ?? '',
      grantDate: r.grantDate,
      vestingStartDate: r.vestingStartDate ?? '',
      expiryDate: '',
      acceptanceDeadline: '',
      initialStatus: 'DRAFT',
    };
  });

  // 4. Appel RPC atomique. Si UNE row échoue, ROLLBACK total côté DB.
  const { data: rpcResult, error } = await supabase.rpc('bulk_create_awards', {
    p_rows: rpcRows as never,
  });
  if (error) return { ok: false, error: error.message };
  const result = rpcResult as { created: number; award_ids: string[] } | null;
  if (!result) return { ok: false, error: 'Réponse bulk_create_awards inattendue' };

  revalidatePath('/dashboard/awards');
  return { ok: true, created: result.created, awardIds: result.award_ids ?? [] };
}

// ---------------------------------------------------------------------------
// 8. createAwardModification — IFRS 2.27-28 modifications post-grant
// ---------------------------------------------------------------------------

/**
 * Crée une modification IFRS 2.27-28 sur un award post-GRANTED.
 *
 * Refactor B6 : délègue tout à la RPC `apply_award_modification` (atomicité
 * + lock row FOR UPDATE + dispatch sur les 5 types + insert valuation_run +
 * audit_event en SQL).
 *
 * 5 types supportés via discriminated union Zod (cf. createModificationSchema) :
 *   - REPRICING        : changes = { exercisePrice }
 *   - EXTENSION        : changes = { expiryDate }
 *   - ACCELERATION     : changes = {} (V1 : "all PENDING tranches")
 *   - ADDITIONAL_GRANT : changes = { unitsAdded }, check pool restant
 *   - CANCELLATION     : changes = { confirmIrreversible: true }
 *
 * Pour les 4 premiers : un valuation_run est inséré en QUEUED, son ID est
 * retourné au caller pour affichage. Pour CANCELLATION : valuationRunId=null.
 *
 * Pas d'audit côté Server Action (le RPC l'insère lui-même — single source
 * of truth + atomique avec le reste).
 */
export async function createAwardModification(
  input: unknown,
): Promise<ActionOk<{ modificationId: string; valuationRunId: string | null }> | ActionError> {
  const parsed = createModificationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, type, changes, reason, effectiveDate } = parsed.data;

  const user = await requirePermission('awards.modify');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_award_modification', {
    p_award_id: awardId,
    p_modification_type: type,
    p_changes: changes as never,
    p_reason: reason,
    p_effective_date: effectiveDate ?? new Date().toISOString().slice(0, 10),
  });

  if (rpcError) return { ok: false, error: rpcError.message };
  const result = rpcResult as { modification_id: string; valuation_run_id: string | null } | null;
  if (!result?.modification_id) {
    return { ok: false, error: 'Réponse apply_award_modification inattendue' };
  }

  revalidatePath('/dashboard/awards');
  revalidatePath(`/dashboard/awards/${awardId}`);
  return {
    ok: true,
    modificationId: result.modification_id,
    valuationRunId: result.valuation_run_id ?? null,
  };
}

// Pas de re-exports : Next.js interdit les exports non-async dans un fichier
// 'use server'. Les schémas Zod et types sont importés directement depuis
// `@equity/shared` côté composants client/server :
//   import { createAwardSchema, awardStatusSchema, type AwardStatus } from '@equity/shared';
