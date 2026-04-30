import { describe, expect, it } from 'vitest';
import { computeStepStatus } from '../timeline-helpers';

/**
 * Tests pour computeStepStatus du timeline B4.
 *
 * Couvre les 5 statuts retournés (approved/rejected/in_progress/upcoming/skipped)
 * + cas combinés (REJECTED priorise sur APPROVED, etc.).
 */

describe('computeStepStatus', () => {
  it('1 APPROVED + required=1 → approved', () => {
    expect(
      computeStepStatus(
        { step_order: 1, required_approvals: 1 },
        [{ step_order: 1, status: 'APPROVED' }],
        1,
        'IN_PROGRESS',
      ),
    ).toBe('approved');
  });

  it('2 APPROVED + required=2 → approved (ANY_OF satisfait)', () => {
    expect(
      computeStepStatus(
        { step_order: 1, required_approvals: 2 },
        [
          { step_order: 1, status: 'APPROVED' },
          { step_order: 1, status: 'APPROVED' },
          { step_order: 1, status: 'PENDING' },
        ],
        1,
        'IN_PROGRESS',
      ),
    ).toBe('approved');
  });

  it('1 REJECTED → rejected (priorité absolue, même si APPROVED present)', () => {
    expect(
      computeStepStatus(
        { step_order: 2, required_approvals: 1 },
        [
          { step_order: 2, status: 'APPROVED' },
          { step_order: 2, status: 'REJECTED' },
        ],
        2,
        'IN_PROGRESS',
      ),
    ).toBe('rejected');
  });

  it('PENDING + step courant → in_progress', () => {
    expect(
      computeStepStatus(
        { step_order: 2, required_approvals: 1 },
        [{ step_order: 2, status: 'PENDING' }],
        2,
        'IN_PROGRESS',
      ),
    ).toBe('in_progress');
  });

  it('Aucune décision + step > current → upcoming', () => {
    expect(computeStepStatus({ step_order: 3, required_approvals: 1 }, [], 2, 'IN_PROGRESS')).toBe(
      'upcoming',
    );
  });

  it('CANCELLED workflow + decisions PENDING → skipped', () => {
    expect(
      computeStepStatus(
        { step_order: 2, required_approvals: 1 },
        [{ step_order: 2, status: 'PENDING' }],
        2,
        'CANCELLED',
      ),
    ).toBe('skipped');
  });

  it('REJECTED workflow avec SKIPPED decisions → skipped', () => {
    expect(
      computeStepStatus(
        { step_order: 3, required_approvals: 1 },
        [{ step_order: 3, status: 'SKIPPED' }],
        3,
        'REJECTED',
      ),
    ).toBe('skipped');
  });

  it('1 APPROVED + 1 PENDING + required=2 → in_progress (pas encore atteint)', () => {
    expect(
      computeStepStatus(
        { step_order: 1, required_approvals: 2 },
        [
          { step_order: 1, status: 'APPROVED' },
          { step_order: 1, status: 'PENDING' },
        ],
        1,
        'IN_PROGRESS',
      ),
    ).toBe('in_progress');
  });

  it("Aucune décision + step = current → in_progress n'arrive pas (pas de PENDING) → skipped", () => {
    // Edge case : step courant mais aucune decision insérée → fallback skipped
    expect(computeStepStatus({ step_order: 2, required_approvals: 1 }, [], 2, 'IN_PROGRESS')).toBe(
      'skipped',
    );
  });
});
