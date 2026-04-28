import { AWARD_STATUS_VALUES, type AwardStatus } from '@equity/shared';

/**
 * Module 3b — State machine pure pour les awards.
 *
 * Aucun import Supabase, aucun side-effect — fonction pure 100 % testable
 * en isolation. Spec : docs/MODULE_03B_AWARDS_LIFECYCLE.md §2.
 *
 * Le type `AwardStatus` vit dans `@equity/shared/schemas/award.ts` (single
 * source of truth, partagée avec les schémas Zod). On le ré-exporte ici par
 * commodité pour les call-sites de la state machine.
 */

export type { AwardStatus };

// ---------------------------------------------------------------------------
// ALLOWED_TRANSITIONS — copier-coller §2.2 de la spec
// ---------------------------------------------------------------------------
// Si tu modifies ce mapping, mets à jour les tests dans __tests__/ et le
// comment block §2.2 du doc spec en parallèle.

export const ALLOWED_TRANSITIONS: Readonly<Record<AwardStatus, readonly AwardStatus[]>> = {
  DRAFT: ['PROPOSED', 'CANCELLED'],
  PROPOSED: ['PENDING_APPROVAL', 'DRAFT', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'PROPOSED', 'CANCELLED'],
  APPROVED: ['PENDING_BOARD', 'PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_BOARD: ['BOARD_APPROVED', 'CANCELLED'],
  BOARD_APPROVED: ['PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['GRANTED', 'CANCELLED'],
  GRANTED: ['VESTING', 'FORFEITED'],
  VESTING: ['PARTIALLY_VESTED', 'FULLY_VESTED', 'FORFEITED'],
  PARTIALLY_VESTED: ['FULLY_VESTED', 'PARTIALLY_EXERCISED', 'FORFEITED'],
  FULLY_VESTED: ['PARTIALLY_EXERCISED', 'FULLY_EXERCISED', 'EXPIRED'],
  PARTIALLY_EXERCISED: ['FULLY_EXERCISED', 'EXPIRED'],
  FULLY_EXERCISED: [],
  EXPIRED: [],
  FORFEITED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------------------
// Sets dérivés (constants pour éviter la recréation à chaque appel)
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES: ReadonlySet<AwardStatus> = new Set([
  'FULLY_EXERCISED',
  'EXPIRED',
  'FORFEITED',
  'CANCELLED',
]);

const POST_GRANT_STATUSES: ReadonlySet<AwardStatus> = new Set([
  'GRANTED',
  'VESTING',
  'PARTIALLY_VESTED',
  'FULLY_VESTED',
  'PARTIALLY_EXERCISED',
  'FULLY_EXERCISED',
  'EXPIRED',
  'FORFEITED',
]);

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * `true` si la transition `from → to` est autorisée par ALLOWED_TRANSITIONS.
 *
 * Retourne `false` pour :
 *  - les paires non listées dans ALLOWED_TRANSITIONS
 *  - les états terminaux (out: [])
 *  - une transition vers le même état (un award doit changer de statut)
 *  - un status inconnu (défensif)
 */
export function canTransition(from: AwardStatus, to: AwardStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/** Retourne la liste (gelée) des transitions sortantes possibles. */
export function getAllowedTransitions(from: AwardStatus): readonly AwardStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

/** `true` si le statut est terminal (aucune transition sortante). */
export function isTerminalStatus(status: AwardStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * `true` si le statut est dans la phase post-GRANTED (vesting / exercise /
 * leaver). Utilisé pour bloquer l'édition structurelle du plan ou le
 * cancel "soft" (post-GRANTED → forfeit ou modification IFRS 2.27, pas
 * cancel direct).
 */
export function isPostGrantStatus(status: AwardStatus): boolean {
  return POST_GRANT_STATUSES.has(status);
}

/** `true` si l'award peut transitionner vers CANCELLED depuis son état actuel. */
export function isCancellable(status: AwardStatus): boolean {
  return canTransition(status, 'CANCELLED');
}

// ---------------------------------------------------------------------------
// Helpers métier (utilisés par transitionAward Server Action)
// ---------------------------------------------------------------------------

/**
 * Pour un statut donné, retourne le timestamp à mettre à jour dans `awards`
 * lors de la transition vers ce statut. `null` si pas de timestamp dédié.
 *
 * Convention :
 *   - APPROVED → approved_at
 *   - GRANTED  → granted_at
 *   - CANCELLED → cancelled_at
 *
 * Les autres états ne déclenchent pas d'écriture timestamp dédiée (le
 * `updated_at` est mis à jour à chaque UPDATE par défaut).
 */
export function timestampFieldForStatus(status: AwardStatus): string | null {
  switch (status) {
    case 'APPROVED':
      return 'approved_at';
    case 'GRANTED':
      return 'granted_at';
    case 'CANCELLED':
      return 'cancelled_at';
    default:
      return null;
  }
}

/** Garde-fou TS exhaustif sur AwardStatus — utile dans les switch métier. */
export function assertIsAwardStatus(value: unknown): asserts value is AwardStatus {
  if (typeof value !== 'string' || !(AWARD_STATUS_VALUES as readonly string[]).includes(value)) {
    throw new Error(`Invalid AwardStatus: ${String(value)}`);
  }
}
