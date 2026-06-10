import { cn } from '@/lib/utils';

/**
 * Module 9 B3 — Badge éditorial pour les statuts d'exercise_request.
 *
 *   PENDING    → amber  (en attente d'approbation)
 *   APPROVED   → indigo (approuvé, en attente signature/paiement)
 *   SIGNED     → indigo (bulletin signé, paiement attendu)
 *   COMPLETED  → emerald (paiement reçu, exercice clos)
 *   REJECTED   → rose
 *   CANCELLED  → slate
 */

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  SIGNED: 'Signée',
  COMPLETED: 'Complétée',
  REJECTED: 'Rejetée',
  CANCELLED: 'Annulée',
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  APPROVED: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  SIGNED: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  COMPLETED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  CANCELLED: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

export function ExerciseRequestStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const label = STATUS_LABELS[status] ?? status;
  const tone = STATUS_TONE[status] ?? 'border-border bg-muted/30 text-muted-foreground';
  return (
    <span
      data-testid={`exercise-status-badge-${status}`}
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
