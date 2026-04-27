/**
 * State machine des awards (Module 1 §6).
 *
 * Centraliser **toutes** les transitions d'état ici. Toute Server Action
 * qui change `awards.status` doit valider la transition via `canTransition()`
 * avant l'écriture en base.
 */

export const AWARD_STATUSES = [
  'DRAFT',
  'PROPOSED',
  'PENDING_APPROVAL',
  'APPROVED',
  'PENDING_BOARD',
  'BOARD_APPROVED',
  'PENDING_SIGNATURE',
  'GRANTED',
  'VESTING',
  'PARTIALLY_VESTED',
  'FULLY_VESTED',
  'PARTIALLY_EXERCISED',
  'FULLY_EXERCISED',
  'EXPIRED',
  'FORFEITED',
  'CANCELLED',
] as const;

export type AwardStatus = (typeof AWARD_STATUSES)[number];

const TRANSITIONS = {
  DRAFT: ['PROPOSED', 'CANCELLED'],
  PROPOSED: ['PENDING_APPROVAL', 'DRAFT', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'PROPOSED', 'CANCELLED'],
  APPROVED: ['PENDING_BOARD', 'PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_BOARD: ['BOARD_APPROVED', 'CANCELLED'],
  BOARD_APPROVED: ['PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['GRANTED', 'CANCELLED'],
  GRANTED: ['VESTING', 'CANCELLED', 'FORFEITED'],
  VESTING: ['PARTIALLY_VESTED', 'FULLY_VESTED', 'FORFEITED', 'EXPIRED'],
  PARTIALLY_VESTED: ['FULLY_VESTED', 'PARTIALLY_EXERCISED', 'FORFEITED', 'EXPIRED'],
  FULLY_VESTED: ['PARTIALLY_EXERCISED', 'FULLY_EXERCISED', 'EXPIRED', 'FORFEITED'],
  PARTIALLY_EXERCISED: ['FULLY_EXERCISED', 'EXPIRED', 'FORFEITED'],
  FULLY_EXERCISED: [],
  EXPIRED: [],
  FORFEITED: [],
  CANCELLED: [],
} as const satisfies Record<AwardStatus, readonly AwardStatus[]>;

export type AwardTransition = {
  from: AwardStatus;
  to: AwardStatus;
};

export function canTransition(from: AwardStatus, to: AwardStatus): boolean {
  const allowed = TRANSITIONS[from];
  return (allowed as readonly AwardStatus[]).includes(to);
}

export function getNextStates(from: AwardStatus): readonly AwardStatus[] {
  return TRANSITIONS[from];
}

/** États terminaux : aucune transition sortante. */
export function isTerminal(status: AwardStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Award activement en cours de vesting (entre GRANTED et FULLY_VESTED). */
export function isVesting(status: AwardStatus): boolean {
  return status === 'VESTING' || status === 'PARTIALLY_VESTED';
}

/** Award éligible à exercice (vesté au moins partiellement, options seulement). */
export function isExercisable(status: AwardStatus): boolean {
  return (
    status === 'PARTIALLY_VESTED' || status === 'FULLY_VESTED' || status === 'PARTIALLY_EXERCISED'
  );
}
