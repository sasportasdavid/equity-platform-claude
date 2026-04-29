import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Actions awards — 4 cas critiques avec mock Supabase.
 *
 * Le reste sera testé E2E en B3+ via UI (Playwright à venir).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock revalidatePath (no-op)
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock requirePermission → user fixe
vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    id: 'user-uuid',
    email: 'test@example.com',
    fullName: 'Test User',
    activeOrgId: 'org-uuid',
    orgIds: ['org-uuid'],
    activeRoles: ['OWNER'],
  }),
  hasPermission: vi.fn().mockResolvedValue(true),
}));

// Mock audit logger (no-op)
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock runComplianceChecks (B7) — par défaut "no issues" pour ne pas
// casser les tests existants. Les tests dédiés compliance sont dans
// src/lib/compliance/__tests__/runChecks.test.ts.
vi.mock('@/lib/compliance/runChecks', () => ({
  runComplianceChecks: vi
    .fn()
    .mockResolvedValue({ errors: [], warnings: [], hasHardBlocks: false }),
}));

// Mock Supabase server client — chainable builder qui renvoie ce qu'on veut
type MockBuilder = {
  data?: unknown;
  error?: unknown;
};

const mockState = {
  awardSelect: { data: null as unknown, error: null as unknown },
  rpcResult: { data: null as unknown, error: null as unknown },
  updateError: null as unknown,
};

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const noop = () => builder;
  builder.select = noop;
  builder.eq = noop;
  builder.maybeSingle = () =>
    Promise.resolve({ data: mockState.awardSelect.data, error: mockState.awardSelect.error });
  builder.insert = noop;
  builder.single = () => Promise.resolve({ data: { id: 'modif-uuid' }, error: null });
  builder.update = () => ({
    eq: () => Promise.resolve({ error: mockState.updateError }),
  });
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: () => makeBuilder(),
    rpc: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ data: mockState.rpcResult.data, error: mockState.rpcResult.error }),
      ),
  }),
}));

// ---------------------------------------------------------------------------
// Imports dynamiques APRÈS les mocks
// ---------------------------------------------------------------------------

const validAward = {
  planId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
  beneficiaryId: '304e1f3b-2017-4719-b098-6554ed10fb36',
  unitsGranted: 100,
  grantDate: '2026-04-28',
  initialStatus: 'DRAFT' as const,
};

beforeEach(() => {
  mockState.awardSelect = { data: null, error: null };
  mockState.rpcResult = { data: null, error: null };
  mockState.updateError = null;
});

describe('Server Actions awards', () => {
  // -------------------------------------------------------------------------
  // 1. createAwardDraft happy path
  // -------------------------------------------------------------------------
  it('createAwardDraft : happy path → ok=true avec id + awardNumber', async () => {
    mockState.rpcResult = { data: 'new-award-uuid', error: null };
    mockState.awardSelect = { data: { award_number: 'AWD-2026-0042' }, error: null };

    const { createAwardDraft } = await import('../awards');
    const res = await createAwardDraft(validAward);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.id).toBe('new-award-uuid');
      expect(res.awardNumber).toBe('AWD-2026-0042');
    }
  });

  it('createAwardDraft : input invalide → ok=false avec validationIssues', async () => {
    const { createAwardDraft } = await import('../awards');
    const res = await createAwardDraft({ planId: 'not-a-uuid' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.validationIssues).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // 2. transitionAward invalide → throw
  // -------------------------------------------------------------------------
  it('transitionAward : transition interdite (DRAFT → GRANTED) → ok=false', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
      },
      error: null,
    };

    const { transitionAward } = await import('../awards');
    const res = await transitionAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      toStatus: 'GRANTED',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/interdite/i);
      expect(res.error).toContain('DRAFT');
      expect(res.error).toContain('GRANTED');
    }
  });

  it('transitionAward : transition valide (DRAFT → PROPOSED) → ok=true', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
      },
      error: null,
    };

    const { transitionAward } = await import('../awards');
    const res = await transitionAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      toStatus: 'PROPOSED',
    });

    expect(res.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. cancelAward sur GRANTED → throw isCancellable
  // -------------------------------------------------------------------------
  it('cancelAward : award déjà GRANTED → ok=false (post-GRANTED non cancellable)', async () => {
    mockState.awardSelect = { data: { status: 'GRANTED' }, error: null };

    const { cancelAward } = await import('../awards');
    const res = await cancelAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      reason: 'Test cancel',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/non cancellable/i);
    }
  });

  it('cancelAward : award en DRAFT → ok=true via transitionAward → CANCELLED', async () => {
    // Le mock retourne le status DRAFT au premier select (cancelAward) ET
    // au deuxième select (transitionAward). On garde le même mock.
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
      },
      error: null,
    };

    const { cancelAward } = await import('../awards');
    const res = await cancelAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      reason: 'Test cancel DRAFT',
    });

    expect(res.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. forfeitAward calcule units_forfeited (= granted - vested)
  // -------------------------------------------------------------------------
  it('forfeitAward : units_forfeited = units_granted - units_vested (audit metadata)', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'GRANTED',
        units_granted: 1000,
        units_vested: 250,
        plan_id: 'p-uuid',
      },
      error: null,
    };

    const { forfeitAward } = await import('../awards');
    const { logAuditEvent } = await import('@/lib/audit');

    const res = await forfeitAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      leaverType: 'resignation',
      eventDate: '2026-04-28',
      reason: 'Test',
    });

    expect(res.ok).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'award.forfeited',
        metadata: expect.objectContaining({
          units_forfeited: 750, // 1000 - 250
          units_granted: 1000,
          units_vested: 250,
          leaver_type: 'resignation',
        }),
      }),
    );
  });

  it('forfeitAward : transition interdite (DRAFT → FORFEITED) → ok=false', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        units_granted: 100,
        units_vested: 0,
        plan_id: 'p-uuid',
      },
      error: null,
    };

    const { forfeitAward } = await import('../awards');
    const res = await forfeitAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      leaverType: 'resignation',
      eventDate: '2026-04-28',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/non forfeitable/i);
    }
  });

  // -------------------------------------------------------------------------
  // 5. createAwardModification — IFRS 2.27-28 (B6)
  // -------------------------------------------------------------------------
  it('createAwardModification REPRICING : ok=true avec modificationId + valuationRunId', async () => {
    mockState.rpcResult = {
      data: { modification_id: 'modif-uuid', valuation_run_id: 'valrun-uuid' },
      error: null,
    };

    const { createAwardModification } = await import('../awards');
    const res = await createAwardModification({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      type: 'REPRICING',
      changes: { exercisePrice: 2.0 },
      reason: 'Test repricing',
      effectiveDate: '2026-04-28',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.modificationId).toBe('modif-uuid');
      expect(res.valuationRunId).toBe('valrun-uuid');
    }
  });

  it('createAwardModification CANCELLATION : valuationRunId=null (pas de re-valuation)', async () => {
    mockState.rpcResult = {
      data: { modification_id: 'modif-uuid', valuation_run_id: null },
      error: null,
    };

    const { createAwardModification } = await import('../awards');
    const res = await createAwardModification({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      type: 'CANCELLATION',
      changes: { confirmIrreversible: true },
      reason: 'Test cancellation post-grant — board approved on 2026-05-01',
      effectiveDate: '2026-04-28',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.modificationId).toBe('modif-uuid');
      expect(res.valuationRunId).toBeNull();
    }
  });

  it('createAwardModification CANCELLATION : reason < 20 chars → validation fail', async () => {
    const { createAwardModification } = await import('../awards');
    const res = await createAwardModification({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      type: 'CANCELLATION',
      changes: { confirmIrreversible: true },
      reason: 'Short',
      effectiveDate: '2026-04-28',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.validationIssues).toBeGreaterThan(0);
    }
  });

  it('createAwardModification CANCELLATION : confirmIrreversible=false → validation fail', async () => {
    const { createAwardModification } = await import('../awards');
    const res = await createAwardModification({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      type: 'CANCELLATION',
      changes: { confirmIrreversible: false },
      reason: 'Test cancellation post-grant — board approved on 2026-05-01',
    });

    expect(res.ok).toBe(false);
  });

  it('createAwardModification ADDITIONAL_GRANT : RPC échec pool insuffisant → ok=false', async () => {
    mockState.rpcResult = {
      data: null,
      error: { message: 'ADDITIONAL_GRANT : pool insuffisant (restant=50 < demandé=1000)' },
    };

    const { createAwardModification } = await import('../awards');
    const res = await createAwardModification({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      type: 'ADDITIONAL_GRANT',
      changes: { unitsAdded: 1000 },
      reason: 'Test pool exceeded',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/pool insuffisant/i);
    }
  });

  it('createAwardModification REPRICING : changes payload invalide (exercisePrice negative) → validation fail', async () => {
    const { createAwardModification } = await import('../awards');
    const res = await createAwardModification({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      type: 'REPRICING',
      changes: { exercisePrice: -5 },
      reason: 'Test invalid',
    });

    expect(res.ok).toBe(false);
  });
});
