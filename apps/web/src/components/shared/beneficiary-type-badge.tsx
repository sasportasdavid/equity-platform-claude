import { cn } from '@/lib/utils';

/**
 * Badge pour les 5 types bénéficiaire (UPPERCASE DB) — Module 4 B3.
 *
 *   EMPLOYEE   → indigo (couleur principale Capiwise)
 *   OFFICER    → violet (anciennement DIRIGEANT)
 *   CONSULTANT → sky
 *   ADVISOR    → cyan
 *   OTHER      → slate
 */

const TYPE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Salarié',
  OFFICER: 'Dirigeant',
  CONSULTANT: 'Consultant',
  ADVISOR: 'Advisor',
  OTHER: 'Autre',
};

const TYPE_TONE: Record<string, string> = {
  EMPLOYEE: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  OFFICER: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400',
  CONSULTANT: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  ADVISOR: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  OTHER: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

export function BeneficiaryTypeBadge({ type, className }: { type: string; className?: string }) {
  const label = TYPE_LABELS[type] ?? type;
  const tone = TYPE_TONE[type] ?? 'border-border bg-muted/30 text-muted-foreground';
  return (
    <span
      data-testid={`beneficiary-type-badge-${type}`}
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
