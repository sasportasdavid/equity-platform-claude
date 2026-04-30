'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/shared/PageShell';
import { ApprovalRequestTimeline } from '@/components/approvals/ApprovalRequestTimeline';
import { DecisionDialog } from '@/components/approvals/DecisionDialog';
import { cancelApprovalRequest } from '@/server/actions/approvals';
import type { ApprovalRequestDetailFull } from '@/server/queries/approvals';

const STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: 'border-amber-400 text-amber-700',
  APPROVED: 'border-emerald-400 text-emerald-700',
  REJECTED: 'border-destructive text-destructive',
  CANCELLED: 'border-muted-foreground/40 text-muted-foreground',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ApprovalRequestDetailClient({
  detail,
  currentUserId,
  canConfigure,
}: {
  detail: ApprovalRequestDetailFull;
  currentUserId: string;
  canConfigure: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean;
    mode: 'approve' | 'reject';
  }>({ open: false, mode: 'approve' });

  const myPendingDecision = detail.decisions.find(
    (d) =>
      d.approver_user_id === currentUserId &&
      d.status === 'PENDING' &&
      d.step_order === detail.request.current_step_order,
  );

  const isInProgress = detail.request.status === 'IN_PROGRESS';

  function handleCancel() {
    if (cancelReason.trim().length === 0) {
      toast.error('Renseigner un motif');
      return;
    }
    startTransition(async () => {
      const res = await cancelApprovalRequest({
        requestId: detail.request.id,
        reason: cancelReason.trim(),
      });
      if (res.ok) {
        toast.success('Workflow annulé');
        setCancelOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const dialogContext = detail.award
    ? {
        awardNumber: detail.award.award_number,
        beneficiaryName: detail.beneficiary?.name ?? null,
        planName: detail.plan?.name ?? null,
        unitsGranted: detail.award.units_granted,
        stepOrder: detail.request.current_step_order ?? 0,
        stepName:
          detail.steps.find((s) => s.step_order === detail.request.current_step_order)?.step_name ??
          null,
        workflowTotalSteps: detail.steps.length,
      }
    : null;

  return (
    <PageShell
      title={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/approvals" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <span>Demande d&apos;approbation</span>
          <Badge
            variant="outline"
            className={STATUS_TONE[detail.request.status] ?? ''}
            data-testid="request-status-badge"
          >
            {detail.request.status}
          </Badge>
        </div>
      }
      description={
        detail.workflow
          ? `${detail.workflow.name} · démarrée le ${formatDate(detail.request.started_at)}`
          : `Démarrée le ${formatDate(detail.request.started_at)}`
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {myPendingDecision && dialogContext ? (
            <>
              <Button
                size="sm"
                onClick={() => setDecisionDialog({ open: true, mode: 'approve' })}
                data-testid="approve-action"
              >
                <Check className="mr-1 size-4" /> Approuver
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDecisionDialog({ open: true, mode: 'reject' })}
                data-testid="reject-action"
              >
                <X className="mr-1 size-4" /> Rejeter
              </Button>
            </>
          ) : null}
          {canConfigure && isInProgress ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCancelOpen(true)}
              data-testid="cancel-request-action"
            >
              Annuler le workflow
            </Button>
          ) : null}
        </div>
      }
    >
      {/* Section 1 — Award concerné */}
      {detail.award ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">Award concerné</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Award">
              <Link
                href={`/dashboard/awards/${detail.award.id}`}
                className="text-primary font-mono hover:underline"
              >
                {detail.award.award_number ?? '—'}
              </Link>
            </Field>
            <Field label="Status award">
              <Badge variant="outline">{detail.award.status}</Badge>
            </Field>
            <Field label="Bénéficiaire">
              {detail.beneficiary ? (
                <Link
                  href={`/dashboard/beneficiaries/${detail.beneficiary.id}`}
                  className="text-primary hover:underline"
                >
                  {detail.beneficiary.name}
                </Link>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Plan">
              {detail.plan ? (
                <Link
                  href={`/dashboard/plans/${detail.plan.id}`}
                  className="text-primary hover:underline"
                >
                  {detail.plan.name}{' '}
                  <span className="text-muted-foreground text-xs">({detail.plan.plan_type})</span>
                </Link>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Units granted">
              <span className="font-mono">
                {detail.award.units_granted != null
                  ? detail.award.units_granted.toLocaleString('fr-FR')
                  : '—'}
              </span>
            </Field>
            <Field label="Grant date prévue">
              {detail.award.grant_date
                ? new Date(detail.award.grant_date).toLocaleDateString('fr-FR')
                : '—'}
            </Field>
          </div>
        </section>
      ) : null}

      {/* Section 2 — Timeline visuelle */}
      <section className="bg-card rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">Étapes</h2>
        <ApprovalRequestTimeline
          steps={detail.steps}
          decisions={detail.decisions}
          currentStepOrder={detail.request.current_step_order}
          requestStatus={detail.request.status}
        />
      </section>

      {/* Section 3 — Décisions détaillées */}
      <section className="bg-card rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">Décisions</h2>
        {detail.decisions.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">Aucune décision enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Step</th>
                  <th className="text-left">Approbateur</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Décidée le</th>
                  <th className="text-left">Comment</th>
                </tr>
              </thead>
              <tbody>
                {detail.decisions.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="py-2 font-mono">{d.step_order}</td>
                    <td className="py-2 font-mono">
                      {d.approver_user_id?.slice(0, 8) ?? d.approver_role ?? '—'}
                    </td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {d.status}
                      </Badge>
                    </td>
                    <td className="py-2">{formatDate(d.decided_at)}</td>
                    <td className="text-muted-foreground max-w-md py-2 italic">
                      {d.comment ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 4 — Audit history */}
      <section className="bg-card rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">Historique audit</h2>
        {detail.audit_events.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">Aucun événement audit.</p>
        ) : (
          <ol className="space-y-1.5">
            {detail.audit_events.map((e) => (
              <li key={e.id} className="text-xs">
                <span className="text-muted-foreground font-mono">{formatDate(e.occurred_at)}</span>{' '}
                — <span className="font-medium">{e.event_type}</span>{' '}
                {e.user_email ? (
                  <span className="text-muted-foreground">par {e.user_email}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* DecisionDialog */}
      {myPendingDecision && dialogContext ? (
        <DecisionDialog
          open={decisionDialog.open}
          onOpenChange={(open) => setDecisionDialog((prev) => ({ ...prev, open }))}
          mode={decisionDialog.mode}
          decisionId={myPendingDecision.id}
          context={dialogContext}
        />
      ) : null}

      {/* Cancel workflow dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler ce workflow ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le request passera en CANCELLED et toutes les decisions PENDING seront SKIPPED. Si
              l&apos;award est en PENDING_APPROVAL, il retombera en DRAFT.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason" className="text-xs">
              Motif *
            </Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="ex: workflow obsolète, à remplacer"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={pending || cancelReason.trim().length === 0}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmer l&apos;annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
