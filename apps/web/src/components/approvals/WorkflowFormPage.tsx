'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComplianceIssuesDialog } from '@/components/shared/ComplianceIssuesDialog';
import { PageShell } from '@/components/shared/PageShell';
import { WorkflowStepEditor, type StepData } from './WorkflowStepEditor';
import { createWorkflow, updateWorkflow } from '@/server/actions/approvals';
import type { ComplianceIssue } from '@/lib/compliance/types';
import type {
  PlanForAttachment,
  UserForApprover,
  WorkflowAdminDetail,
} from '@/server/queries/approvals';

const APPLIES_TO_OPTIONS = [
  { value: 'AWARD_GRANT', label: 'Attribution award' },
  { value: 'AWARD_MODIFICATION', label: 'Modification award' },
  { value: 'EXERCISE_REQUEST', label: 'Exercice (M9)' },
  { value: 'PLAN_CREATION', label: 'Création plan' },
];

const PLAN_TYPES = [
  'BSPCE',
  'AGA',
  'BSA',
  'STOCK_OPTIONS',
  'PHANTOM',
  'SAR',
  'RSU',
  'ESPP',
  'FREE_SHARES',
];

const ROLES = ['OWNER', 'ADMIN_HR', 'APPROVER', 'AUDITOR'];

type AttachMode = 'default_org' | 'plan' | 'none';

export function WorkflowFormPage({
  mode,
  workflow,
  availableUsers,
  availablePlans,
}: {
  mode: 'create' | 'edit';
  workflow?: WorkflowAdminDetail;
  availableUsers: UserForApprover[];
  availablePlans: PlanForAttachment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [complianceBlock, setComplianceBlock] = useState<ComplianceIssue[] | null>(null);

  // Form state
  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [appliesTo, setAppliesTo] = useState(workflow?.applies_to ?? 'AWARD_GRANT');
  const [planTypeFilter, setPlanTypeFilter] = useState<string[]>(workflow?.plan_type_filter ?? []);
  const [isActive, setIsActive] = useState(workflow?.is_active ?? true);
  const [attachMode, setAttachMode] = useState<AttachMode>(
    workflow?.is_default ? 'default_org' : workflow?.attach_to_plan_id ? 'plan' : 'none',
  );
  const [attachPlanId, setAttachPlanId] = useState(workflow?.attach_to_plan_id ?? '');
  const [steps, setSteps] = useState<StepData[]>(
    workflow?.steps.map(
      (s) =>
        ({
          stepOrder: s.step_order,
          stepName: s.step_name,
          approverType: s.approver_type as StepData['approverType'],
          approverRole: s.approver_role ?? undefined,
          approverUserId: s.approver_user_id ?? undefined,
          mode: s.mode as StepData['mode'],
          requiredApprovals: s.required_approvals,
        }) as StepData,
    ) ?? [
      {
        stepOrder: 1,
        stepName: 'Validation',
        approverType: 'ROLE',
        approverRole: 'APPROVER',
        mode: 'SEQUENTIAL',
        requiredApprovals: 1,
      },
    ],
  );

  const editLocked = mode === 'edit' && (workflow?.active_requests_count ?? 0) > 0;
  const canSubmit = !pending && !editLocked && name.trim().length > 0 && steps.length > 0;

  function addStep() {
    if (steps.length >= 10) return;
    setSteps((prev) => [
      ...prev,
      {
        stepOrder: prev.length + 1,
        stepName: `Étape ${prev.length + 1}`,
        approverType: 'ROLE',
        approverRole: 'APPROVER',
        mode: 'SEQUENTIAL',
        requiredApprovals: 1,
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepOrder: i + 1 })),
    );
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next.map((s, i) => ({ ...s, stepOrder: i + 1 }));
    });
  }

  function togglePlanTypeFilter(pt: string) {
    setPlanTypeFilter((prev) => (prev.includes(pt) ? prev.filter((x) => x !== pt) : [...prev, pt]));
  }

  function handleSubmit() {
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        appliesTo: appliesTo as
          | 'AWARD_GRANT'
          | 'AWARD_MODIFICATION'
          | 'EXERCISE_REQUEST'
          | 'PLAN_CREATION',
        planTypeFilter: planTypeFilter.length > 0 ? planTypeFilter : undefined,
        isActive,
        isDefault: attachMode === 'default_org',
        steps: steps.map((s) => ({
          stepOrder: s.stepOrder,
          stepName: s.stepName,
          approverType: s.approverType,
          approverRole: s.approverRole,
          approverUserId: s.approverUserId,
          mode: s.mode,
          requiredApprovals: s.requiredApprovals,
        })),
      };

      if (mode === 'create') {
        const res = await createWorkflow(payload);
        if (res.ok) {
          // Si attach plan demandé, faire la 2e action
          if (attachMode === 'plan' && attachPlanId) {
            const { attachWorkflowToPlan } = await import('@/server/actions/approvals');
            await attachWorkflowToPlan({ workflowId: res.id, planId: attachPlanId });
          }
          toast.success('Workflow créé');
          router.push('/dashboard/settings/approvals');
          router.refresh();
        } else if (res.complianceIssues && res.complianceIssues.length > 0) {
          setComplianceBlock(res.complianceIssues);
          toast.error(`Conformité : ${res.complianceIssues.length} erreur(s) bloquante(s)`);
        } else {
          toast.error(res.error);
        }
      } else if (workflow) {
        const res = await updateWorkflow({ workflowId: workflow.id, patch: payload });
        if (res.ok) {
          // Adapter attachement si modifié
          if (attachMode === 'plan' && attachPlanId !== (workflow.attach_to_plan_id ?? '')) {
            const { attachWorkflowToPlan } = await import('@/server/actions/approvals');
            await attachWorkflowToPlan({ workflowId: workflow.id, planId: attachPlanId });
          } else if (attachMode === 'none' && workflow.attach_to_plan_id) {
            const { detachWorkflow } = await import('@/server/actions/approvals');
            await detachWorkflow({ workflowId: workflow.id });
          }
          toast.success('Workflow mis à jour');
          router.push('/dashboard/settings/approvals');
          router.refresh();
        } else if (res.complianceIssues && res.complianceIssues.length > 0) {
          setComplianceBlock(res.complianceIssues);
          toast.error(`Conformité : ${res.complianceIssues.length} erreur(s) bloquante(s)`);
        } else {
          toast.error(res.error);
        }
      }
    });
  }

  return (
    <PageShell
      title={mode === 'create' ? 'Nouveau workflow' : `Modifier "${workflow?.name}"`}
      description="Définir les étapes et approbateurs requis pour valider une attribution"
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/settings/approvals')}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={editLocked ? `${workflow?.active_requests_count} requests en cours` : undefined}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === 'create' ? (
              'Créer le workflow'
            ) : (
              'Enregistrer'
            )}
          </Button>
        </div>
      }
    >
      {editLocked ? (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Ce workflow a {workflow?.active_requests_count} request(s) IN_PROGRESS. La modification
          est bloquée jusqu&apos;à résolution ou cancel manuel.
        </div>
      ) : null}

      {/* Section 1 — Général */}
      <section className="bg-card space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Général</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wf-name">Nom *</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: BSPCE Standard FR Tech"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wf-desc">Description</Label>
            <textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={2}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wf-applies">S&apos;applique à *</Label>
            <select
              id="wf-applies"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {APPLIES_TO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Plan type filter (optionnel)</Label>
            <div className="flex flex-wrap gap-1">
              {PLAN_TYPES.map((pt) => {
                const active = planTypeFilter.includes(pt);
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => togglePlanTypeFilter(pt)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {pt}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-4"
              />
              Workflow actif (les Server Actions ignorent les workflows inactifs)
            </label>
          </div>
        </div>
      </section>

      {/* Section 2 — Étapes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Étapes du circuit ({steps.length}/10)
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addStep}
            disabled={steps.length >= 10}
          >
            <Plus className="mr-2 size-4" /> Ajouter une étape
          </Button>
        </div>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <WorkflowStepEditor
              key={i}
              step={step}
              onChange={(next) => setSteps((prev) => prev.map((s, idx) => (idx === i ? next : s)))}
              onRemove={() => removeStep(i)}
              onMoveUp={() => moveStep(i, -1)}
              onMoveDown={() => moveStep(i, 1)}
              isFirst={i === 0}
              isLast={i === steps.length - 1}
              availableUsers={availableUsers}
              availableRoles={ROLES}
            />
          ))}
        </div>
      </section>

      {/* Section 3 — Attachement */}
      <section className="bg-card space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Attachement</h2>
        <div className="space-y-2">
          {(['default_org', 'plan', 'none'] as const).map((opt) => (
            <label key={opt} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                checked={attachMode === opt}
                onChange={() => setAttachMode(opt)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">
                  {opt === 'default_org'
                    ? `Default pour l'organisation sur ${appliesTo}`
                    : opt === 'plan'
                      ? 'Attaché à un plan spécifique'
                      : 'Aucun attachement (déclenchement manuel uniquement)'}
                </div>
                <div className="text-muted-foreground text-xs">
                  {opt === 'default_org'
                    ? "Activé pour tous les awards du applies_to qui n'ont pas de workflow attaché à leur plan."
                    : opt === 'plan'
                      ? 'Le workflow se déclenche pour les awards de ce plan uniquement.'
                      : 'Le workflow ne se déclenche pas automatiquement. Utiliser pour les workflows en construction.'}
                </div>
              </div>
            </label>
          ))}
          {attachMode === 'plan' ? (
            <div className="ml-6 space-y-1.5">
              <Label className="text-xs">Plan</Label>
              <select
                value={attachPlanId}
                onChange={(e) => setAttachPlanId(e.target.value)}
                className="border-input bg-background h-9 w-full max-w-md rounded-md border px-3 text-sm"
              >
                <option value="">— Sélectionner un plan —</option>
                {availablePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.plan_type})
                  </option>
                ))}
              </select>
              {availablePlans.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  Tous les plans ont déjà un workflow attaché.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <ComplianceIssuesDialog
        open={complianceBlock != null}
        onOpenChange={(o) => !o && setComplianceBlock(null)}
        issues={complianceBlock ?? []}
        title="Conformité bloquée"
      />
    </PageShell>
  );
}
