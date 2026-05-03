import 'server-only';
import { logAuditEvent } from '@/lib/audit';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 9 B5 — Propagation status approval → exercise (résolution dette #106).
 *
 * Module 5 RPC `record_approval_decision` met à jour `approval_requests.status`
 * mais ne propage PAS sur `exercise_requests.status` (contrairement aux awards
 * où le helper TS `recordDecisionInternal` appelle `transitionAward`). Ce
 * helper comble le trou.
 *
 * Pattern : appelé APRÈS `record_approval_decision` dans les Server Actions
 * `approveExerciseDecision` / `rejectExerciseDecision`. Re-fetch la
 * `approval_request` (NE PAS faire confiance au retour RPC — éviter race
 * condition avec d'autres décisions concurrentes), détermine si workflow
 * résolu, propage si oui.
 *
 * Résilience à la dégradation : si la propagation échoue après le record_
 * approval_decision réussi, la décision reste persistée — l'erreur est
 * remontée mais NE doit PAS faire échouer la Server Action côté caller
 * (la décision est valide, juste son effet sur exercise_requests à rejouer
 * manuellement).
 *
 * Idempotence : UPDATE WHERE status='PENDING' garantit qu'un re-run ne
 * casse pas l'état si l'exercise est déjà APPROVED/REJECTED ou si l'admin
 * l'a CANCELLED entre-temps (no-op silencieux).
 *
 * Service_role utilisé pour bypass RLS (audit + UPDATE depuis context déjà
 * authentifié + autorisé en amont par requireUser/requirePermission dans le
 * Server Action caller).
 */

export type PropagationResult =
  | {
      ok: true;
      data: {
        newExerciseStatus: 'APPROVED' | 'REJECTED' | 'PENDING';
        approvalStatusFinal: boolean;
      };
    }
  | { ok: false; error: string };

export type PropagateExerciseInput = {
  exerciseRequestId: string;
  approvalRequestId: string;
  /** Décision qui vient d'être enregistrée (passée par le caller pour audit). */
  decision: 'APPROVED' | 'REJECTED';
  /** Comment / motif passé à record_approval_decision. */
  reason?: string | null;
  /** User qui a pris la décision (audit). */
  actorUserId: string;
};

export async function propagateExerciseApprovalDecision(
  input: PropagateExerciseInput,
): Promise<PropagationResult> {
  if (!input.actorUserId) {
    throw new Error('actorUserId required for propagation audit');
  }

  const admin = getSupabaseAdminClient();

  // 1. Re-fetch approval_request status (source of truth — pas de race)
  const { data: approval, error: approvalErr } = await admin
    .from('approval_requests')
    .select('id, status, rejected_reason, org_id')
    .eq('id', input.approvalRequestId)
    .maybeSingle();

  if (approvalErr || !approval) {
    return {
      ok: false,
      error: approvalErr?.message ?? `Approval request ${input.approvalRequestId} introuvable`,
    };
  }

  // 2. Si workflow encore IN_PROGRESS → no-op (étape intermédiaire)
  if (approval.status === 'IN_PROGRESS') {
    return {
      ok: true,
      data: { newExerciseStatus: 'PENDING', approvalStatusFinal: false },
    };
  }

  // 3. Workflow résolu → propager sur exercise_requests
  const newStatus: 'APPROVED' | 'REJECTED' =
    approval.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  // Guard idempotence : seul PENDING transitionnable. Si exercise déjà
  // CANCELLED / APPROVED / REJECTED par autre flow → no-op.
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
  if (newStatus === 'APPROVED') {
    updatePayload.approved_at = new Date().toISOString();
  } else {
    updatePayload.rejected_reason = approval.rejected_reason ?? input.reason ?? null;
  }

  const { data: updatedRows, error: updateErr } = await admin
    .from('exercise_requests')
    .update(updatePayload as never)
    .eq('id', input.exerciseRequestId)
    .eq('status', 'PENDING')
    .select('id, status');

  if (updateErr) {
    return { ok: false, error: `Exercise UPDATE échoué : ${updateErr.message}` };
  }

  // Si 0 row mise à jour → exercise n'était pas PENDING (idempotence guard
  // hit) — c'est OK, ne pas auditer faux positif.
  const propagated = (updatedRows ?? []).length > 0;
  if (!propagated) {
    return {
      ok: true,
      data: { newExerciseStatus: newStatus, approvalStatusFinal: true },
    };
  }

  // 4. Audit (best-effort — logAuditEvent ne throw pas)
  await logAuditEvent({
    eventType: newStatus === 'APPROVED' ? 'exercise.approved' : 'exercise.rejected',
    resourceType: 'exercise_request',
    resourceId: input.exerciseRequestId,
    userId: input.actorUserId,
    orgId: approval.org_id,
    metadata: {
      approval_request_id: input.approvalRequestId,
      decision: input.decision,
      reason: input.reason ?? null,
      propagated_via: 'propagateExerciseApprovalDecision',
    },
  });

  return {
    ok: true,
    data: { newExerciseStatus: newStatus, approvalStatusFinal: true },
  };
}
