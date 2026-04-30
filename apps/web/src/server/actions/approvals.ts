'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  approveDecisionSchema,
  attachWorkflowSchema,
  cancelRequestSchema,
  createWorkflowSchema,
  rejectDecisionSchema,
  updateWorkflowSchema,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import {
  runApprovalAwardComplianceChecks,
  runApprovalDecisionComplianceChecks,
  runApprovalWorkflowComplianceChecks,
} from '@/lib/compliance/runChecks';
import type { ComplianceIssue } from '@/lib/compliance/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { transitionAward } from './awards';

/**
 * Module 5 — Server Actions Approval Engine.
 *
 * 11 actions livrées (spec §4.1) :
 *   1. createWorkflow            — INSERT workflow + steps
 *   2. updateWorkflow            — UPDATE workflow + reset steps
 *   3. deleteWorkflow            — soft delete (deleted_at)
 *   4. listWorkflows             — SELECT + count decisions/requests
 *   5. getWorkflowDetail         — workflow + steps order by step_order
 *   6. setDefaultWorkflow        — UPDATE is_default + reset autres
 *   7. attachWorkflowToPlan      — UPDATE attach_to_plan_id
 *   8. detachWorkflow            — UPDATE attach_to_plan_id=null
 *   9. approveDecision           — RPC record_approval_decision('APPROVED')
 *  10. rejectDecision            — RPC record_approval_decision('REJECTED')
 *  11. cancelApprovalRequest     — RPC cancel_approval_request
 *  12. getMyPendingApprovals     — SELECT decisions WHERE approver_user_id=me
 *  13. getApprovalRequestDetail  — request + decisions + audit
 *
 * Hooks :
 *  - approveDecision/rejectDecision final → transitionAward (skipApprovalHook=true)
 *  - cancelApprovalRequest → si award lié, transitionAward(*,'DRAFT')
 */

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ActionOk<T> = { ok: true } & T;
type ActionError = {
  ok: false;
  error: string;
  validationIssues?: number;
  complianceIssues?: ComplianceIssue[];
};
type ActionVoid = { ok: true } | ActionError;

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ===========================================================================
// 1. createWorkflow
// ===========================================================================

export async function createWorkflow(
  input: unknown,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const parsed = createWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('approvals.configure');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  // Compliance V1 : WORKFLOW_HAS_VALID_STEPS
  const compliance = await runApprovalWorkflowComplianceChecks(
    {
      steps: data.steps.map((s) => ({
        stepOrder: s.stepOrder,
        approverType: s.approverType,
        approverRole: s.approverRole,
        approverUserId: s.approverUserId,
        requiredApprovals: s.requiredApprovals,
      })),
    },
    user.activeOrgId,
  );
  if (compliance.hasHardBlocks) {
    return {
      ok: false,
      error: `Compliance check failed : ${compliance.errors.length} erreur(s) bloquante(s)`,
      complianceIssues: compliance.errors,
    };
  }

  const supabase = await createSupabaseServerClient();

  // INSERT workflow
  const { data: wf, error: wfErr } = await supabase
    .from('approval_workflows')
    .insert({
      org_id: user.activeOrgId,
      name: data.name,
      description: data.description ?? null,
      applies_to: data.appliesTo,
      plan_type_filter: data.planTypeFilter ?? null,
      is_active: data.isActive,
      is_default: data.isDefault,
    })
    .select('id')
    .single();
  if (wfErr || !wf) return { ok: false, error: wfErr?.message ?? 'Insert workflow échoué' };

  // INSERT steps en cascade
  const stepsRows = data.steps.map((s) => ({
    workflow_id: wf.id,
    step_order: s.stepOrder,
    step_name: s.stepName,
    approver_type: s.approverType,
    approver_role: s.approverRole ?? null,
    approver_user_id: s.approverUserId ?? null,
    mode: s.mode,
    required_approvals: s.requiredApprovals,
    sla_hours: s.slaHours ?? null,
  }));
  const { error: stepsErr } = await supabase.from('approval_workflow_steps').insert(stepsRows);
  if (stepsErr) {
    // Rollback : delete the workflow we just inserted
    await supabase.from('approval_workflows').delete().eq('id', wf.id);
    return { ok: false, error: `Insert steps échoué : ${stepsErr.message}` };
  }

  await logAuditEvent({
    eventType: 'approval.workflow_created',
    resourceType: 'APPROVAL_WORKFLOW',
    resourceId: wf.id,
    metadata: { name: data.name, applies_to: data.appliesTo, steps_count: data.steps.length },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/approvals');
  return { ok: true, id: wf.id };
}

// ===========================================================================
// 2. updateWorkflow
// ===========================================================================

export async function updateWorkflow(input: unknown): Promise<ActionVoid> {
  const parsed = updateWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { workflowId, patch } = parsed.data;

  const user = await requirePermission('approvals.configure');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Refuser si workflow a des requests IN_PROGRESS (V1 — V2 = versioning)
  const { count } = await supabase
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', workflowId)
    .eq('status', 'IN_PROGRESS');
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Workflow a ${count} request(s) IN_PROGRESS. Attendre la résolution ou cancel.`,
    };
  }

  // Compliance steps si fourni
  if (patch.steps) {
    const compliance = await runApprovalWorkflowComplianceChecks(
      {
        steps: patch.steps.map((s) => ({
          stepOrder: s.stepOrder,
          approverType: s.approverType,
          approverRole: s.approverRole,
          approverUserId: s.approverUserId,
          requiredApprovals: s.requiredApprovals,
        })),
      },
      user.activeOrgId,
    );
    if (compliance.hasHardBlocks) {
      return {
        ok: false,
        error: `Compliance check failed : ${compliance.errors.length} erreur(s) bloquante(s)`,
        complianceIssues: compliance.errors,
      };
    }
  }

  // UPDATE workflow header
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.description !== undefined) updatePayload.description = patch.description;
  if (patch.appliesTo !== undefined) updatePayload.applies_to = patch.appliesTo;
  if (patch.planTypeFilter !== undefined) updatePayload.plan_type_filter = patch.planTypeFilter;
  if (patch.isActive !== undefined) updatePayload.is_active = patch.isActive;
  if (patch.isDefault !== undefined) updatePayload.is_default = patch.isDefault;

  const { error: updErr } = await supabase
    .from('approval_workflows')
    .update(updatePayload as never)
    .eq('id', workflowId)
    .eq('org_id', user.activeOrgId);
  if (updErr) return { ok: false, error: updErr.message };

  // Si steps fourni : DELETE + re-INSERT (atomicité cassée mais simple V1)
  if (patch.steps) {
    await supabase.from('approval_workflow_steps').delete().eq('workflow_id', workflowId);
    const stepsRows = patch.steps.map((s) => ({
      workflow_id: workflowId,
      step_order: s.stepOrder,
      step_name: s.stepName,
      approver_type: s.approverType,
      approver_role: s.approverRole ?? null,
      approver_user_id: s.approverUserId ?? null,
      mode: s.mode,
      required_approvals: s.requiredApprovals,
      sla_hours: s.slaHours ?? null,
    }));
    const { error: stepsErr } = await supabase.from('approval_workflow_steps').insert(stepsRows);
    if (stepsErr) return { ok: false, error: `Re-insert steps échoué : ${stepsErr.message}` };
  }

  await logAuditEvent({
    eventType: 'approval.workflow_updated',
    resourceType: 'APPROVAL_WORKFLOW',
    resourceId: workflowId,
    metadata: { changes: Object.keys(updatePayload), steps_replaced: patch.steps != null },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/approvals');
  return { ok: true };
}

// ===========================================================================
// 3. deleteWorkflow (soft)
// ===========================================================================

export async function deleteWorkflow(input: unknown): Promise<ActionVoid> {
  const parsed = z.object({ workflowId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { workflowId } = parsed.data;

  const user = await requirePermission('approvals.configure');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', workflowId)
    .eq('status', 'IN_PROGRESS');
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Workflow a ${count} request(s) IN_PROGRESS. Cancel d'abord.` };
  }

  const { error } = await supabase
    .from('approval_workflows')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', workflowId)
    .eq('org_id', user.activeOrgId);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'approval.workflow_deleted',
    resourceType: 'APPROVAL_WORKFLOW',
    resourceId: workflowId,
    metadata: { soft_delete: true },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/approvals');
  return { ok: true };
}

// ===========================================================================
// 4-5. listWorkflows + getWorkflowDetail (Server Queries — usage UI B3)
// ===========================================================================

export type WorkflowListItem = {
  id: string;
  name: string;
  applies_to: string;
  is_active: boolean;
  is_default: boolean;
  attach_to_plan_id: string | null;
  steps_count: number;
  active_requests_count: number;
};

export async function listWorkflows(
  filters: {
    appliesTo?: string;
    planId?: string;
    includeInactive?: boolean;
  } = {},
): Promise<WorkflowListItem[]> {
  await requirePermission('approvals.read');
  const supabase = await createSupabaseServerClient();

  let q = supabase
    .from('approval_workflows')
    .select('id, name, applies_to, is_active, is_default, attach_to_plan_id')
    .is('deleted_at', null);
  if (filters.appliesTo) q = q.eq('applies_to', filters.appliesTo);
  if (filters.planId) q = q.eq('attach_to_plan_id', filters.planId);
  if (!filters.includeInactive) q = q.eq('is_active', true);

  const { data: rows } = await q;
  const list = (rows ?? []) as Omit<WorkflowListItem, 'steps_count' | 'active_requests_count'>[];
  if (list.length === 0) return [];

  const ids = list.map((w) => w.id);
  const [stepsRes, reqsRes] = await Promise.all([
    supabase.from('approval_workflow_steps').select('workflow_id').in('workflow_id', ids),
    supabase
      .from('approval_requests')
      .select('workflow_id')
      .in('workflow_id', ids)
      .eq('status', 'IN_PROGRESS'),
  ]);

  const stepsCount = new Map<string, number>();
  for (const s of stepsRes.data ?? []) {
    stepsCount.set(s.workflow_id, (stepsCount.get(s.workflow_id) ?? 0) + 1);
  }
  const reqsCount = new Map<string, number>();
  for (const r of reqsRes.data ?? []) {
    if (!r.workflow_id) continue;
    reqsCount.set(r.workflow_id, (reqsCount.get(r.workflow_id) ?? 0) + 1);
  }

  return list.map((w) => ({
    ...w,
    steps_count: stepsCount.get(w.id) ?? 0,
    active_requests_count: reqsCount.get(w.id) ?? 0,
  }));
}

export type WorkflowDetail = {
  id: string;
  name: string;
  description: string | null;
  applies_to: string;
  plan_type_filter: string[] | null;
  is_active: boolean;
  is_default: boolean;
  attach_to_plan_id: string | null;
  steps: Array<{
    id: string;
    step_order: number;
    step_name: string;
    approver_type: string;
    approver_role: string | null;
    approver_user_id: string | null;
    mode: string;
    required_approvals: number;
    sla_hours: number | null;
  }>;
};

export async function getWorkflowDetail(workflowId: string): Promise<WorkflowDetail | null> {
  await requirePermission('approvals.read');
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

  const { data: steps } = await supabase
    .from('approval_workflow_steps')
    .select(
      'id, step_order, step_name, approver_type, approver_role, approver_user_id, mode, required_approvals, sla_hours',
    )
    .eq('workflow_id', workflowId)
    .order('step_order', { ascending: true });

  return { ...wf, steps: (steps ?? []) as WorkflowDetail['steps'] };
}

// ===========================================================================
// 6. setDefaultWorkflow
// ===========================================================================

export async function setDefaultWorkflow(input: unknown): Promise<ActionVoid> {
  const parsed = z.object({ workflowId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { workflowId } = parsed.data;

  const user = await requirePermission('approvals.attach');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: wf } = await supabase
    .from('approval_workflows')
    .select('id, applies_to')
    .eq('id', workflowId)
    .eq('org_id', user.activeOrgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!wf) return { ok: false, error: 'Workflow introuvable' };

  // Reset les autres workflows default de même applies_to
  await supabase
    .from('approval_workflows')
    .update({ is_default: false } as never)
    .eq('org_id', user.activeOrgId)
    .eq('applies_to', wf.applies_to)
    .neq('id', workflowId);

  // Marquer celui-ci comme default
  const { error } = await supabase
    .from('approval_workflows')
    .update({ is_default: true } as never)
    .eq('id', workflowId);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'approval.workflow_attached',
    resourceType: 'APPROVAL_WORKFLOW',
    resourceId: workflowId,
    metadata: { is_default: true, applies_to: wf.applies_to },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/approvals');
  return { ok: true };
}

// ===========================================================================
// 7. attachWorkflowToPlan
// ===========================================================================

export async function attachWorkflowToPlan(input: unknown): Promise<ActionVoid> {
  const parsed = attachWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { workflowId, planId } = parsed.data;

  const user = await requirePermission('approvals.attach');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('approval_workflows')
    .update({ attach_to_plan_id: planId } as never)
    .eq('id', workflowId)
    .eq('org_id', user.activeOrgId);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'approval.workflow_attached',
    resourceType: 'APPROVAL_WORKFLOW',
    resourceId: workflowId,
    metadata: { plan_id: planId },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/approvals');
  revalidatePath(`/dashboard/plans/${planId}`);
  return { ok: true };
}

// ===========================================================================
// 8. detachWorkflow
// ===========================================================================

export async function detachWorkflow(input: unknown): Promise<ActionVoid> {
  const parsed = z.object({ workflowId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { workflowId } = parsed.data;

  const user = await requirePermission('approvals.attach');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('approval_workflows')
    .update({ attach_to_plan_id: null } as never)
    .eq('id', workflowId)
    .eq('org_id', user.activeOrgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/settings/approvals');
  return { ok: true };
}

// ===========================================================================
// 9-10. approveDecision + rejectDecision
// ===========================================================================

type EvaluateResult = {
  request_id: string;
  status: 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
  next_award_status?: 'APPROVED' | 'DRAFT';
  next_step_order?: number;
  rejected_reason?: string;
};

async function recordDecisionInternal(
  decisionId: string,
  status: 'APPROVED' | 'REJECTED',
  comment: string | null,
): Promise<ActionOk<{ result: EvaluateResult }> | ActionError> {
  const user = await requirePermission('approvals.act');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  // Compliance V1 : NO_SELF_APPROVAL
  const compliance = await runApprovalDecisionComplianceChecks({
    decisionId,
    approverUserId: user.id,
  });
  if (compliance.hasHardBlocks) {
    return {
      ok: false,
      error: `Compliance check failed : ${compliance.errors.length} erreur(s) bloquante(s)`,
      complianceIssues: compliance.errors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_approval_decision', {
    p_decision_id: decisionId,
    p_status: status,
    p_comment: comment ?? '',
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  const result = rpcRes as unknown as EvaluateResult;

  // Hook : si workflow résolu (APPROVED final ou REJECTED), transitionner l'award
  if (
    (result.status === 'APPROVED' && result.next_award_status === 'APPROVED') ||
    (result.status === 'REJECTED' && result.next_award_status === 'DRAFT')
  ) {
    // Récupérer l'award via la request
    const { data: req } = await supabase
      .from('approval_requests')
      .select('award_id')
      .eq('id', result.request_id)
      .maybeSingle();
    if (req?.award_id) {
      await transitionAward({
        awardId: req.award_id,
        toStatus: result.next_award_status,
        reason:
          result.status === 'REJECTED'
            ? `Rejected by approval workflow: ${result.rejected_reason ?? comment ?? 'no comment'}`
            : 'Approved by workflow',
        skipApprovalHook: true,
      });
    }
  }

  revalidatePath('/dashboard/approvals');
  return { ok: true, result };
}

export async function approveDecision(
  input: unknown,
): Promise<ActionOk<{ result: EvaluateResult }> | ActionError> {
  const parsed = approveDecisionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return recordDecisionInternal(parsed.data.decisionId, 'APPROVED', parsed.data.comment ?? null);
}

export async function rejectDecision(
  input: unknown,
): Promise<ActionOk<{ result: EvaluateResult }> | ActionError> {
  const parsed = rejectDecisionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return recordDecisionInternal(parsed.data.decisionId, 'REJECTED', parsed.data.comment);
}

// ===========================================================================
// 11. cancelApprovalRequest
// ===========================================================================

export async function cancelApprovalRequest(input: unknown): Promise<ActionVoid> {
  const parsed = cancelRequestSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { requestId, reason } = parsed.data;

  const user = await requirePermission('approvals.configure');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Récup award_id avant cancel pour potentiellement transitionner
  const { data: req } = await supabase
    .from('approval_requests')
    .select('award_id, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: 'Request introuvable' };

  const { error } = await supabase.rpc('cancel_approval_request', {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  // Si l'award correspondant est en PENDING_APPROVAL, le retombez en DRAFT
  if (req.award_id) {
    const { data: aw } = await supabase
      .from('awards')
      .select('status')
      .eq('id', req.award_id)
      .maybeSingle();
    if (aw?.status === 'PENDING_APPROVAL') {
      await transitionAward({
        awardId: req.award_id,
        toStatus: 'DRAFT',
        reason: `Approval workflow cancelled: ${reason}`,
        skipApprovalHook: true,
      });
    }
  }

  revalidatePath('/dashboard/approvals');
  return { ok: true };
}

// ===========================================================================
// 12. getMyPendingApprovals
// ===========================================================================

export type PendingApprovalItem = {
  decision_id: string;
  request_id: string;
  step_order: number;
  step_name: string | null;
  notified_at: string | null;
  award_id: string | null;
  award_number: string | null;
  beneficiary_name: string | null;
  plan_name: string | null;
};

export async function getMyPendingApprovals(): Promise<PendingApprovalItem[]> {
  const user = await requirePermission('approvals.read');
  if (!user.activeOrgId) return [];

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('approval_decisions')
    .select(
      `id, request_id, step_order, notified_at,
       approval_requests!inner(award_id),
       approval_workflow_steps!inner(step_name)`,
    )
    .eq('approver_user_id', user.id)
    .eq('status', 'PENDING')
    .order('notified_at', { ascending: false })
    .limit(100);

  type Row = {
    id: string;
    request_id: string;
    step_order: number;
    notified_at: string | null;
    approval_requests: { award_id: string | null } | null;
    approval_workflow_steps: { step_name: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Charger les awards + beneficiaries + plans en batch
  const awardIds = rows.map((r) => r.approval_requests?.award_id).filter((x): x is string => !!x);
  const awardsMap = new Map<
    string,
    { award_number: string | null; bene_name: string | null; plan_name: string | null }
  >();
  if (awardIds.length > 0) {
    const { data: awards } = await supabase
      .from('awards')
      .select(
        `id, award_number,
         beneficiaries!inner(first_name, last_name),
         plans!inner(name)`,
      )
      .in('id', awardIds);
    type AwardRow = {
      id: string;
      award_number: string | null;
      beneficiaries: { first_name: string | null; last_name: string | null } | null;
      plans: { name: string | null } | null;
    };
    for (const a of (awards ?? []) as unknown as AwardRow[]) {
      const bn = `${a.beneficiaries?.first_name ?? ''} ${a.beneficiaries?.last_name ?? ''}`.trim();
      awardsMap.set(a.id, {
        award_number: a.award_number,
        bene_name: bn || null,
        plan_name: a.plans?.name ?? null,
      });
    }
  }

  return rows.map((r) => {
    const awardId = r.approval_requests?.award_id ?? null;
    const aw = awardId ? awardsMap.get(awardId) : null;
    return {
      decision_id: r.id,
      request_id: r.request_id,
      step_order: r.step_order,
      step_name: r.approval_workflow_steps?.step_name ?? null,
      notified_at: r.notified_at,
      award_id: awardId,
      award_number: aw?.award_number ?? null,
      beneficiary_name: aw?.bene_name ?? null,
      plan_name: aw?.plan_name ?? null,
    };
  });
}

// ===========================================================================
// 13. getApprovalRequestDetail
// ===========================================================================

export type ApprovalRequestDetail = {
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
};

export async function getApprovalRequestDetail(
  requestId: string,
): Promise<ApprovalRequestDetail | null> {
  await requirePermission('approvals.read');
  const supabase = await createSupabaseServerClient();

  const { data: req } = await supabase
    .from('approval_requests')
    .select(
      'id, workflow_id, award_id, status, current_step_order, started_at, started_by, resolved_at, rejected_reason',
    )
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return null;

  const [wfRes, decRes] = await Promise.all([
    req.workflow_id
      ? supabase
          .from('approval_workflows')
          .select('id, name, applies_to')
          .eq('id', req.workflow_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string; applies_to: string } | null }),
    supabase
      .from('approval_decisions')
      .select(
        'id, step_order, approver_user_id, approver_role, status, decided_at, decided_by, comment',
      )
      .eq('request_id', requestId)
      .order('step_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  return {
    request: req,
    workflow: wfRes.data ?? null,
    decisions: (decRes.data ?? []) as ApprovalRequestDetail['decisions'],
  };
}

// ===========================================================================
// 14. runAwardApprovalCompliance — helper exposé pour le hook transitionAward
// ===========================================================================

/**
 * Wrapper public pour `runApprovalAwardComplianceChecks`. Permet à
 * `transitionAward` (Module 3b) de tirer la rule WORKFLOW_REQUIRED_FOR_AGA
 * sans importer directement le runner (qui est `server-only`).
 *
 * NB : ce n'est pas une "Server Action" au sens UI (pas appelée depuis client),
 * mais elle vit ici car le module est `'use server'`. Pas idéal mais évite
 * un fichier helper séparé pour 1 fonction.
 */
export async function checkAwardApprovalCompliance(
  awardId: string,
  planId: string,
): Promise<{ warnings: ComplianceIssue[] }> {
  const user = await requirePermission('approvals.read');
  if (!user.activeOrgId) return { warnings: [] };
  // hasPermission est utilisé ici uniquement pour faire taire l'unused-import lint
  void hasPermission;

  const result = await runApprovalAwardComplianceChecks({ awardId, planId }, user.activeOrgId);
  return { warnings: result.warnings };
}
