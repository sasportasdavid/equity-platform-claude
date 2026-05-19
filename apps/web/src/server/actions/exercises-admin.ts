'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { propagateExerciseApprovalDecision } from '@/server/actions/_helpers/propagate-exercise-status';
import {
  generateExerciseNotification,
  generateSubscriptionBulletin,
} from '@/server/actions/_helpers/exercise-documents';
import {
  notifyBeneficiaryOfExerciseDecision,
  notifyBeneficiaryOfExercisePayment,
} from '@/server/actions/_helpers/exercise-notifications';

/**
 * Module 9 B4 — Server Actions admin pour les exercise_requests.
 *
 * Ces actions s'exécutent côté `/dashboard/exercises/[id]` et délèguent
 * aux RPCs Module 5 / Module 9 B1 :
 *
 * - approveExerciseDecision / rejectExerciseDecision : trouve la
 *   `approval_decision` PENDING du user courant pour la request, puis
 *   appelle `record_approval_decision` (RPC Module 5). Le trigger DB
 *   propage le `exercise_requests.status` au final (APPROVED/REJECTED).
 *
 * - confirmExercisePayment : wrapper RPC `confirm_exercise_payment`
 *   (Module 9 B1, vérifie permission `exercises.confirm_payment` côté DB).
 *
 * - adminCancelExercise : OWNER override du cancel beneficiary.
 *   Wrapper RPC `cancel_exercise_request`.
 */

type ActionOk<T> = { ok: true } & T;
type ActionError = { ok: false; error: string; validationIssues?: number };

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

const exerciseDecisionSchema = z.object({
  exerciseRequestId: z.string().uuid(),
  comment: z.string().max(2000).optional(),
});

const exerciseRejectSchema = z.object({
  exerciseRequestId: z.string().uuid(),
  comment: z.string().min(10, 'Le motif de rejet doit contenir au moins 10 caractères').max(2000),
});

const confirmPaymentSchema = z.object({
  exerciseRequestId: z.string().uuid(),
  paymentAmountReceived: z.number().nonnegative(),
  paymentReference: z.string().min(1).max(200),
  adminNotes: z.string().max(2000).optional(),
});

const adminCancelSchema = z.object({
  exerciseRequestId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

/**
 * Trouve la décision PENDING du user courant pour cette exercise_request.
 * Retourne null si rien trouvé (l'admin n'est pas un approbateur valide
 * de cette étape).
 */
async function findUserPendingDecision(
  exerciseRequestId: string,
  userId: string,
): Promise<{ decisionId: string } | null> {
  const supabase = await createSupabaseServerClient();

  const { data: req } = await supabase
    .from('exercise_requests')
    .select('approval_request_id')
    .eq('id', exerciseRequestId)
    .maybeSingle();

  if (!req?.approval_request_id) return null;

  const { data: dec } = await supabase
    .from('approval_decisions')
    .select('id, step_order')
    .eq('request_id', req.approval_request_id)
    .eq('approver_user_id', userId)
    .eq('status', 'PENDING')
    .order('step_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  return dec ? { decisionId: dec.id } : null;
}

export async function approveExerciseDecision(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = exerciseDecisionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const user = await requireUser();
  // R4 audit RBAC 2026-05-19 : defense-in-depth. La RPC record_approval_decision
  // vérifie déjà `approvals.act` côté DB, mais on duplique au TS pour ne pas
  // dépendre uniquement de la couche RPC en cas de régression silencieuse.
  if (!(await hasPermission('approvals.act'))) {
    return { ok: false, error: 'Permission refusée : approvals.act' };
  }
  const decision = await findUserPendingDecision(parsed.data.exerciseRequestId, user.id);
  if (!decision) {
    return {
      ok: false,
      error: 'Aucune décision en attente pour vous sur cette demande.',
    };
  }

  const supabase = await createSupabaseServerClient();

  // Récupère l'approval_request_id avant le record (évite re-fetch après)
  const { data: req } = await supabase
    .from('exercise_requests')
    .select('approval_request_id')
    .eq('id', parsed.data.exerciseRequestId)
    .maybeSingle();

  const { error } = await supabase.rpc('record_approval_decision', {
    p_decision_id: decision.decisionId,
    p_status: 'APPROVED',
    p_comment: parsed.data.comment ?? '',
  });

  if (error) return { ok: false, error: error.message };

  // Module 9 B5 — propagation status (#106) + génération PDF + email
  // bénéficiaire en fire-and-forget. La décision est persistée même si
  // un de ces hooks foire — l'admin peut rejouer manuellement.
  if (req?.approval_request_id) {
    const propagation = await propagateExerciseApprovalDecision({
      exerciseRequestId: parsed.data.exerciseRequestId,
      approvalRequestId: req.approval_request_id,
      decision: 'APPROVED',
      reason: parsed.data.comment ?? null,
      actorUserId: user.id,
    });

    if (propagation.ok && propagation.data.newExerciseStatus === 'APPROVED') {
      // PDF EXERCISE_NOTIFICATION + email exercise_request_approved
      void generateExerciseNotification({
        exerciseRequestId: parsed.data.exerciseRequestId,
      }).catch((err) =>
        console.error('[approveExerciseDecision] generateExerciseNotification failed:', err),
      );
      void notifyBeneficiaryOfExerciseDecision({
        exerciseRequestId: parsed.data.exerciseRequestId,
        decision: 'APPROVED',
        approverName: (user as { email?: string | null }).email ?? 'Approbateur',
      }).catch((err) =>
        console.error('[approveExerciseDecision] notifyBeneficiaryOfExerciseDecision failed:', err),
      );
    } else if (!propagation.ok) {
      console.error('[approveExerciseDecision] propagation failed:', propagation.error);
    }
  }

  revalidatePath('/dashboard/exercises');
  revalidatePath(`/dashboard/exercises/${parsed.data.exerciseRequestId}`);
  return { ok: true };
}

export async function rejectExerciseDecision(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = exerciseRejectSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const user = await requireUser();
  // R4 audit RBAC 2026-05-19 : defense-in-depth (idem approveExerciseDecision).
  if (!(await hasPermission('approvals.act'))) {
    return { ok: false, error: 'Permission refusée : approvals.act' };
  }
  const decision = await findUserPendingDecision(parsed.data.exerciseRequestId, user.id);
  if (!decision) {
    return {
      ok: false,
      error: 'Aucune décision en attente pour vous sur cette demande.',
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data: req } = await supabase
    .from('exercise_requests')
    .select('approval_request_id')
    .eq('id', parsed.data.exerciseRequestId)
    .maybeSingle();

  const { error } = await supabase.rpc('record_approval_decision', {
    p_decision_id: decision.decisionId,
    p_status: 'REJECTED',
    p_comment: parsed.data.comment,
  });

  if (error) return { ok: false, error: error.message };

  // Module 9 B5 — propagation + email rejected (pas de PDF si rejected)
  if (req?.approval_request_id) {
    const propagation = await propagateExerciseApprovalDecision({
      exerciseRequestId: parsed.data.exerciseRequestId,
      approvalRequestId: req.approval_request_id,
      decision: 'REJECTED',
      reason: parsed.data.comment,
      actorUserId: user.id,
    });

    if (propagation.ok && propagation.data.newExerciseStatus === 'REJECTED') {
      void notifyBeneficiaryOfExerciseDecision({
        exerciseRequestId: parsed.data.exerciseRequestId,
        decision: 'REJECTED',
        reason: parsed.data.comment,
        approverName: (user as { email?: string | null }).email ?? 'Approbateur',
        stepName: 'Validation',
      }).catch((err) =>
        console.error('[rejectExerciseDecision] notifyBeneficiaryOfExerciseDecision failed:', err),
      );
    } else if (!propagation.ok) {
      console.error('[rejectExerciseDecision] propagation failed:', propagation.error);
    }
  }

  revalidatePath('/dashboard/exercises');
  revalidatePath(`/dashboard/exercises/${parsed.data.exerciseRequestId}`);
  return { ok: true };
}

export async function confirmExercisePayment(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = confirmPaymentSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  await requireUser();
  // Permission check: 'exercises.confirm_payment' (RPC vérifie aussi DB-side)
  if (!(await hasPermission('exercises.confirm_payment'))) {
    return { ok: false, error: 'Permission refusée : exercises.confirm_payment' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('confirm_exercise_payment', {
    p_exercise_request_id: parsed.data.exerciseRequestId,
    p_payment_amount_received: parsed.data.paymentAmountReceived,
    p_payment_reference: parsed.data.paymentReference,
    p_admin_notes: parsed.data.adminNotes ?? undefined,
  });

  if (error) return { ok: false, error: error.message };

  // Module 9 B5 — bulletin PDF + email payment confirmed (fire-and-forget)
  void generateSubscriptionBulletin({
    exerciseRequestId: parsed.data.exerciseRequestId,
  }).catch((err) =>
    console.error('[confirmExercisePayment] generateSubscriptionBulletin failed:', err),
  );
  void notifyBeneficiaryOfExercisePayment({
    exerciseRequestId: parsed.data.exerciseRequestId,
  }).catch((err) =>
    console.error('[confirmExercisePayment] notifyBeneficiaryOfExercisePayment failed:', err),
  );

  revalidatePath('/dashboard/exercises');
  revalidatePath(`/dashboard/exercises/${parsed.data.exerciseRequestId}`);
  revalidatePath('/portal/exercises');
  return { ok: true };
}

/**
 * Cancel admin (OWNER override). Le RPC `cancel_exercise_request`
 * accepte les 2 paths (own / any) selon la permission. On vérifie
 * `exercises.cancel.any` côté Server Action pour éviter les confusions
 * (un user avec cancel.own arrive via un autre flow côté portail).
 */
export async function adminCancelExercise(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = adminCancelSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const user = await requireUser();
  if (!(await hasPermission('exercises.cancel.any'))) {
    return { ok: false, error: 'Permission refusée : exercises.cancel.any (réservé OWNER).' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('cancel_exercise_request', {
    p_exercise_request_id: parsed.data.exerciseRequestId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  // Module 9 B5 — email bénéficiaire (fire-and-forget). Pas de PDF.
  void notifyBeneficiaryOfExerciseDecision({
    exerciseRequestId: parsed.data.exerciseRequestId,
    decision: 'CANCELLED_BY_ADMIN',
    reason: parsed.data.reason,
    adminName: (user as { email?: string | null }).email ?? 'Administrateur',
  }).catch((err) =>
    console.error('[adminCancelExercise] notifyBeneficiaryOfExerciseDecision failed:', err),
  );

  revalidatePath('/dashboard/exercises');
  revalidatePath(`/dashboard/exercises/${parsed.data.exerciseRequestId}`);
  revalidatePath('/portal/exercises');
  return { ok: true };
}
