'use client';

import { Check, Circle, Clock, MinusCircle, X } from 'lucide-react';
import { computeStepStatus, type StepStatus } from './timeline-helpers';
import type { ApprovalRequestDetailFull } from '@/server/queries/approvals';
import { cn } from '@/lib/utils';

/**
 * Module 5 B4 + Design System V1 Étape 10 — Timeline d'approbation.
 *
 * **API publique inchangée** + ajout `orientation?: 'vertical' | 'horizontal'`
 * (défaut `vertical` pour backward compat, ne casse aucun usage existant).
 *
 * Le helper `computeStepStatus` extrait dans `timeline-helpers.ts`
 * **n'est PAS touché** — les tests Vitest associés continuent à passer.
 *
 * **Variantes** :
 *
 * 1. **vertical** (défaut, mockup 5 page détail request) : 1 row par
 *    step, dot 32px + ligne verticale, decisions listées en dessous.
 *    Color coding Editorial Finance :
 *    - approved : bond-500 (vert obligation)
 *    - rejected : title-500 (rouge éditorial)
 *    - in_progress : saffron-500 + halo-pulse 4s
 *    - upcoming : ink-300 (neutre)
 *    - skipped : ink-300 (gris)
 *
 * 2. **horizontal** (mockup 5 frise haut-droit) : avatars 48px reliés
 *    par lignes brass-500 1px, micro-labels durée mono ink-400
 *    sous chaque avatar. Halo pulse 4s sur l'étape courante (signature
 *    cuivre).
 */

type Step = ApprovalRequestDetailFull['steps'][number];
type Decision = ApprovalRequestDetailFull['decisions'][number];

const STATUS_STYLES: Record<
  StepStatus,
  { dot: string; line: string; text: string; icon: typeof Check }
> = {
  approved: {
    dot: 'bg-bond-500 text-white border-bond-500',
    line: 'bg-bond-500',
    text: 'text-bond-700',
    icon: Check,
  },
  rejected: {
    dot: 'bg-title-500 text-white border-title-500',
    line: 'bg-title-500',
    text: 'text-title-500',
    icon: X,
  },
  in_progress: {
    dot: 'bg-saffron-500 text-white border-saffron-500',
    line: 'bg-paper-300',
    text: 'text-saffron-700',
    icon: Clock,
  },
  upcoming: {
    dot: 'bg-paper-50 text-ink-400 border-paper-300',
    line: 'bg-paper-300',
    text: 'text-ink-500',
    icon: Circle,
  },
  skipped: {
    dot: 'bg-paper-200 text-ink-400 border-paper-300',
    line: 'bg-paper-300',
    text: 'text-ink-400',
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

// Note V1 : `formatDuration(from, to)` retiré car `step.created_at` et
// `step.sla_hours` ne sont pas exposés par ApprovalRequestDetailFull.
// À ré-introduire en V2 quand le RPC retournera ces métadonnées
// (mockup 5 affiche "signé en 2 h", "attente 18 h", "SLA J+3").

export function ApprovalRequestTimeline({
  steps,
  decisions,
  currentStepOrder,
  requestStatus,
  orientation = 'vertical',
}: {
  steps: Step[];
  decisions: Decision[];
  currentStepOrder: number | null;
  requestStatus: string;
  orientation?: 'vertical' | 'horizontal';
}) {
  if (orientation === 'horizontal') {
    return (
      <ApprovalRequestTimelineHorizontal
        steps={steps}
        decisions={decisions}
        currentStepOrder={currentStepOrder}
        requestStatus={requestStatus}
      />
    );
  }

  // === VARIANTE VERTICALE (par défaut, backward compat) ===
  const completedSteps = steps.filter((s) => {
    const status = computeStepStatus(s, decisions, currentStepOrder, requestStatus);
    return status === 'approved' || status === 'rejected';
  }).length;

  return (
    <div className="space-y-2">
      <div className="text-overline text-ink-700">
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
                  className={cn(
                    'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    styles.dot,
                    status === 'in_progress' && 'animate-halo-pulse',
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.5} />
                </div>
                {!isLast ? (
                  <div className={cn('mt-1 h-full w-0.5 grow', styles.line)} aria-hidden />
                ) : null}
              </div>

              <div className="flex-1 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className={cn('text-sm font-semibold', styles.text)}>
                      Étape {step.step_order} · {step.step_name}
                    </div>
                    <div className="text-ink-500 text-xs">
                      Type {step.approver_type}
                      {step.approver_role ? ` · ${step.approver_role}` : ''}
                      {step.required_approvals > 1
                        ? ` · ${step.required_approvals} approbations requises`
                        : ''}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-xs font-medium',
                      styles.dot,
                    )}
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
                      <li
                        key={d.id}
                        className="bg-paper-200/50 border-paper-300 rounded-md border p-2 text-xs"
                      >
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
                          <span className="text-ink-500">{formatDate(d.decided_at)}</span>
                        </div>
                        {d.comment ? (
                          <div className="serif-italic text-ink-500 mt-1">
                            &laquo;&nbsp;{d.comment}&nbsp;&raquo;
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

/**
 * === VARIANTE HORIZONTALE (mockup 5) ===
 *
 * Frise compacte avec avatars 48px reliés par flèches brass.
 * Le dot devient un cercle de 48px avec initiales serif + halo
 * pulse 4s quand in_progress.
 *
 * Sous chaque avatar : nom serif 13 ink-900 + rôle 11 ink-500 +
 * micro-label durée mono ink-400 (`signé en 2 h`, `attente · 18 h`,
 * `SLA · J+3`).
 */
function ApprovalRequestTimelineHorizontal({
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
  return (
    <ol
      className="flex items-start gap-2 overflow-x-auto pb-2"
      data-testid="approval-timeline-horizontal"
    >
      {steps.map((step, i) => {
        const status = computeStepStatus(step, decisions, currentStepOrder, requestStatus);
        const styles = STATUS_STYLES[status];
        const Icon = styles.icon;
        const stepDecisions = decisions
          .filter((d) => d.step_order === step.step_order)
          .sort((a, b) => Date.parse(b.decided_at ?? '0') - Date.parse(a.decided_at ?? '0'));
        const lastDecision = stepDecisions[0];
        const isLast = i === steps.length - 1;

        // Initiales : approver_role transformé (ex: "ADMIN_HR" → "AH")
        // ou "Étape N" si pas de rôle (fallback)
        const initials = step.approver_role
          ? step.approver_role
              .split(/[_\s]/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p: string) => p[0]?.toUpperCase() ?? '')
              .join('')
          : `${step.step_order}`;

        // Micro-label durée selon statut
        // Note : step.created_at et step.sla_hours ne sont pas exposés
        // par ApprovalRequestDetailFull V1. Pour les variantes time-aware
        // futures, étendre le RPC et re-câbler ici.
        const microLabel =
          status === 'approved' && lastDecision
            ? `signé · ${formatDate(lastDecision.decided_at)}`
            : status === 'rejected' && lastDecision
              ? `refusé · ${formatDate(lastDecision.decided_at)}`
              : status === 'in_progress'
                ? 'en attente'
                : status === 'upcoming'
                  ? 'à venir'
                  : 'skipped';

        return (
          <li key={step.id} className="flex min-w-[120px] flex-1 flex-col items-center gap-1.5">
            {/* Avatar 48px + (flèche → next si pas dernier) */}
            <div className="flex w-full items-center gap-2">
              <div
                className={cn(
                  'mx-auto flex size-12 shrink-0 items-center justify-center rounded-full border-2 font-serif text-base font-semibold transition-all',
                  styles.dot,
                  status === 'in_progress' && 'animate-halo-pulse',
                )}
                aria-label={`Étape ${step.step_order} : ${step.step_name}`}
              >
                {status === 'approved' ? (
                  <Icon className="size-5" strokeWidth={1.5} />
                ) : status === 'rejected' ? (
                  <Icon className="size-5" strokeWidth={1.5} />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
            </div>

            {/* Nom (serif 14 ink-900) */}
            <p className="text-ink-900 max-w-full truncate text-center text-sm font-medium">
              {step.step_name}
            </p>

            {/* Rôle (sans 12 ink-500 uppercase) */}
            <p className="text-ink-500 text-center text-[11px] font-medium uppercase tracking-wider">
              {step.approver_role ?? step.approver_type}
            </p>

            {/* Micro-label durée (mono 11 ink-400) */}
            <p
              className={cn(
                'text-center font-mono text-[10px] tabular-nums',
                status === 'approved' && 'text-bond-700',
                status === 'rejected' && 'text-title-500',
                status === 'in_progress' && 'text-saffron-700',
                (status === 'upcoming' || status === 'skipped') && 'text-ink-400',
              )}
            >
              {microLabel}
            </p>

            {/* Flèche brass entre étapes (sauf dernière) */}
            {!isLast ? (
              <div
                className="bg-brass-300 absolute mt-6 h-px"
                style={{
                  width: 'calc(100% - 96px)',
                  transform: 'translateX(96px)',
                  zIndex: -1,
                }}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
