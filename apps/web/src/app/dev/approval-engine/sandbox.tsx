'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  approveDecision,
  attachWorkflowToPlan,
  cancelApprovalRequest,
  createWorkflow,
  deleteWorkflow,
  detachWorkflow,
  rejectDecision,
  type PendingApprovalItem,
  type WorkflowListItem,
} from '@/server/actions/approvals';
import { transitionAward } from '@/server/actions/awards';

type RequestRow = {
  id: string;
  status: string;
  workflow_id: string | null;
  award_id: string | null;
  current_step_order: number | null;
  started_at: string | null;
  resolved_at: string | null;
  rejected_reason: string | null;
};

type AwardRow = {
  id: string;
  award_number: string | null;
  status: string;
  plan_id: string;
  beneficiary_id: string;
};

type AuditRow = {
  id: string;
  event_type: string;
  resource_id: string | null;
  metadata: unknown;
  occurred_at: string;
  user_email: string | null;
};

const STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: 'bg-amber-500/10 text-amber-700 border-amber-500/40 dark:text-amber-400',
  APPROVED: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/40 dark:text-emerald-400',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/40',
  CANCELLED: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

export function Sandbox({
  workflows,
  pendingApprovals,
  requests,
  awards,
  auditEvents,
}: {
  workflows: WorkflowListItem[];
  pendingApprovals: PendingApprovalItem[];
  requests: RequestRow[];
  awards: AwardRow[];
  auditEvents: AuditRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [planIdToAttach, setPlanIdToAttach] = useState('');

  function handleCreateSimpleWorkflow() {
    startTransition(async () => {
      const res = await createWorkflow({
        name: `Test Simple ${new Date().toISOString().slice(11, 19)}`,
        appliesTo: 'AWARD_GRANT',
        isActive: true,
        isDefault: false,
        steps: [
          {
            stepOrder: 1,
            stepName: 'Approver step',
            approverType: 'ROLE',
            approverRole: 'APPROVER',
            mode: 'SEQUENTIAL',
            requiredApprovals: 1,
          },
        ],
      });
      if (res.ok) {
        toast.success(`Workflow créé (${res.id.slice(0, 8)}…)`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleCreate3StepsWorkflow() {
    startTransition(async () => {
      const res = await createWorkflow({
        name: `Test 3-steps ${new Date().toISOString().slice(11, 19)}`,
        appliesTo: 'AWARD_GRANT',
        isActive: true,
        isDefault: false,
        steps: [
          {
            stepOrder: 1,
            stepName: 'Step 1 — Single approver (ROLE)',
            approverType: 'ROLE',
            approverRole: 'APPROVER',
            mode: 'SEQUENTIAL',
            requiredApprovals: 1,
          },
          {
            stepOrder: 2,
            stepName: 'Step 2 — ANY_OF approver',
            approverType: 'ANY_OF_ROLE',
            approverRole: 'APPROVER',
            mode: 'PARALLEL',
            requiredApprovals: 1,
          },
          {
            stepOrder: 3,
            stepName: 'Step 3 — Final',
            approverType: 'ROLE',
            approverRole: 'APPROVER',
            mode: 'SEQUENTIAL',
            requiredApprovals: 1,
          },
        ],
      });
      if (res.ok) {
        toast.success(`Workflow 3 steps créé (${res.id.slice(0, 8)}…)`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleAttach(workflowId: string) {
    if (!planIdToAttach) {
      toast.error('Renseigner un planId au-dessus');
      return;
    }
    startTransition(async () => {
      const res = await attachWorkflowToPlan({ workflowId, planId: planIdToAttach });
      if (res.ok) {
        toast.success('Workflow attaché');
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handleDetach(workflowId: string) {
    startTransition(async () => {
      const res = await detachWorkflow({ workflowId });
      if (res.ok) {
        toast.success('Workflow détaché');
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handleDeleteWorkflow(workflowId: string) {
    startTransition(async () => {
      const res = await deleteWorkflow({ workflowId });
      if (res.ok) {
        toast.success('Workflow soft-deleted');
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handlePropose(awardId: string) {
    startTransition(async () => {
      const res = await transitionAward({ awardId, toStatus: 'PROPOSED' });
      if (res.ok) {
        toast.success('Award → PROPOSED (workflow auto si configuré)');
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handleApprove(decisionId: string) {
    startTransition(async () => {
      const res = await approveDecision({ decisionId, comment: 'Approved via sandbox' });
      if (res.ok) {
        toast.success(`Decision APPROVED (request status: ${res.result.status})`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handleReject(decisionId: string) {
    startTransition(async () => {
      const res = await rejectDecision({
        decisionId,
        comment: 'Rejected via sandbox — testing flow',
      });
      if (res.ok) {
        toast.success(`Decision REJECTED (request status: ${res.result.status})`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handleCancelRequest(requestId: string) {
    startTransition(async () => {
      const res = await cancelApprovalRequest({
        requestId,
        reason: 'Cancelled via sandbox',
      });
      if (res.ok) {
        toast.success('Request CANCELLED');
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Dev Sandbox — Approval Engine (Module 5 B2)</h1>
        <p className="text-muted-foreground text-sm">
          Test E2E du moteur d&apos;approbation : créer workflow → attacher → propose award →
          approve/reject → audit.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Workflows</CardTitle>
          <CardDescription>
            Créer un workflow test, l&apos;attacher à un plan, ou le supprimer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCreateSimpleWorkflow} disabled={pending}>
              <Plus className="mr-2 size-4" /> Créer workflow simple (1 step ROLE=APPROVER)
            </Button>
            <Button variant="outline" onClick={handleCreate3StepsWorkflow} disabled={pending}>
              <Plus className="mr-2 size-4" /> Créer workflow 3 steps mixed
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="planid" className="text-xs">
              planId pour attach :
            </Label>
            <Input
              id="planid"
              value={planIdToAttach}
              onChange={(e) => setPlanIdToAttach(e.target.value)}
              placeholder="uuid du plan"
              className="max-w-md"
            />
          </div>
          <div className="space-y-2">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">{wf.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {wf.applies_to} · steps={wf.steps_count} · IN_PROGRESS=
                    {wf.active_requests_count} ·{' '}
                    {wf.is_default ? <Badge variant="outline">default</Badge> : null}{' '}
                    {wf.attach_to_plan_id ? (
                      <Badge variant="outline">
                        attached to {wf.attach_to_plan_id.slice(0, 8)}
                      </Badge>
                    ) : null}{' '}
                    {wf.is_active ? null : <Badge variant="secondary">inactive</Badge>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAttach(wf.id)}
                    disabled={pending}
                  >
                    Attach
                  </Button>
                  {wf.attach_to_plan_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDetach(wf.id)}
                      disabled={pending}
                    >
                      Detach
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteWorkflow(wf.id)}
                    disabled={pending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {workflows.length === 0 ? (
              <div className="text-muted-foreground text-sm italic">Aucun workflow.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Awards récents — propose pour démarrer un workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {awards.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div>
                  <span className="font-mono">{a.award_number}</span>{' '}
                  <Badge variant="outline">{a.status}</Badge>
                </div>
                {a.status === 'DRAFT' ? (
                  <Button size="sm" onClick={() => handlePropose(a.id)} disabled={pending}>
                    transitionAward → PROPOSED
                  </Button>
                ) : null}
              </div>
            ))}
            {awards.length === 0 ? (
              <div className="text-muted-foreground text-sm italic">Aucun award récent.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Mes approbations PENDING ({pendingApprovals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {pendingApprovals.map((p) => (
              <div
                key={p.decision_id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="flex-1">
                  <div className="font-mono text-xs">{p.award_number ?? '—'}</div>
                  <div className="text-muted-foreground text-xs">
                    Step {p.step_order} · {p.step_name ?? '—'} · {p.beneficiary_name ?? '—'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleApprove(p.decision_id)} disabled={pending}>
                    <Check className="mr-1 size-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(p.decision_id)}
                    disabled={pending}
                  >
                    <X className="mr-1 size-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
            {pendingApprovals.length === 0 ? (
              <div className="text-muted-foreground text-sm italic">
                Aucune approbation PENDING.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Requests récents (20 max)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"
              >
                <div className="flex-1">
                  <div>
                    <span className={`rounded border px-2 py-0.5 ${STATUS_TONE[r.status] ?? ''}`}>
                      {r.status}
                    </span>{' '}
                    award={r.award_id?.slice(0, 8) ?? '—'} · step={r.current_step_order}
                    {r.rejected_reason ? ` · reason: "${r.rejected_reason}"` : ''}
                  </div>
                </div>
                {r.status === 'IN_PROGRESS' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCancelRequest(r.id)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            ))}
            {requests.length === 0 ? (
              <div className="text-muted-foreground text-sm italic">Aucun request.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Audit events approval.* (20 derniers)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Event</th>
                  <th className="text-left">User</th>
                  <th className="text-left">Resource</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-1 font-mono">{a.occurred_at.slice(11, 19)}</td>
                    <td className="py-1 font-medium">{a.event_type}</td>
                    <td className="text-muted-foreground py-1">{a.user_email ?? '—'}</td>
                    <td className="text-muted-foreground py-1 font-mono">
                      {a.resource_id?.slice(0, 8) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditEvents.length === 0 ? (
              <div className="text-muted-foreground p-2 text-sm italic">Aucun audit event.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
