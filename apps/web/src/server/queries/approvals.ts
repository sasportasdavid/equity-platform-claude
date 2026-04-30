import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 5 B3 — Server queries pour les workflows d'approbation.
 *
 * Lecture via `createSupabaseServerClient` (RLS user-scoped). Pour la query
 * des users (auth.users) on passe par le client admin (service_role) car la
 * RLS sur auth.users est restrictive.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowAdminListItem = {
  id: string;
  name: string;
  description: string | null;
  applies_to: string;
  plan_type_filter: string[] | null;
  is_active: boolean;
  is_default: boolean;
  attach_to_plan_id: string | null;
  created_at: string;
  /** Plan attaché si présent, sinon null. */
  plan: { id: string; name: string; plan_type: string } | null;
  steps_count: number;
  active_requests_count: number;
  completed_requests_count: number;
};

export type WorkflowStepRow = {
  id: string;
  step_order: number;
  step_name: string;
  approver_type: string;
  approver_role: string | null;
  approver_user_id: string | null;
  mode: string;
  required_approvals: number;
  sla_hours: number | null;
};

export type WorkflowAdminDetail = {
  id: string;
  name: string;
  description: string | null;
  applies_to: string;
  plan_type_filter: string[] | null;
  is_active: boolean;
  is_default: boolean;
  attach_to_plan_id: string | null;
  steps: WorkflowStepRow[];
  plan: { id: string; name: string; plan_type: string } | null;
  /** Limit 5, requests IN_PROGRESS — pour avertir édition bloquée. */
  active_requests: Array<{
    id: string;
    award_id: string | null;
    started_at: string | null;
    current_step_order: number | null;
  }>;
  active_requests_count: number;
};

export type PlanForAttachment = {
  id: string;
  name: string;
  plan_type: string;
};

export type UserForApprover = {
  id: string;
  email: string;
  full_name: string | null;
};

// ---------------------------------------------------------------------------
// listWorkflowsForAdmin
// ---------------------------------------------------------------------------

export async function listWorkflowsForAdmin(): Promise<WorkflowAdminListItem[]> {
  const supabase = await createSupabaseServerClient();

  const { data: workflows, error } = await supabase
    .from('approval_workflows')
    .select(
      'id, name, description, applies_to, plan_type_filter, is_active, is_default, attach_to_plan_id, created_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listWorkflowsForAdmin failed: ${error.message}`);

  const list = (workflows ?? []) as Omit<
    WorkflowAdminListItem,
    'plan' | 'steps_count' | 'active_requests_count' | 'completed_requests_count'
  >[];
  if (list.length === 0) return [];

  const ids = list.map((w) => w.id);
  const planIds = Array.from(
    new Set(list.map((w) => w.attach_to_plan_id).filter((x): x is string => !!x)),
  );

  const [stepsRes, reqsRes, plansRes] = await Promise.all([
    supabase.from('approval_workflow_steps').select('workflow_id').in('workflow_id', ids),
    supabase.from('approval_requests').select('workflow_id, status').in('workflow_id', ids),
    planIds.length > 0
      ? supabase.from('plans').select('id, name, plan_type').in('id', planIds)
      : Promise.resolve({ data: [] as { id: string; name: string; plan_type: string }[] }),
  ]);

  const stepsCount = new Map<string, number>();
  for (const s of stepsRes.data ?? []) {
    stepsCount.set(s.workflow_id, (stepsCount.get(s.workflow_id) ?? 0) + 1);
  }
  const activeCount = new Map<string, number>();
  const completedCount = new Map<string, number>();
  for (const r of reqsRes.data ?? []) {
    if (!r.workflow_id) continue;
    if (r.status === 'IN_PROGRESS') {
      activeCount.set(r.workflow_id, (activeCount.get(r.workflow_id) ?? 0) + 1);
    } else if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(r.status)) {
      completedCount.set(r.workflow_id, (completedCount.get(r.workflow_id) ?? 0) + 1);
    }
  }
  const planMap = new Map(
    (plansRes.data ?? []).map((p) => [p.id, p as { id: string; name: string; plan_type: string }]),
  );

  return list.map((w) => ({
    ...w,
    plan: w.attach_to_plan_id ? (planMap.get(w.attach_to_plan_id) ?? null) : null,
    steps_count: stepsCount.get(w.id) ?? 0,
    active_requests_count: activeCount.get(w.id) ?? 0,
    completed_requests_count: completedCount.get(w.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// getWorkflowDetailForAdmin
// ---------------------------------------------------------------------------

export async function getWorkflowDetailForAdmin(
  workflowId: string,
): Promise<WorkflowAdminDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: wf } = await supabase
    .from('approval_workflows')
    .select(
      'id, name, description, applies_to, plan_type_filter, is_active, is_default, attach_to_plan_id',
    )
    .eq('id', workflowId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!wf) return null;

  const [stepsRes, planRes, activeReqRes, allReqRes] = await Promise.all([
    supabase
      .from('approval_workflow_steps')
      .select(
        'id, step_order, step_name, approver_type, approver_role, approver_user_id, mode, required_approvals, sla_hours',
      )
      .eq('workflow_id', workflowId)
      .order('step_order', { ascending: true }),
    wf.attach_to_plan_id
      ? supabase
          .from('plans')
          .select('id, name, plan_type')
          .eq('id', wf.attach_to_plan_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string; plan_type: string } | null }),
    supabase
      .from('approval_requests')
      .select('id, award_id, started_at, current_step_order')
      .eq('workflow_id', workflowId)
      .eq('status', 'IN_PROGRESS')
      .order('started_at', { ascending: false })
      .limit(5),
    supabase
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', workflowId)
      .eq('status', 'IN_PROGRESS'),
  ]);

  return {
    ...wf,
    steps: (stepsRes.data ?? []) as WorkflowStepRow[],
    plan: planRes.data ?? null,
    active_requests: (activeReqRes.data ?? []) as WorkflowAdminDetail['active_requests'],
    active_requests_count: allReqRes.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// listPlansForWorkflowAttachment
// ---------------------------------------------------------------------------

/**
 * Plans attachables : plans non soft-deleted ET (pas déjà attachés à un
 * autre workflow OU déjà attachés au workflow courant — pour permettre le
 * re-select).
 */
export async function listPlansForWorkflowAttachment(
  currentWorkflowId?: string,
): Promise<PlanForAttachment[]> {
  const supabase = await createSupabaseServerClient();

  // Charger tous les plans actifs
  const { data: plans } = await supabase
    .from('plans')
    .select('id, name, plan_type')
    .order('name', { ascending: true });

  // Charger tous les plans déjà attachés (sauf workflow courant)
  let attachedQ = supabase
    .from('approval_workflows')
    .select('attach_to_plan_id')
    .not('attach_to_plan_id', 'is', null)
    .is('deleted_at', null);
  if (currentWorkflowId) attachedQ = attachedQ.neq('id', currentWorkflowId);
  const { data: attached } = await attachedQ;

  const taken = new Set((attached ?? []).map((r) => r.attach_to_plan_id).filter((x) => !!x));
  return ((plans ?? []) as PlanForAttachment[]).filter((p) => !taken.has(p.id));
}

// ---------------------------------------------------------------------------
// listUsersForWorkflowApprover
// ---------------------------------------------------------------------------

/**
 * Users actifs de l'org courante (pour USER step).
 *
 * Passe par le client admin pour lire `auth.users.email`/`raw_user_meta_data`
 * (RLS restrictive). L'org_id est récupéré du caller via la session.
 */
export async function listUsersForWorkflowApprover(orgId: string): Promise<UserForApprover[]> {
  const admin = getSupabaseAdminClient();

  const { data: members } = await admin
    .from('memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('status', 'ACTIVE');

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  // Use admin auth API to fetch users by id batch
  const { data: usersRes } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const usersAll = usersRes?.users ?? [];

  type UserMeta = { full_name?: string };
  return userIds
    .map((id) => {
      const u = usersAll.find((x) => x.id === id);
      if (!u) return null;
      const meta = (u.user_metadata ?? {}) as UserMeta;
      return {
        id: u.id,
        email: u.email ?? '',
        full_name: meta.full_name ?? null,
      };
    })
    .filter((x): x is UserForApprover => !!x)
    .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
}
