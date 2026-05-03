import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 9 B3 — Tests Server Actions exercises.
 *
 * Couvre :
 *  - Zod validation : reject inputs invalides (units ≤ 0, awardId not UUID, …)
 *  - createExerciseRequest : refuse AGA, propage erreur RPC, retourne ok+ids sur happy path
 *  - cancelMyExerciseRequest : reject reason trop court, retourne ok sur happy path
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Module 9 B5 — mock des hooks fire-and-forget pour éviter la chaîne d'imports
// (getSupabaseAdminClient + clientEnv) dans les tests Server Action.
vi.mock('@/server/actions/_helpers/exercise-notifications', () => ({
  notifyAdminsOfExerciseRequest: vi.fn().mockResolvedValue({ ok: true, created: 0 }),
  notifyBeneficiaryOfExerciseDecision: vi
    .fn()
    .mockResolvedValue({ ok: true, notificationId: null }),
  notifyBeneficiaryOfExercisePayment: vi.fn().mockResolvedValue({ ok: true, notificationId: null }),
}));

const { TEST_USER_ID, TEST_AWARD_ID, TEST_REQUEST_ID } = vi.hoisted(() => ({
  TEST_USER_ID: 'a0b0c0d0-0000-4000-8000-000000000099',
  TEST_AWARD_ID: 'a1b1c1d1-1111-4111-8111-111111111111',
  TEST_REQUEST_ID: 'a2b2c2d2-2222-4222-8222-222222222222',
}));

vi.mock('@/lib/auth/rbac', () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: TEST_USER_ID,
    email: 'bene@capiwise.local',
    fullName: 'Bene User',
    activeOrgId: 'org',
    orgIds: ['org'],
    activeRoles: ['BENEFICIARY'],
  }),
}));

const { mockState } = vi.hoisted(() => {
  return {
    mockState: {
      awardRow: null as null | {
        id: string;
        plan_id: string;
        grant_date: string | null;
        exercise_price: number | null;
        units_granted: number;
      },
      planRow: null as null | { id: string; plan_type: string; company_id: string },
      companyRow: null as null | { last_known_fmv_per_share: number | null },
      beneRow: null as null | { id: string; hire_date: string | null },
      rpcRequestExerciseError: null as null | { message: string },
      rpcRequestExerciseData: null as unknown,
      rpcCancelError: null as null | { message: string },
    },
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (table: string) => {
        const lookup = async () => {
          if (table === 'awards') return { data: mockState.awardRow, error: null };
          if (table === 'plans') return { data: mockState.planRow, error: null };
          if (table === 'companies') return { data: mockState.companyRow, error: null };
          if (table === 'beneficiaries') return { data: mockState.beneRow, error: null };
          return { data: null, error: null };
        };
        const chainable: Record<string, unknown> = {
          maybeSingle: lookup,
        };
        const proxy: Record<string, unknown> = new Proxy(chainable, {
          get(target, prop: string) {
            if (prop === 'maybeSingle') return lookup;
            // Any other method (select, eq, is, etc.) returns the proxy
            return () => proxy;
          },
        });
        return proxy;
      },
      rpc: (name: string) => {
        if (name === 'request_exercise') {
          return Promise.resolve({
            data: mockState.rpcRequestExerciseData,
            error: mockState.rpcRequestExerciseError,
          });
        }
        if (name === 'cancel_exercise_request') {
          return Promise.resolve({ data: null, error: mockState.rpcCancelError });
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
}));

import { cancelMyExerciseRequest, createExerciseRequest } from '../exercises';

beforeEach(() => {
  mockState.awardRow = {
    id: TEST_AWARD_ID,
    plan_id: 'plan-1',
    grant_date: '2022-01-01',
    exercise_price: 1,
    units_granted: 1000,
  };
  mockState.planRow = {
    id: 'plan-1',
    plan_type: 'BSPCE',
    company_id: 'company-1',
  };
  mockState.companyRow = { last_known_fmv_per_share: 25 };
  mockState.beneRow = { id: 'bene-1', hire_date: '2022-01-01' };
  mockState.rpcRequestExerciseError = null;
  mockState.rpcRequestExerciseData = {
    exercise_request_id: TEST_REQUEST_ID,
    request_number: 'EXR-2026-0001',
    approval_request_id: 'approval-1',
    total_amount: 100,
    status: 'PENDING',
  };
  mockState.rpcCancelError = null;
});

describe('createExerciseRequest', () => {
  it('Zod reject : awardId not UUID', async () => {
    const result = await createExerciseRequest({
      awardId: 'not-a-uuid',
      unitsToExercise: 100,
      cessionToggle: false,
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.ok).toBe(false);
  });

  it('Zod reject : unitsToExercise = 0', async () => {
    const result = await createExerciseRequest({
      awardId: TEST_AWARD_ID,
      unitsToExercise: 0,
      cessionToggle: false,
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.ok).toBe(false);
  });

  it('Zod reject : cession toggle ON sans cession_date', async () => {
    const result = await createExerciseRequest({
      awardId: TEST_AWARD_ID,
      unitsToExercise: 100,
      cessionToggle: true,
      cessionPricePerUnit: 25,
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.ok).toBe(false);
  });

  it('refuse AGA explicitly', async () => {
    mockState.planRow = {
      id: 'plan-1',
      plan_type: 'AGA',
      company_id: 'company-1',
    };
    const result = await createExerciseRequest({
      awardId: TEST_AWARD_ID,
      unitsToExercise: 100,
      cessionToggle: false,
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('AGA');
    }
  });

  it('happy path BSPCE → ok=true + ids', async () => {
    const result = await createExerciseRequest({
      awardId: TEST_AWARD_ID,
      unitsToExercise: 100,
      cessionToggle: false,
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.exerciseRequestId).toBe(TEST_REQUEST_ID);
      expect(result.requestNumber).toBe('EXR-2026-0001');
      expect(result.status).toBe('PENDING');
    }
  });

  it('propage erreur RPC (ex: EXERCISE_UNITS_AVAILABLE)', async () => {
    mockState.rpcRequestExerciseError = {
      message: 'EXERCISE_UNITS_AVAILABLE: not enough units',
    };
    const result = await createExerciseRequest({
      awardId: TEST_AWARD_ID,
      unitsToExercise: 100,
      cessionToggle: false,
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('EXERCISE_UNITS_AVAILABLE');
    }
  });
});

describe('cancelMyExerciseRequest', () => {
  it('Zod reject : reason trop court', async () => {
    const result = await cancelMyExerciseRequest({
      requestId: TEST_REQUEST_ID,
      reason: 'no',
    });
    expect(result.ok).toBe(false);
  });

  it('happy path → ok=true', async () => {
    const result = await cancelMyExerciseRequest({
      requestId: TEST_REQUEST_ID,
      reason: 'Reconsidered',
    });
    expect(result.ok).toBe(true);
  });

  it('propage erreur RPC', async () => {
    mockState.rpcCancelError = {
      message: 'Cannot cancel exercise request in status COMPLETED',
    };
    const result = await cancelMyExerciseRequest({
      requestId: TEST_REQUEST_ID,
      reason: 'Reconsidered',
    });
    expect(result.ok).toBe(false);
  });
});
