import { PLAN_TYPE_UI_LABELS, type PlanWizardType } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Badge type de plan (BSPCE, AGA, STOCK_OPTION, BSA, PERFORMANCE_SHARE,
 * PHANTOM, ESOP, RSU, SAR).
 *
 * Code couleur regroupé par famille fiscale/économique :
 *  - FR-spécifiques (BSPCE, AGA, BSA)             : indigo (notre brand)
 *  - International equity (STOCK_OPTION, RSU, ESOP) : violet
 *  - Performance-conditioned (PERFORMANCE_SHARE)    : ambre
 *  - Cash-settled (PHANTOM, SAR)                    : émeraude
 */

const PLAN_TYPE_CLASSES: Record<string, string> = {
  BSPCE:
    'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-100 dark:border-indigo-900',
  AGA: 'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-100 dark:border-indigo-900',
  BSA: 'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-100 dark:border-indigo-900',
  STOCK_OPTION:
    'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-900',
  RSU: 'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-900',
  ESOP: 'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-900',
  PERFORMANCE_SHARE:
    'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-900',
  PHANTOM:
    'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-100 dark:border-emerald-900',
  SAR: 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-100 dark:border-emerald-900',
};

export function PlanTypeBadge({ planType, className }: { planType: string; className?: string }) {
  const label = (PLAN_TYPE_UI_LABELS as Record<string, string>)[planType] ?? planType;
  return (
    <Badge
      variant="outline"
      className={cn(
        PLAN_TYPE_CLASSES[planType] ?? PLAN_TYPE_CLASSES.STOCK_OPTION,
        'font-mono text-xs',
        className,
      )}
      data-testid={`plan-type-badge-${planType.toLowerCase()}`}
      title={label}
    >
      {planType}
    </Badge>
  );
}

// Re-export pour faciliter l'import depuis les pages
export type { PlanWizardType };
