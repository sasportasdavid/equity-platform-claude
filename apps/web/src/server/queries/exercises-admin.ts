import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 9 B4 — Queries admin pour /dashboard/exercises et
 * /dashboard/settings/exercise-workflows.
 *
 * Lecture via `createSupabaseServerClient` (RLS user-scoped : la policy
 * `exercise_requests_select_admin` filtre par `org_id = current_org_id() AND
 * has_permission('exercises.read.all')`).
 *
 * Pour le nom du bénéficiaire (auth.users.email + beneficiaries) on
 * peut tout récupérer via la jointure RLS-friendly.
 */

export type ExerciseRequestAdminRow = {
  id: string;
  request_number: string | null;
  status: string;
  units_to_exercise: number;
  exercise_price_per_unit: number;
  total_exercise_amount: number | null;
  fmv_per_unit_at_request: number | null;
  payment_method: string | null;
  requested_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  award_id: string;
  award_number: string | null;
  beneficiary_id: string;
  beneficiary_first_name: string | null;
  beneficiary_last_name: string | null;
  plan_type: string;
  plan_name: string;
};

/**
 * Liste les exercise_requests visibles pour l'admin courant (filtre RLS
 * org_id + permission exercises.read.all). Tri created_at DESC.
 *
 * Le filtre status est optionnel : si absent, retourne toutes les rows
 * non soft-deleted. Pour le filtre "annulées et rejetées" combiné, on
 * passe `['CANCELLED', 'REJECTED']` (array OR).
 */
export async function listExerciseRequestsAdmin(filters?: {
  statuses?: string[];
}): Promise<ExerciseRequestAdminRow[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('exercise_requests')
    .select(
      `
        id, request_number, status, units_to_exercise,
        exercise_price_per_unit, total_exercise_amount,
        fmv_per_unit_at_request, payment_method, requested_at,
        completed_at, cancelled_at, award_id, beneficiary_id,
        awards!inner(award_number, plan_id, plans!inner(plan_type, name)),
        beneficiaries!inner(first_name, last_name)
      `,
    )
    .is('deleted_at', null)
    .order('requested_at', { ascending: false });

  if (filters?.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const award = row.awards as unknown as {
      award_number: string | null;
      plan_id: string;
      plans: { plan_type: string; name: string };
    };
    const bene = row.beneficiaries as unknown as {
      first_name: string | null;
      last_name: string | null;
    };
    return {
      id: row.id,
      request_number: row.request_number,
      status: row.status,
      units_to_exercise: Number(row.units_to_exercise),
      exercise_price_per_unit: Number(row.exercise_price_per_unit),
      total_exercise_amount:
        row.total_exercise_amount !== null ? Number(row.total_exercise_amount) : null,
      fmv_per_unit_at_request:
        row.fmv_per_unit_at_request !== null ? Number(row.fmv_per_unit_at_request) : null,
      payment_method: row.payment_method,
      requested_at: row.requested_at,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
      award_id: row.award_id,
      award_number: award?.award_number ?? null,
      beneficiary_id: row.beneficiary_id,
      beneficiary_first_name: bene?.first_name ?? null,
      beneficiary_last_name: bene?.last_name ?? null,
      plan_type: award?.plans?.plan_type ?? '',
      plan_name: award?.plans?.name ?? '',
    };
  });
}

/**
 * Compte les exercise_requests par status pour les Tabs filters.
 * Une seule query GROUP BY pour éviter 4 round-trips.
 */
export async function countExerciseRequestsByStatus(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('exercise_requests')
    .select('status')
    .is('deleted_at', null);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

export type AdminExerciseDetail = {
  request: {
    id: string;
    request_number: string | null;
    status: string;
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
    tax_simulation_snapshot: unknown;
  };
  award: {
    id: string;
    award_number: string | null;
    units_granted: number;
    units_exercised: number;
    grant_date: string | null;
    exercise_price: number | null;
  };
  plan: {
    id: string;
    name: string;
    plan_type: string;
  };
  beneficiary: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    hire_date: string | null;
  };
};

/**
 * Détail complet d'une exercise_request pour l'admin. RLS filtre
 * naturellement (admin doit avoir exercises.read.all + same org).
 *
 * Pour l'email du bénéficiaire on utilise le client admin (auth.users
 * est restrictif RLS) — read-only sur les champs publics.
 */
export async function getExerciseRequestAdminDetail(
  id: string,
): Promise<AdminExerciseDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: req, error } = await supabase
    .from('exercise_requests')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !req) return null;

  const { data: aw } = await supabase
    .from('awards')
    .select('id, award_number, plan_id, units_granted, units_exercised, grant_date, exercise_price')
    .eq('id', req.award_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!aw) return null;

  const { data: pl } = await supabase
    .from('plans')
    .select('id, name, plan_type')
    .eq('id', aw.plan_id)
    .maybeSingle();

  if (!pl) return null;

  const { data: bene } = await supabase
    .from('beneficiaries')
    .select('id, first_name, last_name, hire_date, user_id')
    .eq('id', req.beneficiary_id)
    .maybeSingle();

  let email: string | null = null;
  if (bene?.user_id) {
    const admin = getSupabaseAdminClient();
    const { data: userRow } = await admin.auth.admin.getUserById(bene.user_id);
    email = userRow.user?.email ?? null;
  }

  return {
    request: {
      id: req.id,
      request_number: req.request_number,
      status: req.status,
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
      tax_simulation_snapshot: req.tax_simulation_snapshot,
    },
    award: {
      id: aw.id,
      award_number: aw.award_number,
      units_granted: Number(aw.units_granted),
      units_exercised: Number(aw.units_exercised),
      grant_date: aw.grant_date,
      exercise_price: aw.exercise_price !== null ? Number(aw.exercise_price) : null,
    },
    plan: pl,
    beneficiary: {
      id: bene?.id ?? req.beneficiary_id,
      first_name: bene?.first_name ?? null,
      last_name: bene?.last_name ?? null,
      email,
      hire_date: bene?.hire_date ?? null,
    },
  };
}

export type WorkflowReadOnlyRow = {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  steps: Array<{
    step_order: number;
    step_name: string;
    approver_type: string;
    approver_role: string | null;
    amount_threshold_min: number | null;
    amount_threshold_max: number | null;
  }>;
};

/**
 * Liste les workflows EXERCISE_REQUEST (read-only V1, edit en V2).
 */
export async function listExerciseWorkflowsReadOnly(): Promise<WorkflowReadOnlyRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('approval_workflows')
    .select(
      `
        id, name, is_default, is_active,
        approval_workflow_steps(step_order, step_name, approver_type, approver_role, amount_threshold_min, amount_threshold_max)
      `,
    )
    .eq('applies_to', 'EXERCISE_REQUEST')
    .is('deleted_at', null)
    .order('is_default', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const steps = (row.approval_workflow_steps ?? []) as Array<{
      step_order: number;
      step_name: string;
      approver_type: string;
      approver_role: string | null;
      amount_threshold_min: number | string | null;
      amount_threshold_max: number | string | null;
    }>;
    return {
      id: row.id,
      name: row.name,
      is_default: row.is_default,
      is_active: row.is_active,
      steps: steps
        .map((s) => ({
          step_order: s.step_order,
          step_name: s.step_name,
          approver_type: s.approver_type,
          approver_role: s.approver_role,
          amount_threshold_min:
            s.amount_threshold_min !== null ? Number(s.amount_threshold_min) : null,
          amount_threshold_max:
            s.amount_threshold_max !== null ? Number(s.amount_threshold_max) : null,
        }))
        .sort((a, b) => a.step_order - b.step_order),
    };
  });
}
