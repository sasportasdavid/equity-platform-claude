import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 9 B5 — Tests des 3 hooks notification email exercise.
 *
 * Mocke insertNotificationWithRender (queue Module 7 réutilisée) + Supabase
 * admin client + auth.users lookup. Pattern vi.hoisted aligné Module 9 B3+B4.
 *
 * Couverture :
 *  - notifyAdminsOfExerciseRequest : 0 admin → warning, OK ; ADMIN_HR/OWNER
 *    dédupliqués ; insertNotificationWithRender appelée par recipient
 *  - notifyBeneficiaryOfExerciseDecision : 3 dispatchs templates selon decision,
 *    fallback si email null
 *  - notifyBeneficiaryOfExercisePayment : OK + variables incluant montant/date
 */

const { TEST_EXERCISE_ID, TEST_ORG_ID, TEST_BENE_ID, TEST_AWARD_ID } = vi.hoisted(() => ({
  TEST_EXERCISE_ID: 'e0b0c0d0-1111-4111-8111-111111111111',
  TEST_ORG_ID: '0fb0c0d0-2222-4222-8222-222222222222',
  TEST_BENE_ID: 'b0b0c0d0-3333-4333-8333-333333333333',
  TEST_AWARD_ID: 'a0b0c0d0-4444-4444-8444-444444444444',
}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    exercise: null as null | Record<string, unknown>,
    award: null as null | Record<string, unknown>,
    plan: null as null | Record<string, unknown>,
    org: null as null | Record<string, unknown>,
    beneficiary: null as null | Record<string, unknown>,
    memberships: [] as Array<{ user_id: string | null; roles: string[] | null }>,
    authUsers: new Map<string, { email: string; full_name?: string }>(),
    insertCalls: [] as Array<{ templateCode: string; recipientEmail?: string; variables: unknown }>,
    insertResult: { ok: true, notificationId: 'notif-1' } as
      | { ok: true; notificationId: string }
      | { ok: false; error: string },
  },
}));

vi.mock('@/server/actions/notifications', () => ({
  insertNotificationWithRender: vi.fn(
    async (input: { templateCode: string; recipientEmail?: string; variables: unknown }) => {
      mockState.insertCalls.push({
        templateCode: input.templateCode,
        recipientEmail: input.recipientEmail,
        variables: input.variables,
      });
      return mockState.insertResult;
    },
  ),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const bag = (() => {
        switch (table) {
          case 'exercise_requests':
            return mockState.exercise;
          case 'awards':
            return mockState.award;
          case 'plans':
            return mockState.plan;
          case 'organizations':
            return mockState.org;
          case 'beneficiaries':
            return mockState.beneficiary;
          case 'memberships':
            return null;
          default:
            return null;
        }
      })();
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: bag, error: null }),
        // Pour memberships : eq() finit par retourner array via thenable
        then: undefined as unknown,
      };
      // memberships : .select().eq().eq() → resolve() avec data array
      if (table === 'memberships') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: mockState.memberships, error: null }),
            }),
          }),
        };
      }
      return builder;
    },
    auth: {
      admin: {
        getUserById: async (userId: string) => {
          const u = mockState.authUsers.get(userId);
          if (!u) return { data: { user: null }, error: null };
          return {
            data: { user: { email: u.email, user_metadata: { full_name: u.full_name } } },
            error: null,
          };
        },
      },
    },
  }),
}));

import {
  notifyAdminsOfExerciseRequest,
  notifyBeneficiaryOfExerciseDecision,
  notifyBeneficiaryOfExercisePayment,
} from '../_helpers/exercise-notifications';

beforeEach(() => {
  mockState.exercise = {
    id: TEST_EXERCISE_ID,
    request_number: 'EXR-2026-0099',
    org_id: TEST_ORG_ID,
    units_to_exercise: 100,
    exercise_price_per_unit: 1.5,
    total_exercise_amount: 150,
    fmv_per_unit_at_request: 25,
    payment_amount_received: null,
    payment_reference: null,
    payment_received_at: null,
    completed_at: null,
    tax_simulation_snapshot: {
      regime: 'BSPCE_3Y_LESS',
      grossGainAmount: 2350,
      totalTaxAmount: 1142,
      netGainAmount: 1208,
    },
    award_id: TEST_AWARD_ID,
    beneficiary_id: TEST_BENE_ID,
  };
  mockState.award = {
    id: TEST_AWARD_ID,
    award_number: 'AWD-2026-0099',
    exercise_price: 1.5,
    plan_id: 'plan-1',
  };
  mockState.plan = { id: 'plan-1', name: 'Plan Test', plan_type: 'BSPCE' };
  mockState.org = {
    id: TEST_ORG_ID,
    name: 'Capiwise',
    bank_iban: 'FR76123',
    bank_bic: 'BNPAFRPP',
    bank_name: 'BNP',
  };
  mockState.beneficiary = {
    id: TEST_BENE_ID,
    first_name: 'Sophie',
    last_name: 'Bernard',
    email: 'sophie@test.local',
    user_id: 'user-bene-99',
  };
  mockState.memberships = [];
  mockState.authUsers = new Map();
  mockState.insertCalls = [];
  mockState.insertResult = { ok: true, notificationId: 'notif-1' };
});

describe('notifyAdminsOfExerciseRequest', () => {
  it('exercise introuvable → ok:false', async () => {
    mockState.exercise = null;
    const res = await notifyAdminsOfExerciseRequest({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(false);
  });

  it('0 ADMIN_HR/OWNER → warning, return created:0', async () => {
    mockState.memberships = [];
    const res = await notifyAdminsOfExerciseRequest({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(0);
    expect(mockState.insertCalls).toHaveLength(0);
  });

  it('2 ADMIN_HR + 1 OWNER → 3 emails envoyés (variables completes)', async () => {
    mockState.memberships = [
      { user_id: 'admin-1', roles: ['ADMIN_HR'] },
      { user_id: 'admin-2', roles: ['APPROVER', 'ADMIN_HR'] },
      { user_id: 'owner-1', roles: ['OWNER'] },
      { user_id: 'beneficiary-1', roles: ['BENEFICIARY'] }, // exclu
    ];
    mockState.authUsers.set('admin-1', { email: 'admin1@test.local', full_name: 'Marie' });
    mockState.authUsers.set('admin-2', { email: 'admin2@test.local', full_name: 'Pierre' });
    mockState.authUsers.set('owner-1', { email: 'owner@test.local', full_name: 'CEO' });

    const res = await notifyAdminsOfExerciseRequest({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(3);
    expect(mockState.insertCalls).toHaveLength(3);

    const variables = mockState.insertCalls[0]!.variables as Record<string, unknown>;
    expect(variables.requestNumber).toBe('EXR-2026-0099');
    expect(variables.beneficiaryName).toBe('Sophie Bernard');
    expect(variables.beneficiaryEmail).toBe('sophie@test.local');
    expect(variables.awardNumber).toBe('AWD-2026-0099');
    expect(variables.planType).toBe('BSPCE');
    expect(variables.units).toBe(100);
    expect(variables.totalCost).toBe(150);
    expect(variables.fmvAtRequest).toBe(25);
    expect(variables.taxRegime).toBe('BSPCE_3Y_LESS');
    expect(variables.totalTaxes).toBe(1142);
    expect(variables.netGain).toBe(1208);
    expect(mockState.insertCalls[0]!.templateCode).toBe('exercise_request_submitted');
  });

  it("dédup user_id : un user avec ADMIN_HR + OWNER ne reçoit qu'1 email", async () => {
    // Membership unique avec 2 rôles → 1 user_id, 1 email attendu
    mockState.memberships = [{ user_id: 'multi-role', roles: ['ADMIN_HR', 'OWNER'] }];
    mockState.authUsers.set('multi-role', { email: 'multi@test.local', full_name: 'Multi' });
    const res = await notifyAdminsOfExerciseRequest({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(1);
    expect(mockState.insertCalls).toHaveLength(1);
  });

  it('insert fail pour 1 recipient → continue les autres, log warning', async () => {
    mockState.memberships = [
      { user_id: 'admin-1', roles: ['ADMIN_HR'] },
      { user_id: 'admin-2', roles: ['ADMIN_HR'] },
    ];
    mockState.authUsers.set('admin-1', { email: 'a1@test.local' });
    mockState.authUsers.set('admin-2', { email: 'a2@test.local' });
    mockState.insertResult = { ok: false, error: 'render fail' };

    const res = await notifyAdminsOfExerciseRequest({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(0); // 0 success malgré 2 attempts
    expect(mockState.insertCalls).toHaveLength(2); // les 2 tentatives faites
  });
});

describe('notifyBeneficiaryOfExerciseDecision', () => {
  it('beneficiary email null → warning, return notificationId:null', async () => {
    mockState.beneficiary!.email = null;
    mockState.beneficiary!.user_id = null;

    const res = await notifyBeneficiaryOfExerciseDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      decision: 'APPROVED',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notificationId).toBeNull();
    expect(mockState.insertCalls).toHaveLength(0);
  });

  it('decision APPROVED → template exercise_request_approved + bank coords + total', async () => {
    const res = await notifyBeneficiaryOfExerciseDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      decision: 'APPROVED',
      paymentDeadlineDays: 15,
    });
    expect(res.ok).toBe(true);
    expect(mockState.insertCalls).toHaveLength(1);
    expect(mockState.insertCalls[0]!.templateCode).toBe('exercise_request_approved');
    expect(mockState.insertCalls[0]!.recipientEmail).toBe('sophie@test.local');
    const v = mockState.insertCalls[0]!.variables as Record<string, unknown>;
    expect(v.bankIban).toBe('FR76123');
    expect(v.bankBic).toBe('BNPAFRPP');
    expect(v.bankName).toBe('BNP');
    expect(v.totalCost).toBe(150);
    expect(v.strikePrice).toBe(1.5);
    expect(v.units).toBe(100);
    expect(v.paymentDeadlineDays).toBe(15);
    expect(v.orgName).toBe('Capiwise');
  });

  it('decision REJECTED → template exercise_request_rejected + reason + stepName', async () => {
    const res = await notifyBeneficiaryOfExerciseDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      decision: 'REJECTED',
      reason: 'Fenêtre fermée',
      approverName: 'Marie',
      stepName: 'Validation RH',
    });
    expect(res.ok).toBe(true);
    expect(mockState.insertCalls[0]!.templateCode).toBe('exercise_request_rejected');
    const v = mockState.insertCalls[0]!.variables as Record<string, unknown>;
    expect(v.approverName).toBe('Marie');
    expect(v.stepName).toBe('Validation RH');
    expect(v.reason).toBe('Fenêtre fermée');
  });

  it('decision CANCELLED_BY_ADMIN → template exercise_request_cancelled_by_admin', async () => {
    const res = await notifyBeneficiaryOfExerciseDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      decision: 'CANCELLED_BY_ADMIN',
      adminName: 'Jean',
      reason: 'Paiement non reçu après 30j',
    });
    expect(res.ok).toBe(true);
    expect(mockState.insertCalls[0]!.templateCode).toBe('exercise_request_cancelled_by_admin');
    const v = mockState.insertCalls[0]!.variables as Record<string, unknown>;
    expect(v.adminName).toBe('Jean');
    expect(v.reason).toBe('Paiement non reçu après 30j');
  });

  it('insert fail → return ok:false (caller decide propagation)', async () => {
    mockState.insertResult = { ok: false, error: 'render fail' };
    const res = await notifyBeneficiaryOfExerciseDecision({
      exerciseRequestId: TEST_EXERCISE_ID,
      decision: 'APPROVED',
    });
    expect(res.ok).toBe(false);
  });
});

describe('notifyBeneficiaryOfExercisePayment', () => {
  beforeEach(() => {
    mockState.exercise!.payment_amount_received = 150;
    mockState.exercise!.payment_reference = 'EXR-2026-0099';
    mockState.exercise!.completed_at = '2026-05-20T10:00:00Z';
  });

  it('OK → template exercise_payment_confirmed + variables complets', async () => {
    const res = await notifyBeneficiaryOfExercisePayment({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    expect(mockState.insertCalls).toHaveLength(1);
    expect(mockState.insertCalls[0]!.templateCode).toBe('exercise_payment_confirmed');
    const v = mockState.insertCalls[0]!.variables as Record<string, unknown>;
    expect(v.totalAmount).toBe(150);
    expect(v.paymentReference).toBe('EXR-2026-0099');
    expect(v.confirmedAt).toBe('2026-05-20T10:00:00Z');
    expect(v.units).toBe(100);
    expect(v.planType).toBe('BSPCE');
    expect(v.orgName).toBe('Capiwise');
  });

  it('email null → warning + return notificationId:null', async () => {
    mockState.beneficiary!.email = null;
    mockState.beneficiary!.user_id = null;
    const res = await notifyBeneficiaryOfExercisePayment({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notificationId).toBeNull();
    expect(mockState.insertCalls).toHaveLength(0);
  });
});
