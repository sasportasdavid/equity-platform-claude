import { cn } from '@/lib/utils';

/**
 * Badge pour les 3 statuts lifecycle bénéficiaire — Module 4 B3.
 *
 *   active     → emerald (vert)
 *   on_leave   → amber  (jaune)
 *   terminated → slate  (gris-rouge soft, status terminal)
 */

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  on_leave: 'En congé',
  terminated: 'Sorti',
};

const STATUS_TONE: Record<string, string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  on_leave: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  terminated: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

export function BeneficiaryStatusBadge({
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
      data-testid={`beneficiary-status-badge-${status}`}
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
