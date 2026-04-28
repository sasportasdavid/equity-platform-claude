import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Badge de statut de plan : DRAFT / ACTIVE / CLOSED / CANCELLED.
 *
 * Couleurs :
 *  - DRAFT     : neutre (en cours)
 *  - ACTIVE    : vert (en production)
 *  - CLOSED    : bleu (clos proprement)
 *  - CANCELLED : rouge (annulé)
 */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  CLOSED: 'Clos',
  CANCELLED: 'Annulé',
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground border-border',
  ACTIVE:
    'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-100 dark:border-emerald-900',
  CLOSED:
    'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/50 dark:text-sky-100 dark:border-sky-900',
  CANCELLED: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status] ?? STATUS_CLASSES.DRAFT, 'font-medium', className)}
      data-testid={`status-badge-${status.toLowerCase()}`}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
