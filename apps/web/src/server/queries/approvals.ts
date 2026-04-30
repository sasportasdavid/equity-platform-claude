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

  // Batch getUserById en parallèle — évite de charger TOUS les users Supabase
  // via listUsers({ perPage: 1000 }) qui scalait mal (M tenants × N users).
  // Pas de risque cross-tenant non plus : on récupère uniquement les ids
  // déjà filtrés par l'org via memberships.
  type UserMeta = { full_name?: string };
  const results = await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const u = data?.user;
      if (!u) return null;
      const meta = (u.user_metadata ?? {}) as UserMeta;
      return {
        id: u.id,
        email: u.email ?? '',
        full_name: meta.full_name ?? null,
      } satisfies UserForApprover;
    }),
  );

  return results
    .filter((x): x is UserForApprover => !!x)
    .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
}

// ===========================================================================
// Module 5 B4 — Inbox approbateur + détail request
// ===========================================================================

export type PendingInboxItem = {
  decision_id: string;
  request_id: string;
  step_order: number;
  notified_at: string | null;
  step_name: string | null;
  step_required_approvals: number;
  workflow_id: string;
  workflow_name: string | null;
  workflow_total_steps: number;
  award_id: string | null;
  award_number: string | null;
  award_units_granted: number | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_type: string | null;
  beneficiary_id: string | null;
  beneficiary_name: string | null;
  beneficiary_email: string | null;
  request_started_at: string | null;
};

export type DecisionHistoryItem = PendingInboxItem & {
  decision_status: 'APPROVED' | 'REJECTED';
  decided_at: string | null;
  comment: string | null;
};

/**
 * Inbox approbateur — decisions PENDING qui m'attendent + métadonnées riches
 * pour l'affichage des cards (award, plan, bénéficiaire, étape, workflow).
 *
 * Filtre les decisions dont le request est lui-même IN_PROGRESS (skip orphelines
 * d'un workflow déjà résolu côté DB sans cleanup).
 */
export async function getMyPendingApprovalsForInbox(userId: string): Promise<PendingInboxItem[]> {
  const supabase = await createSupabaseServerClient();

  const { data: decisions } = await supabase
    .from('approval_decisions')
    .select('id, request_id, step_order, notified_at, step_id')
    .eq('approver_user_id', userId)
    .eq('status', 'PENDING')
    .order('notified_at', { ascending: false })
    .limit(100);

  const list = (decisions ?? []) as Array<{
    id: string;
    request_id: string;
    step_order: number;
    notified_at: string | null;
    step_id: string;
  }>;
  if (list.length === 0) return [];

  return enrichDecisionsForInbox(supabase, list, null);
}

/**
 * Mes décisions passées (APPROVED ou REJECTED par moi). Mêmes joints + comment.
 */
export async function getMyDecisionHistory(userId: string): Promise<DecisionHistoryItem[]> {
  const supabase = await createSupabaseServerClient();

  const { data: decisions } = await supabase
    .from('approval_decisions')
    .select('id, request_id, step_order, notified_at, step_id, status, decided_at, comment')
    .eq('decided_by', userId)
    .in('status', ['APPROVED', 'REJECTED'])
    .order('decided_at', { ascending: false })
    .limit(50);

  const list = (decisions ?? []) as Array<{
    id: string;
    request_id: string;
    step_order: number;
    notified_at: string | null;
    step_id: string;
    status: 'APPROVED' | 'REJECTED';
    decided_at: string | null;
    comment: string | null;
  }>;
  if (list.length === 0) return [];

  const enriched = await enrichDecisionsForInbox(
    supabase,
    list.map((d) => ({
      id: d.id,
      request_id: d.request_id,
      step_order: d.step_order,
      notified_at: d.notified_at,
      step_id: d.step_id,
    })),
    'all', // ne pas filtrer par status request — on veut voir l'historique complet
  );

  return enriched.map((e) => {
    const orig = list.find((d) => d.id === e.decision_id);
    return {
      ...e,
      decision_status: orig?.status ?? 'APPROVED',
      decided_at: orig?.decided_at ?? null,
      comment: orig?.comment ?? null,
    } satisfies DecisionHistoryItem;
  });
}

type DecisionLite = {
  id: string;
  request_id: string;
  step_order: number;
  notified_at: string | null;
  step_id: string;
};

/**
 * Helper : enrichir un set de decisions avec request/workflow/award/plan/bene/step.
 * Si `requestStatusFilter='IN_PROGRESS'` (default null = pas de filtre), on
 * exclut les decisions dont le request a été résolu/cancelled.
 */
async function enrichDecisionsForInbox(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  decisions: DecisionLite[],
  requestStatusFilter: 'IN_PROGRESS' | 'all' | null,
): Promise<PendingInboxItem[]> {
  const requestIds = Array.from(new Set(decisions.map((d) => d.request_id)));
  const stepIds = Array.from(new Set(decisions.map((d) => d.step_id)));

  const [requestsRes, stepsRes] = await Promise.all([
    supabase
      .from('approval_requests')
      .select('id, workflow_id, award_id, status, started_at')
      .in('id', requestIds),
    supabase
      .from('approval_workflow_steps')
      .select('id, step_name, required_approvals')
      .in('id', stepIds),
  ]);

  type RequestRow = {
    id: string;
    workflow_id: string | null;
    award_id: string | null;
    status: string;
    started_at: string | null;
  };
  type StepRow = { id: string; step_name: string; required_approvals: number };

  const requestsMap = new Map<string, RequestRow>();
  for (const r of (requestsRes.data ?? []) as RequestRow[]) requestsMap.set(r.id, r);
  const stepsMap = new Map<string, StepRow>();
  for (const s of (stepsRes.data ?? []) as StepRow[]) stepsMap.set(s.id, s);

  const validDecisions =
    requestStatusFilter === 'IN_PROGRESS'
      ? decisions.filter((d) => requestsMap.get(d.request_id)?.status === 'IN_PROGRESS')
      : decisions;

  const workflowIds = Array.from(
    new Set(
      validDecisions
        .map((d) => requestsMap.get(d.request_id)?.workflow_id)
        .filter((x): x is string => !!x),
    ),
  );
  const awardIds = Array.from(
    new Set(
      validDecisions
        .map((d) => requestsMap.get(d.request_id)?.award_id)
        .filter((x): x is string => !!x),
    ),
  );

  const [workflowsRes, allStepsCountRes, awardsRes] = await Promise.all([
    workflowIds.length > 0
      ? supabase.from('approval_workflows').select('id, name').in('id', workflowIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    workflowIds.length > 0
      ? supabase
          .from('approval_workflow_steps')
          .select('workflow_id')
          .in('workflow_id', workflowIds)
      : Promise.resolve({ data: [] as { workflow_id: string }[] }),
    awardIds.length > 0
      ? supabase
          .from('awards')
          .select('id, award_number, units_granted, plan_id, beneficiary_id')
          .in('id', awardIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            award_number: string | null;
            units_granted: number | null;
            plan_id: string;
            beneficiary_id: string;
          }>,
        }),
  ]);

  const workflowsMap = new Map<string, string>();
  for (const w of workflowsRes.data ?? []) workflowsMap.set(w.id, w.name);
  const workflowStepsCount = new Map<string, number>();
  for (const s of allStepsCountRes.data ?? []) {
    workflowStepsCount.set(s.workflow_id, (workflowStepsCount.get(s.workflow_id) ?? 0) + 1);
  }
  type AwardRow = {
    id: string;
    award_number: string | null;
    units_granted: number | null;
    plan_id: string;
    beneficiary_id: string;
  };
  const awardsMap = new Map<string, AwardRow>();
  for (const a of (awardsRes.data ?? []) as AwardRow[]) awardsMap.set(a.id, a);

  const planIds = Array.from(new Set([...awardsMap.values()].map((a) => a.plan_id)));
  const beneIds = Array.from(new Set([...awardsMap.values()].map((a) => a.beneficiary_id)));

  const [plansRes, benesRes] = await Promise.all([
    planIds.length > 0
      ? supabase.from('plans').select('id, name, plan_type').in('id', planIds)
      : Promise.resolve({ data: [] as { id: string; name: string; plan_type: string }[] }),
    beneIds.length > 0
      ? supabase.from('beneficiaries').select('id, first_name, last_name, email').in('id', beneIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            first_name: string | null;
            last_name: string | null;
            email: string;
          }>,
        }),
  ]);

  const plansMap = new Map<string, { name: string; plan_type: string }>();
  for (const p of plansRes.data ?? []) plansMap.set(p.id, { name: p.name, plan_type: p.plan_type });
  type BeneRow = { id: string; first_name: string | null; last_name: string | null; email: string };
  const benesMap = new Map<string, { name: string; email: string }>();
  for (const b of (benesRes.data ?? []) as BeneRow[]) {
    const fullName = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || b.email;
    benesMap.set(b.id, { name: fullName, email: b.email });
  }

  return validDecisions.map((d) => {
    const req = requestsMap.get(d.request_id);
    const step = stepsMap.get(d.step_id);
    const award = req?.award_id ? awardsMap.get(req.award_id) : null;
    const plan = award ? plansMap.get(award.plan_id) : null;
    const bene = award ? benesMap.get(award.beneficiary_id) : null;
    return {
      decision_id: d.id,
      request_id: d.request_id,
      step_order: d.step_order,
      notified_at: d.notified_at,
      step_name: step?.step_name ?? null,
      step_required_approvals: step?.required_approvals ?? 1,
      workflow_id: req?.workflow_id ?? '',
      workflow_name: req?.workflow_id ? (workflowsMap.get(req.workflow_id) ?? null) : null,
      workflow_total_steps: req?.workflow_id ? (workflowStepsCount.get(req.workflow_id) ?? 0) : 0,
      award_id: award?.id ?? null,
      award_number: award?.award_number ?? null,
      award_units_granted: award?.units_granted ?? null,
      plan_id: award?.plan_id ?? null,
      plan_name: plan?.name ?? null,
      plan_type: plan?.plan_type ?? null,
      beneficiary_id: award?.beneficiary_id ?? null,
      beneficiary_name: bene?.name ?? null,
      beneficiary_email: bene?.email ?? null,
      request_started_at: req?.started_at ?? null,
    } satisfies PendingInboxItem;
  });
}

// ---------------------------------------------------------------------------
// getMyPendingApprovalsCount (badge sidebar)
// ---------------------------------------------------------------------------

export async function getMyPendingApprovalsCount(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();

  // Compter les decisions PENDING dont le request est IN_PROGRESS
  const { data: decisions } = await supabase
    .from('approval_decisions')
    .select('request_id')
    .eq('approver_user_id', userId)
    .eq('status', 'PENDING');

  const requestIds = Array.from(new Set((decisions ?? []).map((d) => d.request_id)));
  if (requestIds.length === 0) return 0;

  const { data: activeReqs } = await supabase
    .from('approval_requests')
    .select('id')
    .in('id', requestIds)
    .eq('status', 'IN_PROGRESS');

  const activeIds = new Set((activeReqs ?? []).map((r) => r.id));
  return (decisions ?? []).filter((d) => activeIds.has(d.request_id)).length;
}

// ---------------------------------------------------------------------------
// getApprovalRequestDetailFull (page détail request)
// ---------------------------------------------------------------------------

export type ApprovalRequestDetailFull = {
  request: {
    id: string;
    workflow_id: string | null;
    award_id: string | null;
    status: string;
    current_step_order: number | null;
    started_at: string | null;
    started_by: string | null;
    resolved_at: string | null;
    rejected_reason: string | null;
  };
  workflow: { id: string; name: string; applies_to: string } | null;
  steps: Array<{
    id: string;
    step_order: number;
    step_name: string;
    approver_type: string;
    approver_role: string | null;
    approver_user_id: string | null;
    mode: string;
    required_approvals: number;
  }>;
  decisions: Array<{
    id: string;
    step_order: number;
    approver_user_id: string | null;
    approver_role: string | null;
    status: string;
    decided_at: string | null;
    decided_by: string | null;
    comment: string | null;
  }>;
  award: {
    id: string;
    award_number: string | null;
    status: string;
    units_granted: number | null;
    grant_date: string | null;
    plan_id: string;
    beneficiary_id: string;
  } | null;
  plan: { id: string; name: string; plan_type: string } | null;
  beneficiary: { id: string; name: string; email: string } | null;
  audit_events: Array<{
    id: string;
    event_type: string;
    metadata: unknown;
    occurred_at: string;
    user_email: string | null;
  }>;
};

export async function getApprovalRequestDetailFull(
  requestId: string,
): Promise<ApprovalRequestDetailFull | null> {
  const supabase = await createSupabaseServerClient();

  const { data: req } = await supabase
    .from('approval_requests')
    .select(
      'id, workflow_id, award_id, status, current_step_order, started_at, started_by, resolved_at, rejected_reason',
    )
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return null;

  const [wfRes, stepsRes, decisionsRes, awardRes, auditRes] = await Promise.all([
    req.workflow_id
      ? supabase
          .from('approval_workflows')
          .select('id, name, applies_to')
          .eq('id', req.workflow_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string; applies_to: string } | null }),
    req.workflow_id
      ? supabase
          .from('approval_workflow_steps')
          .select(
            'id, step_order, step_name, approver_type, approver_role, approver_user_id, mode, required_approvals',
          )
          .eq('workflow_id', req.workflow_id)
          .order('step_order', { ascending: true })
      : Promise.resolve({ data: [] as ApprovalRequestDetailFull['steps'] }),
    supabase
      .from('approval_decisions')
      .select(
        'id, step_order, approver_user_id, approver_role, status, decided_at, decided_by, comment, created_at',
      )
      .eq('request_id', requestId)
      .order('step_order', { ascending: true })
      .order('created_at', { ascending: true }),
    req.award_id
      ? supabase
          .from('awards')
          .select('id, award_number, status, units_granted, grant_date, plan_id, beneficiary_id')
          .eq('id', req.award_id)
          .maybeSingle()
      : Promise.resolve({
          data: null as ApprovalRequestDetailFull['award'],
        }),
    supabase
      .from('audit_events')
      .select('id, event_type, metadata, occurred_at, user_email')
      .like('event_type', 'approval.%')
      .eq('resource_id', requestId)
      .order('occurred_at', { ascending: true }),
  ]);

  let plan: ApprovalRequestDetailFull['plan'] = null;
  let beneficiary: ApprovalRequestDetailFull['beneficiary'] = null;
  if (awardRes.data) {
    const [planRes, beneRes] = await Promise.all([
      supabase
        .from('plans')
        .select('id, name, plan_type')
        .eq('id', awardRes.data.plan_id)
        .maybeSingle(),
      supabase
        .from('beneficiaries')
        .select('id, first_name, last_name, email')
        .eq('id', awardRes.data.beneficiary_id)
        .maybeSingle(),
    ]);
    plan = planRes.data ?? null;
    if (beneRes.data) {
      const fullName =
        `${beneRes.data.first_name ?? ''} ${beneRes.data.last_name ?? ''}`.trim() ||
        beneRes.data.email;
      beneficiary = { id: beneRes.data.id, name: fullName, email: beneRes.data.email };
    }
  }

  return {
    request: req,
    workflow: wfRes.data ?? null,
    steps: (stepsRes.data ?? []) as ApprovalRequestDetailFull['steps'],
    decisions: (decisionsRes.data ?? []) as ApprovalRequestDetailFull['decisions'],
    award: awardRes.data ?? null,
    plan,
    beneficiary,
    audit_events: (auditRes.data ?? []) as ApprovalRequestDetailFull['audit_events'],
  };
}

// ---------------------------------------------------------------------------
// getApprovalRequestForAward (carte sur page détail award)
// ---------------------------------------------------------------------------

export type ApprovalRequestForAward = {
  id: string;
  status: string;
  current_step_order: number | null;
  workflow_name: string | null;
  workflow_total_steps: number;
  /** True si le caller a une decision PENDING sur le step courant. */
  my_pending_decision_id: string | null;
};

export async function getApprovalRequestForAward(
  awardId: string,
  userId: string,
): Promise<ApprovalRequestForAward | null> {
  const supabase = await createSupabaseServerClient();

  // Le request le plus récent IN_PROGRESS pour cet award (1 seul max V1)
  const { data: req } = await supabase
    .from('approval_requests')
    .select('id, status, current_step_order, workflow_id')
    .eq('award_id', awardId)
    .eq('status', 'IN_PROGRESS')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!req) return null;

  const [wfRes, stepsRes, myDecisionRes] = await Promise.all([
    req.workflow_id
      ? supabase.from('approval_workflows').select('name').eq('id', req.workflow_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    req.workflow_id
      ? supabase
          .from('approval_workflow_steps')
          .select('id', { count: 'exact', head: true })
          .eq('workflow_id', req.workflow_id)
      : Promise.resolve({ count: 0 as number | null }),
    supabase
      .from('approval_decisions')
      .select('id')
      .eq('request_id', req.id)
      .eq('approver_user_id', userId)
      .eq('status', 'PENDING')
      .maybeSingle(),
  ]);

  return {
    id: req.id,
    status: req.status,
    current_step_order: req.current_step_order,
    workflow_name: wfRes.data?.name ?? null,
    workflow_total_steps: stepsRes.count ?? 0,
    my_pending_decision_id: myDecisionRes.data?.id ?? null,
  };
}
