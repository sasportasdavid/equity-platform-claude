import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 9 B4 — Tests Server Actions admin pour les exercise_requests.
 *
 * Couvre :
 *  - Zod validation (rejet inputs invalides)
 *  - approveExerciseDecision : pas de décision PENDING → erreur
 *  - approveExerciseDecision : happy path → ok
 *  - rejectExerciseDecision : comment trop court → erreur Zod
 *  - confirmExercisePayment : sans permission → erreur
 *  - confirmExercisePayment : happy path → ok
 *  - adminCancelExercise : sans permission → erreur
 *  - adminCancelExercise : happy path → ok
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Module 9 B5 — mock des helpers fire-and-forget pour isoler le test du
// comportement de la Server Action. Les helpers sont testés en C5/C6.
vi.mock('@/server/actions/_helpers/propagate-exercise-status', () => ({
  propagateExerciseApprovalDecision: vi.fn().mockResolvedValue({
    ok: true,
    data: { newExerciseStatus: 'APPROVED', approvalStatusFinal: true },
  }),
}));
vi.mock('@/server/actions/_helpers/exercise-documents', () => ({
  generateExerciseNotification: vi.fn().mockResolvedValue({
    ok: true,
    documentId: 'doc-99',
    alreadyExists: false,
    storagePath: 'org/exercises/x/file.pdf',
  }),
  generateSubscriptionBulletin: vi.fn().mockResolvedValue({
    ok: true,
    documentId: 'doc-100',
    alreadyExists: false,
    storagePath: 'org/exercises/x/bulletin.pdf',
  }),
}));
vi.mock('@/server/actions/_helpers/exercise-notifications', () => ({
  notifyBeneficiaryOfExerciseDecision: vi
    .fn()
    .mockResolvedValue({ ok: true, notificationId: 'n-1' }),
  notifyBeneficiaryOfExercisePayment: vi
    .fn()
    .mockResolvedValue({ ok: true, notificationId: 'n-2' }),
}));

const { TEST_USER_ID, TEST_REQUEST_ID, TEST_DECISION_ID } = vi.hoisted(() => ({
  TEST_USER_ID: 'a0b0c0d0-0000-4000-8000-000000000099',
  TEST_REQUEST_ID: 'a1b1c1d1-1111-4111-8111-111111111111',
  TEST_DECISION_ID: 'a2b2c2d2-2222-4222-8222-222222222222',
}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    exerciseRequest: null as null | { approval_request_id: string | null },
    pendingDecision: null as null | { id: string; step_order: number },
    rpcRecordError: null as null | { message: string },
    rpcConfirmError: null as null | { message: string },
    rpcCancelError: null as null | { message: string },
    permissions: new Set<string>(),
  },
}));

vi.mock('@/lib/auth/rbac', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: TEST_USER_ID }),
  hasPermission: vi.fn(async (perm: string) => mockState.permissions.has(perm)),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (table: string) => {
        const lookup = async () => {
          if (table === 'exercise_requests') {
            return { data: mockState.exerciseRequest, error: null };
          }
          if (table === 'approval_decisions') {
            return { data: mockState.pendingDecision, error: null };
          }
          return { data: null, error: null };
        };
        const proxy: Record<string, unknown> = new Proxy(
          { maybeSingle: lookup },
          {
            get(target, prop: string) {
              if (prop === 'maybeSingle') return lookup;
              return () => proxy;
            },
          },
        );
        return proxy;
      },
      rpc: (name: string) => {
        if (name === 'record_approval_decision') {
          return Promise.resolve({ data: null, error: mockState.rpcRecordError });
        }
        if (name === 'confirm_exercise_payment') {
          return Promise.resolve({ data: null, error: mockState.rpcConfirmError });
        }
        if (name === 'cancel_exercise_request') {
          return Promise.resolve({ data: null, error: mockState.rpcCancelError });
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
}));

import {
  adminCancelExercise,
  approveExerciseDecision,
  confirmExercisePayment,
  rejectExerciseDecision,
} from '../exercises-admin';

beforeEach(() => {
  mockState.exerciseRequest = { approval_request_id: 'approval-1' };
  mockState.pendingDecision = { id: TEST_DECISION_ID, step_order: 1 };
  mockState.rpcRecordError = null;
  mockState.rpcConfirmError = null;
  mockState.rpcCancelError = null;
  mockState.permissions = new Set();
});

describe('approveExerciseDecision', () => {
  it('Zod reject: exerciseRequestId not UUID', async () => {
    const result = await approveExerciseDecision({
      exerciseRequestId: 'not-uuid',
      comment: 'OK',
    });
    expect(result.ok).toBe(false);
  });

  it('No PENDING decision for user → error', async () => {
    mockState.pendingDecision = null;
    const result = await approveExerciseDecision({
      exerciseRequestId: TEST_REQUEST_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Aucune décision');
    }
  });

  it('Happy path → ok', async () => {
    const result = await approveExerciseDecision({
      exerciseRequestId: TEST_REQUEST_ID,
      comment: 'Validated',
    });
    expect(result.ok).toBe(true);
  });

  it('RPC error propagated', async () => {
    mockState.rpcRecordError = { message: 'Workflow already completed' };
    const result = await approveExerciseDecision({
      exerciseRequestId: TEST_REQUEST_ID,
    });
    expect(result.ok).toBe(false);
  });
});

describe('rejectExerciseDecision', () => {
  it('Zod reject: comment too short', async () => {
    const result = await rejectExerciseDecision({
      exerciseRequestId: TEST_REQUEST_ID,
      comment: 'no',
    });
    expect(result.ok).toBe(false);
  });

  it('Happy path with valid comment → ok', async () => {
    const result = await rejectExerciseDecision({
      exerciseRequestId: TEST_REQUEST_ID,
      comment: 'Insufficient documentation provided',
    });
    expect(result.ok).toBe(true);
  });

  it('No PENDING decision → error', async () => {
    mockState.pendingDecision = null;
    const result = await rejectExerciseDecision({
      exerciseRequestId: TEST_REQUEST_ID,
      comment: 'Reject this please',
    });
    expect(result.ok).toBe(false);
  });
});

describe('confirmExercisePayment', () => {
  it('Without permission → error', async () => {
    const result = await confirmExercisePayment({
      exerciseRequestId: TEST_REQUEST_ID,
      paymentAmountReceived: 1500,
      paymentReference: 'VIR-001',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Permission');
    }
  });

  it('With permission → ok', async () => {
    mockState.permissions.add('exercises.confirm_payment');
    const result = await confirmExercisePayment({
      exerciseRequestId: TEST_REQUEST_ID,
      paymentAmountReceived: 1500,
      paymentReference: 'VIR-001',
    });
    expect(result.ok).toBe(true);
  });

  it('Zod reject: negative amount', async () => {
    mockState.permissions.add('exercises.confirm_payment');
    const result = await confirmExercisePayment({
      exerciseRequestId: TEST_REQUEST_ID,
      paymentAmountReceived: -100,
      paymentReference: 'VIR-001',
    });
    expect(result.ok).toBe(false);
  });

  it('Zod reject: empty reference', async () => {
    mockState.permissions.add('exercises.confirm_payment');
    const result = await confirmExercisePayment({
      exerciseRequestId: TEST_REQUEST_ID,
      paymentAmountReceived: 1500,
      paymentReference: '',
    });
    expect(result.ok).toBe(false);
  });
});

describe('adminCancelExercise', () => {
  it('Without permission cancel.any → error', async () => {
    const result = await adminCancelExercise({
      exerciseRequestId: TEST_REQUEST_ID,
      reason: 'Re-orientation',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Permission');
    }
  });

  it('With permission cancel.any → ok', async () => {
    mockState.permissions.add('exercises.cancel.any');
    const result = await adminCancelExercise({
      exerciseRequestId: TEST_REQUEST_ID,
      reason: 'Re-orientation strategy',
    });
    expect(result.ok).toBe(true);
  });

  it('Zod reject: reason too short', async () => {
    mockState.permissions.add('exercises.cancel.any');
    const result = await adminCancelExercise({
      exerciseRequestId: TEST_REQUEST_ID,
      reason: 'no',
    });
    expect(result.ok).toBe(false);
  });

  it('Propagates RPC error', async () => {
    mockState.permissions.add('exercises.cancel.any');
    mockState.rpcCancelError = { message: 'Cannot cancel COMPLETED exercise' };
    const result = await adminCancelExercise({
      exerciseRequestId: TEST_REQUEST_ID,
      reason: 'Strategic reason',
    });
    expect(result.ok).toBe(false);
  });
});
