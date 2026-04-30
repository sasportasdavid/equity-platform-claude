'use client';

import { Check, Circle, Clock, MinusCircle, X } from 'lucide-react';
import { computeStepStatus, type StepStatus } from './timeline-helpers';
import type { ApprovalRequestDetailFull } from '@/server/queries/approvals';

/**
 * Module 5 B4 — Timeline visuelle des étapes d'un workflow.
 *
 * Vertical, 1 row par step. Color coding :
 *   - vert (APPROVED) : tous les decisions approved
 *   - rouge (REJECTED) : au moins 1 rejected
 *   - bleu (IN_PROGRESS) : step courant, decisions PENDING
 *   - gris (PENDING / SKIPPED) : à venir ou skipped
 *
 * `computeStepStatus` est extrait dans `timeline-helpers.ts` pour tests
 * unitaires sans React.
 */

type Step = ApprovalRequestDetailFull['steps'][number];
type Decision = ApprovalRequestDetailFull['decisions'][number];

const STATUS_STYLES: Record<
  StepStatus,
  { dot: string; line: string; text: string; icon: typeof Check }
> = {
  approved: {
    dot: 'bg-emerald-500 text-white border-emerald-500',
    line: 'bg-emerald-500',
    text: 'text-emerald-700',
    icon: Check,
  },
  rejected: {
    dot: 'bg-destructive text-white border-destructive',
    line: 'bg-destructive',
    text: 'text-destructive',
    icon: X,
  },
  in_progress: {
    dot: 'bg-amber-500 text-white border-amber-500 animate-pulse',
    line: 'bg-muted',
    text: 'text-amber-700',
    icon: Clock,
  },
  upcoming: {
    dot: 'bg-background text-muted-foreground border-border',
    line: 'bg-muted',
    text: 'text-muted-foreground',
    icon: Circle,
  },
  skipped: {
    dot: 'bg-muted text-muted-foreground border-border',
    line: 'bg-muted',
    text: 'text-muted-foreground',
    icon: MinusCircle,
  },
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

export function ApprovalRequestTimeline({
  steps,
  decisions,
  currentStepOrder,
  requestStatus,
}: {
  steps: Step[];
  decisions: Decision[];
  currentStepOrder: number | null;
  requestStatus: string;
}) {
  const completedSteps = steps.filter((s) => {
    const status = computeStepStatus(s, decisions, currentStepOrder, requestStatus);
    return status === 'approved' || status === 'rejected';
  }).length;

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs">
        Progression : {completedSteps} / {steps.length} étapes complétées
      </div>
      <ol className="relative space-y-4">
        {steps.map((step, i) => {
          const status = computeStepStatus(step, decisions, currentStepOrder, requestStatus);
          const styles = STATUS_STYLES[status];
          const Icon = styles.icon;
          const stepDecisions = decisions
            .filter((d) => d.step_order === step.step_order)
            .sort((a, b) => {
              if (a.status === b.status) return 0;
              if (a.status === 'APPROVED') return -1;
              if (b.status === 'APPROVED') return 1;
              if (a.status === 'REJECTED') return -1;
              if (b.status === 'REJECTED') return 1;
              return 0;
            });
          const isLast = i === steps.length - 1;

          return (
            <li key={step.id} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${styles.dot}`}
                >
                  <Icon className="size-4" />
                </div>
                {!isLast ? (
                  <div className={`mt-1 h-full w-0.5 grow ${styles.line}`} aria-hidden />
                ) : null}
              </div>

              <div className="flex-1 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className={`text-sm font-semibold ${styles.text}`}>
                      Étape {step.step_order} · {step.step_name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Type {step.approver_type}
                      {step.approver_role ? ` · ${step.approver_role}` : ''}
                      {step.required_approvals > 1
                        ? ` · ${step.required_approvals} approbations requises`
                        : ''}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles.dot} ${styles.text}`}
                  >
                    {status === 'approved'
                      ? 'Approuvée'
                      : status === 'rejected'
                        ? 'Rejetée'
                        : status === 'in_progress'
                          ? 'En cours'
                          : status === 'upcoming'
                            ? 'À venir'
                            : 'Skipped'}
                  </span>
                </div>

                {stepDecisions.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {stepDecisions.map((d) => (
                      <li key={d.id} className="bg-muted/30 rounded-md border p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-medium">
                            {d.status === 'APPROVED'
                              ? '✓ Approuvée'
                              : d.status === 'REJECTED'
                                ? '✗ Rejetée'
                                : d.status === 'PENDING'
                                  ? '⏳ En attente'
                                  : '⊘ Skipped'}
                            {d.decided_by ? ` par ${d.decided_by.slice(0, 8)}…` : ''}
                          </span>
                          <span className="text-muted-foreground">{formatDate(d.decided_at)}</span>
                        </div>
                        {d.comment ? (
                          <div className="text-muted-foreground mt-1 italic">
                            &quot;{d.comment}&quot;
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
