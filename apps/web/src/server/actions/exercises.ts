'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  cancelExerciseRequestInputSchema,
  createExerciseRequestInputSchema,
  type CancelExerciseRequestInput,
  type CreateExerciseRequestInput,
} from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/rbac';
import { simulateExerciseTax } from '@/lib/tax';

/**
 * Module 9 B3 — Server Actions du portail bénéficiaire pour les
 * exercise_requests.
 *
 * Pattern Result : `{ ok: true, ...data } | { ok: false, error: string }`.
 * Pas de throw — l'UI lit `result.ok`.
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

/**
 * Crée une demande d'exercice. Server Action wrapper du RPC
 * `request_exercise` (Module 9 B1) avec recalcul tax côté serveur pour
 * cohérence (lib stateless = même résultat que le preview client).
 */
export async function createExerciseRequest(input: CreateExerciseRequestInput): Promise<
  | ActionOk<{
      exerciseRequestId: string;
      requestNumber: string | null;
      approvalRequestId: string | null;
      totalAmount: number;
      status: string;
    }>
  | ActionError
> {
  const parsed = createExerciseRequestInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Recharge l'award pour valider et récupérer plan_type / dates
  const { data: award, error: awErr } = await supabase
    .from('awards')
    .select('id, plan_id, grant_date, exercise_price, units_granted')
    .eq('id', data.awardId)
    .is('deleted_at', null)
    .maybeSingle();

  if (awErr || !award) {
    return { ok: false, error: 'Award introuvable' };
  }

  const { data: plan, error: plErr } = await supabase
    .from('plans')
    .select('id, plan_type, company_id')
    .eq('id', award.plan_id)
    .maybeSingle();

  if (plErr || !plan) {
    return { ok: false, error: 'Plan introuvable' };
  }

  if (plan.plan_type === 'AGA') {
    return {
      ok: false,
      error: "Le régime AGA ne permet pas d'exercice (acquisition gratuite uniquement).",
    };
  }

  // Récupère FMV courante société
  const { data: company } = await supabase
    .from('companies')
    .select('last_known_fmv_per_share')
    .eq('id', plan.company_id)
    .maybeSingle();

  const fmvAtExercise =
    company?.last_known_fmv_per_share !== null && company?.last_known_fmv_per_share !== undefined
      ? Number(company.last_known_fmv_per_share)
      : 0;

  // Récupère hireDate du bénéficiaire pour ancienneté BSPCE
  const { data: bene } = await supabase
    .from('beneficiaries')
    .select('id, hire_date')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  // Recalcul tax côté serveur (cohérence avec preview client)
  const cessionDate = data.cessionToggle ? data.cessionDate : undefined;
  const fmvAtCession = data.cessionToggle ? data.cessionPricePerUnit : undefined;

  const taxResult = simulateExerciseTax({
    planType: plan.plan_type as 'BSPCE' | 'STOCK_OPTION' | 'BSA' | 'AGA',
    attributionDate: award.grant_date ? new Date(award.grant_date) : new Date(),
    exerciseDate: new Date(),
    cessionDate,
    hireDate: bene?.hire_date ? new Date(bene.hire_date) : undefined,
    unitsToExercise: data.unitsToExercise,
    strikePrice: Number(award.exercise_price ?? 0),
    fmvAtExercise,
    fmvAtCession,
    tmiMode: 'manual',
    manualTmiRate: 30, // V1 : default 30, l'utilisateur peut surcharger côté UI dans une V2
  });

  const taxSnapshot = taxResult.ok ? taxResult.data : null;

  // Appel RPC SECURITY DEFINER. Compliance + workflow start côté DB.
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('request_exercise', {
    p_award_id: data.awardId,
    p_units_to_exercise: data.unitsToExercise,
    p_payment_method: data.paymentMethod,
    p_beneficiary_notes: data.beneficiaryNotes ?? undefined,
    p_tax_simulation: taxSnapshot as never,
  });

  if (rpcErr) {
    return { ok: false, error: rpcErr.message };
  }

  const result = rpcResult as {
    exercise_request_id: string;
    request_number: string;
    approval_request_id: string;
    total_amount: number;
    status: string;
  };

  revalidatePath('/portal/exercises');
  revalidatePath(`/portal/awards/${data.awardId}`);

  return {
    ok: true,
    exerciseRequestId: result.exercise_request_id,
    requestNumber: result.request_number,
    approvalRequestId: result.approval_request_id,
    totalAmount: Number(result.total_amount),
    status: result.status,
  };
}

/**
 * Annule une demande d'exercice (bénéficiaire propriétaire seulement).
 * Wrapper du RPC `cancel_exercise_request` qui gère le check
 * permissions + status DB-side.
 */
export async function cancelMyExerciseRequest(
  input: CancelExerciseRequestInput,
): Promise<{ ok: true } | ActionError> {
  const parsed = cancelExerciseRequestInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  await requireUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('cancel_exercise_request', {
    p_exercise_request_id: parsed.data.requestId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/portal/exercises');
  revalidatePath(`/portal/exercises/${parsed.data.requestId}`);

  return { ok: true };
}
