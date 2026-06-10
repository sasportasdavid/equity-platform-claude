'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Clock, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DecisionDialog } from './DecisionDialog';
import type { ApprovalRequestForAward } from '@/server/queries/approvals';

const STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: 'border-amber-400 text-amber-700 dark:text-amber-400',
  APPROVED: 'border-emerald-400 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'border-destructive text-destructive',
  CANCELLED: 'border-muted-foreground/40 text-muted-foreground',
};

/**
 * Module 5 B4 — Carte "Workflow d'approbation" sur la page détail award.
 *
 * Affichée uniquement si l'award a une approval_request liée. Si le caller
 * est un approbateur du step courant, expose les boutons rapides
 * Approve/Reject inline.
 */
export function AwardApprovalCard({
  request,
  award,
}: {
  request: ApprovalRequestForAward;
  award: {
    number: string | null;
    beneficiaryName: string | null;
    planName: string | null;
    unitsGranted: number | null;
  };
}) {
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean;
    mode: 'approve' | 'reject';
  }>({ open: false, mode: 'approve' });

  const dialogContext = {
    awardNumber: award.number,
    beneficiaryName: award.beneficiaryName,
    planName: award.planName,
    unitsGranted: award.unitsGranted,
    stepOrder: request.current_step_order ?? 0,
    stepName: null,
    workflowTotalSteps: request.workflow_total_steps,
  };

  return (
    <section className="bg-card mb-4 rounded-lg border p-4" data-testid="award-approval-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Workflow d&apos;approbation
            </h2>
            <Badge variant="outline" className={STATUS_TONE[request.status] ?? ''}>
              {request.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            {request.workflow_name ? `${request.workflow_name} · ` : ''}
            Étape {request.current_step_order ?? '—'}
            {request.workflow_total_steps ? `/${request.workflow_total_steps}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {request.my_pending_decision_id ? (
            <>
              <Button
                size="sm"
                onClick={() => setDecisionDialog({ open: true, mode: 'approve' })}
                data-testid="award-card-approve"
              >
                <Check className="mr-1 size-4" /> Approuver
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDecisionDialog({ open: true, mode: 'reject' })}
                data-testid="award-card-reject"
              >
                <X className="mr-1 size-4" /> Rejeter
              </Button>
            </>
          ) : null}
          <Link
            href={`/dashboard/approvals/${request.id}`}
            className="text-primary inline-flex items-center text-xs hover:underline"
          >
            Voir le détail <ChevronRight className="size-3" />
          </Link>
        </div>
      </div>

      {request.my_pending_decision_id ? (
        <DecisionDialog
          open={decisionDialog.open}
          onOpenChange={(open) => setDecisionDialog((prev) => ({ ...prev, open }))}
          mode={decisionDialog.mode}
          decisionId={request.my_pending_decision_id}
          context={dialogContext}
        />
      ) : null}
    </section>
  );
}
