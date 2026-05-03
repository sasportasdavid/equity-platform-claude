import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ExerciseRequestSummary } from '@equity/shared';

/**
 * Module 9 B3 — Queries serveur des exercise_requests pour le portail.
 *
 * RLS garantit que `BENEFICIARY` voit uniquement ses propres rows
 * (policy SELECT own en migration 00057). Pas besoin d'admin client.
 */

export class ExerciseQueryError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NOT_AUTHENTICATED' | 'UNKNOWN' = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ExerciseQueryError';
  }
}

/**
 * Liste les exercise_requests du bénéficiaire courant. RLS filtre.
 * Tri descendant par `requested_at` pour avoir les plus récentes en premier.
 */
export async function listMyExerciseRequests(): Promise<ExerciseRequestSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('exercise_requests')
    .select(
      'id, request_number, status, award_id, units_to_exercise, exercise_price_per_unit, total_exercise_amount, fmv_per_unit_at_request, payment_method, requested_at, completed_at, cancelled_at',
    )
    .is('deleted_at', null)
    .order('requested_at', { ascending: false });

  if (error) {
    throw new ExerciseQueryError(error.message);
  }

  return (data ?? []).map((row) => ({
    ...row,
    units_to_exercise: Number(row.units_to_exercise),
    exercise_price_per_unit: Number(row.exercise_price_per_unit),
    total_exercise_amount:
      row.total_exercise_amount !== null ? Number(row.total_exercise_amount) : null,
    fmv_per_unit_at_request:
      row.fmv_per_unit_at_request !== null ? Number(row.fmv_per_unit_at_request) : null,
  })) as ExerciseRequestSummary[];
}

/**
 * Charge le détail complet d'une exercise_request avec son award lié.
 *
 * RLS filtre côté DB (la query échoue silencieusement = NOT_FOUND si
 * l'utilisateur tente d'accéder à une demande qui ne lui appartient pas).
 */
export async function getExerciseRequestDetail(id: string): Promise<{
  request: {
    id: string;
    request_number: string | null;
    status: string;
    award_id: string;
    org_id: string;
    units_to_exercise: number;
    exercise_price_per_unit: number;
    total_exercise_amount: number | null;
    fmv_per_unit_at_request: number | null;
    payment_method: string | null;
    payment_reference: string | null;
    payment_amount_received: number | null;
    payment_received_at: string | null;
    beneficiary_notes: string | null;
    admin_notes: string | null;
    rejected_reason: string | null;
    cancellation_reason: string | null;
    requested_at: string;
    approved_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    approval_request_id: string | null;
    bulletin_document_id: string | null;
    notification_document_id: string | null;
    certificate_document_id: string | null;
    tax_simulation_snapshot: unknown;
  };
  award: {
    id: string;
    award_number: string | null;
    plan_id: string;
    units_granted: number;
    units_exercised: number;
    exercise_price: number | null;
  };
  plan: {
    id: string;
    name: string;
    plan_type: string;
  };
}> {
  const supabase = await createSupabaseServerClient();

  const { data: req, error: reqErr } = await supabase
    .from('exercise_requests')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (reqErr) {
    throw new ExerciseQueryError(reqErr.message);
  }
  if (!req) {
    throw new ExerciseQueryError('Exercise request not found', 'NOT_FOUND');
  }

  const { data: aw, error: awErr } = await supabase
    .from('awards')
    .select('id, award_number, plan_id, units_granted, units_exercised, exercise_price')
    .eq('id', req.award_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (awErr || !aw) {
    throw new ExerciseQueryError('Award not found for request', 'NOT_FOUND');
  }

  const { data: pl, error: plErr } = await supabase
    .from('plans')
    .select('id, name, plan_type')
    .eq('id', aw.plan_id)
    .maybeSingle();

  if (plErr || !pl) {
    throw new ExerciseQueryError('Plan not found for award', 'NOT_FOUND');
  }

  return {
    request: {
      id: req.id,
      request_number: req.request_number,
      status: req.status,
      award_id: req.award_id,
      org_id: req.org_id,
      units_to_exercise: Number(req.units_to_exercise),
      exercise_price_per_unit: Number(req.exercise_price_per_unit),
      total_exercise_amount:
        req.total_exercise_amount !== null ? Number(req.total_exercise_amount) : null,
      fmv_per_unit_at_request:
        req.fmv_per_unit_at_request !== null ? Number(req.fmv_per_unit_at_request) : null,
      payment_method: req.payment_method,
      payment_reference: req.payment_reference,
      payment_amount_received:
        req.payment_amount_received !== null ? Number(req.payment_amount_received) : null,
      payment_received_at: req.payment_received_at,
      beneficiary_notes: req.beneficiary_notes,
      admin_notes: req.admin_notes,
      rejected_reason: req.rejected_reason,
      cancellation_reason: req.cancellation_reason,
      requested_at: req.requested_at,
      approved_at: req.approved_at,
      completed_at: req.completed_at,
      cancelled_at: req.cancelled_at,
      approval_request_id: req.approval_request_id,
      bulletin_document_id: req.bulletin_document_id,
      notification_document_id: req.notification_document_id,
      certificate_document_id: req.certificate_document_id,
      tax_simulation_snapshot: req.tax_simulation_snapshot,
    },
    award: {
      id: aw.id,
      award_number: aw.award_number,
      plan_id: aw.plan_id,
      units_granted: Number(aw.units_granted),
      units_exercised: Number(aw.units_exercised),
      exercise_price: aw.exercise_price !== null ? Number(aw.exercise_price) : null,
    },
    plan: pl,
  };
}
