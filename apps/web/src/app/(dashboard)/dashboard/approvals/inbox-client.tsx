'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Clock, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/shared/PageShell';
import { DecisionDialog } from '@/components/approvals/DecisionDialog';
import type { DecisionHistoryItem, PendingInboxItem } from '@/server/queries/approvals';

type Tab = 'pending' | 'history';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "à l'instant";
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

function dialogContext(item: PendingInboxItem) {
  return {
    awardNumber: item.award_number,
    beneficiaryName: item.beneficiary_name,
    planName: item.plan_name,
    unitsGranted: item.award_units_granted,
    stepOrder: item.step_order,
    stepName: item.step_name,
    workflowTotalSteps: item.workflow_total_steps,
  };
}

export function ApprovalsInboxClient({
  pending,
  history,
}: {
  pending: PendingInboxItem[];
  history: DecisionHistoryItem[];
}) {
  const [tab, setTab] = useState<Tab>('pending');
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    mode: 'approve' | 'reject';
    item: PendingInboxItem | null;
  }>({ open: false, mode: 'approve', item: null });

  function openDialog(mode: 'approve' | 'reject', item: PendingInboxItem) {
    setDialogState({ open: true, mode, item });
  }

  return (
    <PageShell
      title="Mes approbations"
      description={
        pending.length > 0
          ? `${pending.length} en attente · ${history.length} décision${history.length > 1 ? 's' : ''} passée${history.length > 1 ? 's' : ''}`
          : `Aucune en attente · ${history.length} décision${history.length > 1 ? 's' : ''} passée${history.length > 1 ? 's' : ''}`
      }
    >
      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`relative -mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'pending'
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            }`}
            data-testid="tab-pending"
          >
            En attente
            {pending.length > 0 ? (
              <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-xs">
                {pending.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`relative -mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'history'
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            }`}
            data-testid="tab-history"
          >
            Mes décisions
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <h2 className="text-lg font-semibold">Aucune approbation en attente 🎉</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Toutes vos décisions sont à jour. Les nouvelles demandes apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pending.map((item) => (
              <article
                key={item.decision_id}
                className="bg-card hover:border-primary/40 rounded-lg border p-4 transition-colors"
                data-testid={`pending-card-${item.decision_id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-amber-600" />
                      <span className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        Étape {item.step_order}
                        {item.workflow_total_steps ? `/${item.workflow_total_steps}` : ''}
                        {item.step_name ? ` · ${item.step_name}` : ''}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold">
                      {item.award_number ?? '—'}{' '}
                      <span className="text-muted-foreground font-normal">·</span>{' '}
                      <span className="font-normal">{item.beneficiary_name ?? '—'}</span>
                    </h3>
                    <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                      {item.plan_name ? (
                        <span>
                          {item.plan_name}
                          {item.plan_type ? (
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              {item.plan_type}
                            </Badge>
                          ) : null}
                        </span>
                      ) : null}
                      {item.award_units_granted != null ? (
                        <span>{item.award_units_granted.toLocaleString('fr-FR')} units</span>
                      ) : null}
                      {item.workflow_name ? <span>workflow {item.workflow_name}</span> : null}
                      <span>Notifiée {formatRelative(item.notified_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => openDialog('approve', item)}
                      data-testid={`approve-${item.decision_id}`}
                    >
                      <Check className="mr-1 size-4" /> Approuver
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => openDialog('reject', item)}
                      data-testid={`reject-${item.decision_id}`}
                    >
                      <X className="mr-1 size-4" /> Rejeter
                    </Button>
                    <Link
                      href={`/dashboard/approvals/${item.request_id}`}
                      className="text-primary inline-flex items-center text-xs hover:underline"
                    >
                      Détails <ChevronRight className="size-3" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-semibold">Aucune décision passée</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Vos décisions historiques s&apos;afficheront ici.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {history.map((item) => (
            <article
              key={item.decision_id}
              className="bg-card rounded-lg border p-4"
              data-testid={`history-card-${item.decision_id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {item.decision_status === 'APPROVED' ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-400 text-emerald-700 dark:text-emerald-400"
                      >
                        ✓ Approved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-destructive text-destructive">
                        ✗ Rejected
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      Étape {item.step_order}
                      {item.workflow_total_steps ? `/${item.workflow_total_steps}` : ''}
                      {item.step_name ? ` · ${item.step_name}` : ''}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold">
                    {item.award_number ?? '—'}{' '}
                    <span className="text-muted-foreground font-normal">·</span>{' '}
                    <span className="font-normal">{item.beneficiary_name ?? '—'}</span>
                  </h3>
                  <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                    {item.plan_name ? <span>{item.plan_name}</span> : null}
                    <span>Décidée {formatRelative(item.decided_at)}</span>
                  </div>
                  {item.comment ? (
                    <div className="text-muted-foreground mt-2 italic">
                      &quot;{item.comment}&quot;
                    </div>
                  ) : null}
                </div>
                <Link
                  href={`/dashboard/approvals/${item.request_id}`}
                  className="text-primary inline-flex items-center text-xs hover:underline"
                >
                  Détails <ChevronRight className="size-3" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Decision Dialog */}
      {dialogState.item ? (
        <DecisionDialog
          open={dialogState.open}
          onOpenChange={(open) => setDialogState((prev) => ({ ...prev, open }))}
          mode={dialogState.mode}
          decisionId={dialogState.item.decision_id}
          context={dialogContext(dialogState.item)}
        />
      ) : null}
    </PageShell>
  );
}
