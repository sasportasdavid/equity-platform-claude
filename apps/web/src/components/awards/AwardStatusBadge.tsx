import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AwardStatus } from '@equity/shared';

/**
 * Badge de statut d'award (Module 3b B3) — 16 statuts.
 *
 * Groupes de couleurs (alignés sur le mental model spec §6.1) :
 *  - Brouillons → gris (DRAFT)
 *  - En cours → amber (PROPOSED, PENDING_APPROVAL, APPROVED, PENDING_BOARD,
 *               BOARD_APPROVED, PENDING_SIGNATURE)
 *  - Vivants → emerald (GRANTED, VESTING, PARTIALLY_VESTED, FULLY_VESTED)
 *  - Exercice → sky (PARTIALLY_EXERCISED, FULLY_EXERCISED)
 *  - Terminés négatifs → rouge (FORFEITED, CANCELLED)
 *  - Expiré → slate (EXPIRED)
 */

export const AWARD_STATUS_LABELS: Record<AwardStatus, string> = {
  DRAFT: 'Brouillon',
  PROPOSED: 'Proposé',
  PENDING_APPROVAL: 'Approbation en attente',
  APPROVED: 'Approuvé',
  PENDING_BOARD: 'Board en attente',
  BOARD_APPROVED: 'Board OK',
  PENDING_SIGNATURE: 'Signature en attente',
  GRANTED: 'Attribué',
  VESTING: 'Vesting en cours',
  PARTIALLY_VESTED: 'Partiellement acquis',
  FULLY_VESTED: 'Totalement acquis',
  PARTIALLY_EXERCISED: 'Partiellement exercé',
  FULLY_EXERCISED: 'Totalement exercé',
  EXPIRED: 'Expiré',
  FORFEITED: 'Confisqué',
  CANCELLED: 'Annulé',
};

const NEUTRAL = 'bg-muted text-muted-foreground border-border';
const AMBER =
  'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900';
const INDIGO =
  'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:border-indigo-900';
const EMERALD =
  'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900';
const EMERALD_DARK =
  'bg-emerald-200 text-emerald-950 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-50 dark:border-emerald-800';
const SKY =
  'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:border-sky-900';
const SLATE =
  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800';
const DESTRUCTIVE = 'bg-destructive/10 text-destructive border-destructive/30';

export const AWARD_STATUS_CLASSES: Record<AwardStatus, string> = {
  DRAFT: NEUTRAL,
  PROPOSED: AMBER,
  PENDING_APPROVAL: AMBER,
  APPROVED: AMBER,
  PENDING_BOARD: INDIGO,
  BOARD_APPROVED: INDIGO,
  PENDING_SIGNATURE: INDIGO,
  GRANTED: EMERALD,
  VESTING: EMERALD,
  PARTIALLY_VESTED: EMERALD_DARK,
  FULLY_VESTED: EMERALD_DARK,
  PARTIALLY_EXERCISED: SKY,
  FULLY_EXERCISED: SKY,
  EXPIRED: SLATE,
  FORFEITED: DESTRUCTIVE,
  CANCELLED: DESTRUCTIVE,
};

export const AWARD_STATUS_GROUPS = {
  Brouillons: ['DRAFT'] as AwardStatus[],
  'En cours': [
    'PROPOSED',
    'PENDING_APPROVAL',
    'APPROVED',
    'PENDING_BOARD',
    'BOARD_APPROVED',
    'PENDING_SIGNATURE',
  ] as AwardStatus[],
  Vivants: [
    'GRANTED',
    'VESTING',
    'PARTIALLY_VESTED',
    'FULLY_VESTED',
    'PARTIALLY_EXERCISED',
  ] as AwardStatus[],
  Terminés: ['FULLY_EXERCISED', 'EXPIRED', 'FORFEITED', 'CANCELLED'] as AwardStatus[],
};

export function AwardStatusBadge({
  status,
  className,
}: {
  status: AwardStatus | string;
  className?: string;
}) {
  const cls = AWARD_STATUS_CLASSES[status as AwardStatus] ?? NEUTRAL;
  const label = AWARD_STATUS_LABELS[status as AwardStatus] ?? status;
  return (
    <Badge
      variant="outline"
      className={cn(cls, 'whitespace-nowrap font-medium', className)}
      data-testid={`award-status-${String(status).toLowerCase()}`}
    >
      {label}
    </Badge>
  );
}
