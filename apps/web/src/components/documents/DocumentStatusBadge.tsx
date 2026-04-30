import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Module 6 B4 — Badge de statut des document_instances.
 *
 * 7 statuts standards (alignés sur la spec §3 + CHECK constraint Module 1) :
 *  - DRAFT               → slate (gris neutre)
 *  - GENERATED           → indigo (PDF prêt, pas envoyé)
 *  - SENT_FOR_SIGNATURE  → amber (en cours de signature)
 *  - PARTIALLY_SIGNED    → amber-darker (au moins 1 signer signé, pas tous)
 *  - SIGNED              → emerald (terminé OK)
 *  - VOIDED              → destructive (rouge)
 *  - ARCHIVED            → slate (terminé sans signature)
 */

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  GENERATED: 'Généré',
  SENT_FOR_SIGNATURE: 'Envoyé',
  PARTIALLY_SIGNED: 'Partiellement signé',
  SIGNED: 'Signé',
  VOIDED: 'Voidé',
  ARCHIVED: 'Archivé',
};

const SLATE =
  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800';
const INDIGO =
  'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:border-indigo-900';
const AMBER =
  'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900';
const AMBER_DARK =
  'bg-amber-200 text-amber-950 border-amber-300 dark:bg-amber-900/50 dark:text-amber-50 dark:border-amber-800';
const EMERALD =
  'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900';
const DESTRUCTIVE = 'bg-destructive/10 text-destructive border-destructive/30';

export const DOCUMENT_STATUS_CLASSES: Record<string, string> = {
  DRAFT: SLATE,
  GENERATED: INDIGO,
  SENT_FOR_SIGNATURE: AMBER,
  PARTIALLY_SIGNED: AMBER_DARK,
  SIGNED: EMERALD,
  VOIDED: DESTRUCTIVE,
  ARCHIVED: SLATE,
};

export function DocumentStatusBadge({ status, className }: { status: string; className?: string }) {
  const cls = DOCUMENT_STATUS_CLASSES[status] ?? SLATE;
  const label = DOCUMENT_STATUS_LABELS[status] ?? status;
  return (
    <Badge
      variant="outline"
      className={cn(cls, 'whitespace-nowrap font-medium', className)}
      data-testid={`document-status-${status.toLowerCase()}`}
    >
      {label}
    </Badge>
  );
}
