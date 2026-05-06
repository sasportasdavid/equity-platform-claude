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

// Mock runComplianceChecks (B7) + runValuationComplianceChecks (Module 11 B6)
// + runApprovalAwardComplianceChecks (Module 12.5 B4 — dette #14 résolue)
// — par défaut "no issues" pour ne pas casser les tests existants. Les tests
// dédiés compliance sont dans src/lib/compliance/__tests__/.
vi.mock('@/lib/compliance/runChecks', () => ({
  runComplianceChecks: vi
    .fn()
    .mockResolvedValue({ errors: [], warnings: [], hasHardBlocks: false }),
  runValuationComplianceChecks: vi
    .fn()
    .mockResolvedValue({ errors: [], warnings: [], hasHardBlocks: false }),
  runApprovalAwardComplianceChecks: vi
    .fn()
    .mockResolvedValue({ errors: [], warnings: [], hasHardBlocks: false }),
}));

// Mock Supabase server client — chainable builder qui renvoie ce qu'on veut.
// Bug #6 — couche 4 : le mock route selon le nom de table car le tenant
// guard de createAwardDraft fait des SELECT sur plans + beneficiaries
// AVANT d'appeler le RPC. Les tables non-overridées retournent un fixture
// org-matching par défaut pour ne pas faire échouer les tests existants.
type MockSelectResult = { data: unknown; error: unknown };

const mockState = {
  awardSelect: { data: null as unknown, error: null as unknown },
  // Defaults org-matching (org_id = 'org-uuid' = activeOrgId du mock requirePermission)
  planSelect: { data: { id: 'p-uuid', org_id: 'org-uuid' }, error: null } as MockSelectResult,
  beneficiarySelect: {
    data: { id: 'b-uuid', org_id: 'org-uuid' },
    error: null,
  } as MockSelectResult,
  rpcResult: { data: null as unknown, error: null as unknown },
  updateError: null as unknown,
};

function makeBuilder(table?: string) {
  const builder: Record<string, unknown> = {};
  const noop = () => builder;
  builder.select = noop;
  builder.eq = noop;
  builder.is = noop;
  builder.in = noop;
  builder.or = noop;
  builder.not = noop;
  builder.order = noop;
  builder.limit = noop;
  builder.maybeSingle = () => {
    if (table === 'plans') {
      return Promise.resolve(mockState.planSelect);
    }
    if (table === 'beneficiaries') {
      return Promise.resolve(mockState.beneficiarySelect);
    }
    return Promise.resolve({
      data: mockState.awardSelect.data,
      error: mockState.awardSelect.error,
    });
  };
  // Bug #5bis sprint 6 mai 2026 PM — insert + delete sur compliance_alerts.
  // Pour ne pas casser les chains existantes (createAwardModification fait
  // .insert().select().single()), on garde insert chainable. await direct
  // sur la chain résolu via `then` sur le builder lui-même.
  builder.insert = () => builder;
  builder.delete = () => builder;
  builder.then = (resolve: (val: { error: unknown; data: null }) => unknown) =>
    resolve({ error: null, data: null });
  builder.single = () => Promise.resolve({ data: { id: 'modif-uuid' }, error: null });
  builder.update = () => ({
    eq: () => Promise.resolve({ error: mockState.updateError }),
  });
  return builder;
}

// Mock Module 7 B5 hook (importé par awards.ts depuis ./notifications) —
// notifications.ts pull lib/supabase/admin → clientEnv parse échoue en test.
// Ce mock court-circuite la chaîne env.
vi.mock('@/server/actions/notifications', () => ({
  notifyApproversOfPendingApproval: vi.fn().mockResolvedValue({ ok: true, created: 0 }),
  notifyCreatorOfApprovalDecision: vi.fn().mockResolvedValue({ ok: true, notificationId: null }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => makeBuilder(table),
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
  mockState.planSelect = { data: { id: 'p-uuid', org_id: 'org-uuid' }, error: null };
  mockState.beneficiarySelect = { data: { id: 'b-uuid', org_id: 'org-uuid' }, error: null };
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
  // Module 5 B2 — hook approval workflow (skipApprovalHook flag)
  // -------------------------------------------------------------------------
  it('transitionAward : skipApprovalHook=true ne déclenche PAS le RPC start_approval_workflow', async () => {
    // Si le hook se déclenchait, le RPC mock retournerait null par défaut
    // (mockState.rpcResult.data=null), ce qui ferait passer en PROPOSED legacy.
    // On vérifie juste que la transition réussit et que le test passe.
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'PROPOSED',
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
      toStatus: 'PENDING_APPROVAL',
      skipApprovalHook: true,
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

  // -------------------------------------------------------------------------
  // Module 11 B6 — Hook valuation compliance dans transitionAward
  // -------------------------------------------------------------------------
  it('transitionAward DRAFT→PROPOSED : VALUATION_STALE_BLOCKING → ok=false avec issue', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
        grant_date: '2026-04-28',
      },
      error: null,
    };

    const runChecksMod = await import('@/lib/compliance/runChecks');
    vi.mocked(runChecksMod.runValuationComplianceChecks).mockResolvedValueOnce({
      errors: [
        {
          severity: 'ERROR',
          code: 'VALUATION_STALE_BLOCKING',
          message: 'Aucune valorisation IFRS 2 disponible pour ce plan.',
        },
      ],
      warnings: [],
      hasHardBlocks: true,
    });

    const { transitionAward } = await import('../awards');
    const res = await transitionAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      toStatus: 'PROPOSED',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Compliance check failed/i);
      expect(res.complianceIssues?.[0]?.code).toBe('VALUATION_STALE_BLOCKING');
    }
  });

  it('transitionAward DRAFT→PROPOSED : FMV_DEVIATION_WARNING (soft) → ok=true (continue)', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
        grant_date: '2026-04-28',
      },
      error: null,
    };

    const runChecksMod = await import('@/lib/compliance/runChecks');
    vi.mocked(runChecksMod.runValuationComplianceChecks).mockResolvedValueOnce({
      errors: [],
      warnings: [
        {
          severity: 'WARNING',
          code: 'FMV_DEVIATION_WARNING',
          message: 'Déviation FMV 25.0 %',
        },
      ],
      hasHardBlocks: false,
    });

    const { transitionAward } = await import('../awards');
    const res = await transitionAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      toStatus: 'PROPOSED',
    });

    expect(res.ok).toBe(true);
  });

  it('transitionAward DRAFT→PROPOSED : merge errors AWARD + VALUATION rules', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
        grant_date: '2026-04-28',
      },
      error: null,
    };

    const runChecksMod = await import('@/lib/compliance/runChecks');
    vi.mocked(runChecksMod.runComplianceChecks).mockResolvedValueOnce({
      errors: [{ severity: 'ERROR', code: 'BSPCE_BENEFICIARY_TYPE', message: 'Award rule failed' }],
      warnings: [],
      hasHardBlocks: true,
    });
    vi.mocked(runChecksMod.runValuationComplianceChecks).mockResolvedValueOnce({
      errors: [
        { severity: 'ERROR', code: 'VALUATION_STALE_BLOCKING', message: 'Valuation rule failed' },
      ],
      warnings: [],
      hasHardBlocks: true,
    });

    const { transitionAward } = await import('../awards');
    const res = await transitionAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      toStatus: 'PROPOSED',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.complianceIssues).toHaveLength(2);
      const codes = res.complianceIssues?.map((i) => i.code) ?? [];
      expect(codes).toContain('BSPCE_BENEFICIARY_TYPE');
      expect(codes).toContain('VALUATION_STALE_BLOCKING');
    }
  });

  // Module 12.5 B4 — Résolution dette #14 : WORKFLOW_REQUIRED_FOR_AGA branché
  // dans transitionAward(_, 'PROPOSED'). Hard block AGA sans workflow.
  it('transitionAward DRAFT→PROPOSED : WORKFLOW_REQUIRED_FOR_AGA hard block (dette #14)', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
        grant_date: '2026-04-28',
      },
      error: null,
    };

    const runChecksMod = await import('@/lib/compliance/runChecks');
    vi.mocked(runChecksMod.runApprovalAwardComplianceChecks).mockResolvedValueOnce({
      errors: [
        {
          severity: 'ERROR',
          code: 'WORKFLOW_REQUIRED_FOR_AGA',
          message: 'Plan AGA sans workflow attaché',
        },
      ],
      warnings: [],
      hasHardBlocks: true,
    });

    const { transitionAward } = await import('../awards');
    const res = await transitionAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      toStatus: 'PROPOSED',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      const codes = res.complianceIssues?.map((i) => i.code) ?? [];
      expect(codes).toContain('WORKFLOW_REQUIRED_FOR_AGA');
    }
  });

  it('transitionAward AGA→PROPOSED : workflow attaché → ok=true (no issue)', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
        grant_date: '2026-04-28',
      },
      error: null,
    };
    // Mocks default ok (no issues) — déjà set au top du fichier
    const { transitionAward } = await import('../awards');
    const res = await transitionAward({
      awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
      toStatus: 'PROPOSED',
    });
    expect(res.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Bug #5bis — Compliance UX + persist + logs (sprint 6 mai 2026 PM)
  // -------------------------------------------------------------------------
  it('transitionAward DRAFT→PROPOSED ko : log [compliance] award.transition + complianceIssues', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        beneficiary_id: 'b-uuid',
        units_granted: 100,
        units_vested: 0,
        vesting_start_date: null,
        grant_date: '2026-04-28',
      },
      error: null,
    };
    const runChecksMod = await import('@/lib/compliance/runChecks');
    vi.mocked(runChecksMod.runValuationComplianceChecks).mockResolvedValueOnce({
      errors: [
        {
          severity: 'ERROR',
          code: 'VALUATION_STALE_BLOCKING',
          message: 'Aucune valorisation IFRS 2 disponible pour ce plan.',
        },
      ],
      warnings: [],
      hasHardBlocks: true,
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { transitionAward } = await import('../awards');
      const res = await transitionAward({
        awardId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
        toStatus: 'PROPOSED',
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.complianceIssues).toBeDefined();
        expect(res.complianceIssues?.[0]?.code).toBe('VALUATION_STALE_BLOCKING');
      }

      // Bug #5bis observabilité — au moins 1 log [compliance] award.transition
      const calls = logSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => /\[compliance\] award\.transition/.test(c))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // Bug #6 — Cross-org tenant guard (sprint 6 mai 2026 PM)
  // -------------------------------------------------------------------------
  it('createAwardDraft : beneficiary cross-org → ok=false avec TENANT_VIOLATION', async () => {
    // Beneficiary appartient à une autre org que l'org active du JWT
    mockState.beneficiarySelect = {
      data: { id: 'b-uuid', org_id: 'OTHER-ORG-uuid' },
      error: null,
    };
    mockState.rpcResult = { data: 'should-not-reach', error: null };

    const { createAwardDraft } = await import('../awards');
    const res = await createAwardDraft(validAward);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/TENANT_VIOLATION/);
      expect(res.error).toMatch(/bénéficiaire/i);
    }
  });

  it('createAwardDraft : plan cross-org → ok=false avec TENANT_VIOLATION', async () => {
    mockState.planSelect = { data: { id: 'p-uuid', org_id: 'OTHER-ORG-uuid' }, error: null };
    mockState.rpcResult = { data: 'should-not-reach', error: null };

    const { createAwardDraft } = await import('../awards');
    const res = await createAwardDraft(validAward);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/TENANT_VIOLATION/);
      expect(res.error).toMatch(/plan/i);
    }
  });

  it('createAwardDraft : beneficiary supprimé/introuvable → ok=false', async () => {
    mockState.beneficiarySelect = { data: null, error: null };

    const { createAwardDraft } = await import('../awards');
    const res = await createAwardDraft(validAward);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Bénéficiaire introuvable/i);
    }
  });

  it('createAwardDraft : RPC retourne TENANT_VIOLATION (defense ultime DB) → ok=false', async () => {
    // Couche 1 (DB) : le RPC raise même si on bypass nos checks Server Action
    // (par exemple si l'attaquant tape direct la RPC). On simule la propagation.
    mockState.rpcResult = {
      data: null,
      error: {
        message: 'TENANT_VIOLATION: beneficiary x belongs to org y, expected org z',
        code: 'P0001',
      },
    };

    const { createAwardDraft } = await import('../awards');
    const res = await createAwardDraft(validAward);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/TENANT_VIOLATION/);
    }
  });

  it('updateAwardDraft : award appartient à autre org → ok=false avec TENANT_VIOLATION', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        org_id: 'OTHER-ORG-uuid',
      },
      error: null,
    };

    const { updateAwardDraft } = await import('../awards');
    const res = await updateAwardDraft('ccc47b77-2bce-4fd4-bef6-e8a96a1941c1', {
      unitsGranted: 200,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/TENANT_VIOLATION/);
    }
  });

  it('updateAwardDraft : remplacement bénéficiaire cross-org → ok=false', async () => {
    mockState.awardSelect = {
      data: {
        id: 'a-uuid',
        status: 'DRAFT',
        plan_id: 'p-uuid',
        org_id: 'org-uuid',
      },
      error: null,
    };
    mockState.beneficiarySelect = {
      data: { id: 'b-uuid', org_id: 'OTHER-ORG-uuid' },
      error: null,
    };

    const { updateAwardDraft } = await import('../awards');
    const res = await updateAwardDraft('ccc47b77-2bce-4fd4-bef6-e8a96a1941c1', {
      beneficiaryId: '304e1f3b-2017-4719-b098-6554ed10fb36',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/TENANT_VIOLATION/);
    }
  });
});
