import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_STATUS_CLASSES,
  DOCUMENT_STATUS_FALLBACK_CLASS,
  DOCUMENT_STATUS_LABELS,
} from './document-status-helpers';

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
export { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_CLASSES };

export function DocumentStatusBadge({ status, className }: { status: string; className?: string }) {
  const cls = DOCUMENT_STATUS_CLASSES[status] ?? DOCUMENT_STATUS_FALLBACK_CLASS;
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
