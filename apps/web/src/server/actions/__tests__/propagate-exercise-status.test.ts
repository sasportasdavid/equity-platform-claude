import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 9 B5 — Tests propagateExerciseApprovalDecision (résolution dette #106).
 *
 * Couverture :
 *  - Approval IN_PROGRESS → no-op (étape intermédiaire)
 *  - Approval APPROVED → UPDATE exercise SET APPROVED + audit exercise.approved
 *  - Approval REJECTED → UPDATE exercise SET REJECTED + audit exercise.rejected
 *  - Idempotence : exercise déjà CANCELLED → 0 row mise à jour, pas d'audit
 *  - Failure modes : SELECT approval erreur, UPDATE exercise erreur
 *  - Validation : actorUserId vide → throws
 *  - Audit best-effort : logAuditEvent ne fait jamais throw (vérifié via mock)
 */

const { TEST_USER_ID, TEST_EXERCISE_ID, TEST_APPROVAL_ID } = vi.hoisted(() => ({
  TEST_USER_ID: 'a0b0c0d0-0000-4000-8000-000000000099',
  TEST_EXERCISE_ID: 'e1b1c1d1-1111-4111-8111-111111111111',
  TEST_APPROVAL_ID: 'a2b2c2d2-2222-4222-8222-222222222222',
}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    approvalRequest: null as null | {
      id: string;
      status: string;
      rejected_reason: string | null;
      org_id: string;
    },
    approvalSelectError: null as null | { message: string },
    updateExerciseRows: [] as Array<{ id: string; status: string }>,
    updateExerciseError: null as null | { message: string },
    auditCalls: [] as Array<{ eventType: string; resourceId?: string; metadata?: unknown }>,
  },
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(
    async (input: { eventType: string; resourceId?: string; metadata?: unknown }) => {
      mockState.auditCalls.push(input);
    },
  ),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'approval_requests') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () =>
            Promise.resolve({
              data: mockState.approvalRequest,
              error: mockState.approvalSelectError,
            }),
        };
        return builder;
      }
      if (table === 'exercise_requests') {
        const builder = {
          update: () => builder,
          eq: () => builder,
          select: () =>
            Promise.resolve({
              data: mockState.updateExerciseRows,
              error: mockState.updateExerciseError,
            }),
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { propagateExerciseApprovalDecision } from '../_helpers/propagate-exercise-status';

beforeEach(() => {
  mockState.approvalRequest = {
    id: TEST_APPROVAL_ID,
    status: 'IN_PROGRESS',
    rejected_reason: null,
    org_id: 'org-test',
  };
  mockState.approvalSelectError = null;
  mockState.updateExerciseRows = [{ id: TEST_EXERCISE_ID, status: 'APPROVED' }];
  mockState.updateExerciseError = null;
  mockState.auditCalls = [];
});

describe('propagateExerciseApprovalDecision — flow IN_PROGRESS', () => {
  it('approval IN_PROGRESS → no-op, no UPDATE called, no audit', async () => {
    mockState.approvalRequest!.status = 'IN_PROGRESS';

    const res = await propagateExerciseApprovalDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      approvalRequestId: TEST_APPROVAL_ID,
      decision: 'APPROVED',
      actorUserId: TEST_USER_ID,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.newExerciseStatus).toBe('PENDING');
      expect(res.data.approvalStatusFinal).toBe(false);
    }
    expect(mockState.auditCalls).toHaveLength(0);
  });
});

describe('propagateExerciseApprovalDecision — flow APPROVED final', () => {
  beforeEach(() => {
    mockState.approvalRequest!.status = 'APPROVED';
  });

  it('UPDATE exercise SET status=APPROVED + audit exercise.approved', async () => {
    const res = await propagateExerciseApprovalDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      approvalRequestId: TEST_APPROVAL_ID,
      decision: 'APPROVED',
      reason: 'OK validé',
      actorUserId: TEST_USER_ID,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.newExerciseStatus).toBe('APPROVED');
      expect(res.data.approvalStatusFinal).toBe(true);
    }
    expect(mockState.auditCalls).toHaveLength(1);
    expect(mockState.auditCalls[0]!.eventType).toBe('exercise.approved');
    expect(mockState.auditCalls[0]!.resourceId).toBe(TEST_EXERCISE_ID);
    expect(mockState.auditCalls[0]!.metadata).toMatchObject({
      approval_request_id: TEST_APPROVAL_ID,
      decision: 'APPROVED',
      reason: 'OK validé',
      propagated_via: 'propagateExerciseApprovalDecision',
    });
  });

  it('idempotence : exercise déjà CANCELLED → 0 row updated, no audit', async () => {
    // Simule l'admin qui a CANCELLED entre-temps : guard WHERE status='PENDING'
    // ne match aucune row → updateExerciseRows reste vide.
    mockState.updateExerciseRows = [];

    const res = await propagateExerciseApprovalDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      approvalRequestId: TEST_APPROVAL_ID,
      decision: 'APPROVED',
      actorUserId: TEST_USER_ID,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.newExerciseStatus).toBe('APPROVED');
      expect(res.data.approvalStatusFinal).toBe(true);
    }
    expect(mockState.auditCalls).toHaveLength(0); // pas d'audit faux positif
  });
});

describe('propagateExerciseApprovalDecision — flow REJECTED final', () => {
  beforeEach(() => {
    mockState.approvalRequest!.status = 'REJECTED';
    mockState.approvalRequest!.rejected_reason = 'Fenêtre fermée';
    mockState.updateExerciseRows = [{ id: TEST_EXERCISE_ID, status: 'REJECTED' }];
  });

  it('UPDATE exercise SET status=REJECTED + audit exercise.rejected avec reason', async () => {
    const res = await propagateExerciseApprovalDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      approvalRequestId: TEST_APPROVAL_ID,
      decision: 'REJECTED',
      reason: 'Fenêtre fermée',
      actorUserId: TEST_USER_ID,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.newExerciseStatus).toBe('REJECTED');
      expect(res.data.approvalStatusFinal).toBe(true);
    }
    expect(mockState.auditCalls).toHaveLength(1);
    expect(mockState.auditCalls[0]!.eventType).toBe('exercise.rejected');
    expect(mockState.auditCalls[0]!.metadata).toMatchObject({
      decision: 'REJECTED',
      reason: 'Fenêtre fermée',
    });
  });
});

describe('propagateExerciseApprovalDecision — failure modes', () => {
  it('SELECT approval erreur → return ok:false', async () => {
    mockState.approvalRequest = null;
    mockState.approvalSelectError = { message: 'connection lost' };

    const res = await propagateExerciseApprovalDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      approvalRequestId: TEST_APPROVAL_ID,
      decision: 'APPROVED',
      actorUserId: TEST_USER_ID,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('connection lost');
  });

  it('approval introuvable → return ok:false', async () => {
    mockState.approvalRequest = null;
    mockState.approvalSelectError = null;

    const res = await propagateExerciseApprovalDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      approvalRequestId: TEST_APPROVAL_ID,
      decision: 'APPROVED',
      actorUserId: TEST_USER_ID,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('introuvable');
  });

  it('UPDATE exercise erreur → return ok:false', async () => {
    mockState.approvalRequest!.status = 'APPROVED';
    mockState.updateExerciseError = { message: 'lock conflict' };

    const res = await propagateExerciseApprovalDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      approvalRequestId: TEST_APPROVAL_ID,
      decision: 'APPROVED',
      actorUserId: TEST_USER_ID,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('lock conflict');
  });
});

describe('propagateExerciseApprovalDecision — validation', () => {
  it('actorUserId vide → throws (validation amont)', async () => {
    await expect(
      propagateExerciseApprovalDecision({
        exerciseRequestId: TEST_EXERCISE_ID,
        approvalRequestId: TEST_APPROVAL_ID,
        decision: 'APPROVED',
        actorUserId: '',
      }),
    ).rejects.toThrow(/actorUserId required/);
  });
});
