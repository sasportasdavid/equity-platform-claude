import { describe, expect, it } from 'vitest';
import { AWARD_STATUS_VALUES, type AwardStatus } from '@equity/shared';
import {
  ALLOWED_TRANSITIONS,
  assertIsAwardStatus,
  canTransition,
  getAllowedTransitions,
  isCancellable,
  isPostGrantStatus,
  isTerminalStatus,
  timestampFieldForStatus,
} from '../awardStateMachine';

/**
 * Couverture cible : 100% sur awardStateMachine.ts.
 *
 * On parcourt les 16 statuts × 16 statuts (256 paires) pour valider
 * exhaustivement canTransition + isolement des états terminaux.
 */

const ALL: readonly AwardStatus[] = AWARD_STATUS_VALUES;

const TERMINAL: readonly AwardStatus[] = ['FULLY_EXERCISED', 'EXPIRED', 'FORFEITED', 'CANCELLED'];

const POST_GRANT: readonly AwardStatus[] = [
  'GRANTED',
  'VESTING',
  'PARTIALLY_VESTED',
  'FULLY_VESTED',
  'PARTIALLY_EXERCISED',
  'FULLY_EXERCISED',
  'EXPIRED',
  'FORFEITED',
];

describe('awardStateMachine', () => {
  // ---------------------------------------------------------------------------
  // canTransition — exhaustif 16x16
  // ---------------------------------------------------------------------------
  describe('canTransition', () => {
    it('retourne true pour TOUTES les paires listées dans ALLOWED_TRANSITIONS', () => {
      for (const from of ALL) {
        for (const to of ALLOWED_TRANSITIONS[from]) {
          expect(canTransition(from, to), `${from} → ${to} devrait être autorisé`).toBe(true);
        }
      }
    });

    it('retourne false pour TOUTES les paires hors ALLOWED_TRANSITIONS (parcours 16x16)', () => {
      let validCount = 0;
      let invalidCount = 0;
      for (const from of ALL) {
        for (const to of ALL) {
          const isAllowed = (ALLOWED_TRANSITIONS[from] as readonly AwardStatus[]).includes(to);
          const result = canTransition(from, to);
          expect(result, `${from} → ${to} : got ${result}, expected ${isAllowed}`).toBe(isAllowed);
          if (isAllowed) validCount++;
          else invalidCount++;
        }
      }
      // Sanity check sur la matrice : 30 transitions valides sur 256 paires.
      // Si ce compte change, c'est qu'on a modifié ALLOWED_TRANSITIONS —
      // mettre à jour la spec MODULE_03B_AWARDS_LIFECYCLE.md §2.2 en parallèle.
      expect(validCount).toBe(30);
      expect(invalidCount).toBe(226);
      expect(validCount + invalidCount).toBe(256);
    });

    it('retourne false pour transition vers le même état', () => {
      // Aucun statut n'a lui-même dans ALLOWED_TRANSITIONS (sécurité).
      for (const status of ALL) {
        expect(
          canTransition(status, status),
          `${status} → ${status} ne doit pas être autorisé`,
        ).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // États terminaux
  // ---------------------------------------------------------------------------
  describe('états terminaux', () => {
    it('FULLY_EXERCISED, EXPIRED, FORFEITED, CANCELLED ont 0 transitions sortantes', () => {
      for (const status of TERMINAL) {
        expect(ALLOWED_TRANSITIONS[status], `${status} doit être terminal`).toEqual([]);
        expect(getAllowedTransitions(status)).toEqual([]);
      }
    });

    it("aucun état terminal n'accepte de transition entrante depuis lui-même", () => {
      for (const terminal of TERMINAL) {
        for (const target of ALL) {
          expect(
            canTransition(terminal, target),
            `${terminal} ne doit pas pouvoir → ${target}`,
          ).toBe(false);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Garde-fou : DRAFT et CANCELLED inatteignables depuis post-GRANTED
  // ---------------------------------------------------------------------------
  describe('isolation post-GRANTED', () => {
    it('ne permet PAS de revenir à DRAFT depuis un état post-GRANTED', () => {
      for (const from of POST_GRANT) {
        expect(canTransition(from, 'DRAFT'), `${from} → DRAFT doit être interdit`).toBe(false);
      }
    });

    it('ne permet PAS de CANCELLER un award post-GRANTED (utiliser FORFEITED ou modification)', () => {
      for (const from of POST_GRANT) {
        expect(canTransition(from, 'CANCELLED'), `${from} → CANCELLED doit être interdit`).toBe(
          false,
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // isTerminalStatus — exhaustif 16
  // ---------------------------------------------------------------------------
  describe('isTerminalStatus', () => {
    it('renvoie true pour les 4 statuts terminaux et false pour les 12 autres', () => {
      for (const status of ALL) {
        const expected = TERMINAL.includes(status);
        expect(isTerminalStatus(status), `${status}: expected ${expected}`).toBe(expected);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // isPostGrantStatus — exhaustif 16
  // ---------------------------------------------------------------------------
  describe('isPostGrantStatus', () => {
    it('renvoie true pour les 8 statuts post-GRANTED et false pour les 8 autres', () => {
      for (const status of ALL) {
        const expected = POST_GRANT.includes(status);
        expect(isPostGrantStatus(status), `${status}: expected ${expected}`).toBe(expected);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // isCancellable — cohérent avec canTransition(_, 'CANCELLED')
  // ---------------------------------------------------------------------------
  describe('isCancellable', () => {
    it('est cohérent avec canTransition(from, CANCELLED) pour les 16 statuts', () => {
      for (const status of ALL) {
        expect(isCancellable(status), `${status}: incohérence`).toBe(
          canTransition(status, 'CANCELLED'),
        );
      }
    });

    it('DRAFT, PROPOSED, PENDING_APPROVAL, APPROVED, PENDING_BOARD, BOARD_APPROVED, PENDING_SIGNATURE sont cancellables', () => {
      const cancellable: AwardStatus[] = [
        'DRAFT',
        'PROPOSED',
        'PENDING_APPROVAL',
        'APPROVED',
        'PENDING_BOARD',
        'BOARD_APPROVED',
        'PENDING_SIGNATURE',
      ];
      for (const status of cancellable) {
        expect(isCancellable(status), `${status} devrait être cancellable`).toBe(true);
      }
    });

    it('post-GRANTED + terminaux NE sont PAS cancellables', () => {
      for (const status of POST_GRANT) {
        expect(isCancellable(status), `${status} ne devrait PAS être cancellable`).toBe(false);
      }
      // CANCELLED lui-même est terminal → non recancellable
      expect(isCancellable('CANCELLED')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getAllowedTransitions
  // ---------------------------------------------------------------------------
  describe('getAllowedTransitions', () => {
    it('retourne exactement ALLOWED_TRANSITIONS[from] pour les 16 statuts', () => {
      for (const status of ALL) {
        expect(getAllowedTransitions(status)).toEqual(ALLOWED_TRANSITIONS[status]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // timestampFieldForStatus
  // ---------------------------------------------------------------------------
  describe('timestampFieldForStatus', () => {
    it('mappe APPROVED/GRANTED/CANCELLED aux bons timestamps DB', () => {
      expect(timestampFieldForStatus('APPROVED')).toBe('approved_at');
      expect(timestampFieldForStatus('GRANTED')).toBe('granted_at');
      expect(timestampFieldForStatus('CANCELLED')).toBe('cancelled_at');
    });

    it('retourne null pour les autres statuts', () => {
      const others = ALL.filter((s) => !['APPROVED', 'GRANTED', 'CANCELLED'].includes(s));
      for (const status of others) {
        expect(timestampFieldForStatus(status)).toBeNull();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // assertIsAwardStatus
  // ---------------------------------------------------------------------------
  describe('assertIsAwardStatus', () => {
    it('passe pour les 16 statuts valides', () => {
      for (const status of ALL) {
        expect(() => assertIsAwardStatus(status)).not.toThrow();
      }
    });

    it('throw pour valeurs invalides', () => {
      expect(() => assertIsAwardStatus('NOT_A_STATUS')).toThrow(/Invalid AwardStatus/);
      expect(() => assertIsAwardStatus('')).toThrow();
      expect(() => assertIsAwardStatus(42)).toThrow();
      expect(() => assertIsAwardStatus(null)).toThrow();
      expect(() => assertIsAwardStatus(undefined)).toThrow();
      expect(() => assertIsAwardStatus({})).toThrow();
    });
  });
});
