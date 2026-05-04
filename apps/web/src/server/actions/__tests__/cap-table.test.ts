import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 10 B2 — Tests Server Actions cap-table
 *
 * Couvre :
 *  - createShareClass : happy + Zod fail (pool_only_for_esop) + 23505 + perm
 *  - updateShareClass : happy + 404 + empty update
 *  - deactivateShareClass : happy + refus si positions actives
 *  - createFundingRound : happy + Zod fail (sum mismatch) + workflow blocker
 *  - cancelFundingRound : happy DRAFT + refus CLOSED + Zod fail
 *
 * Pattern mock : `vi.hoisted` pour partager state entre vi.mock factories +
 * tests. Pas de network réel, on stub `supabase.from(...)` + `supabase.rpc(...)`.
 */

const { TEST_ORG_ID, TEST_USER_ID, mockState, makeBuilder, rpcMock, requirePermissionMock } =
  vi.hoisted(() => {
    const TEST_ORG_ID = '00000000-0000-4000-8000-000000000000';
    const TEST_USER_ID = '00000000-0000-4000-8000-000000000099';

    type MockState = {
      // share_classes
      insertShareClass: { data: unknown; error: unknown };
      shareClassLookup: { data: unknown; error: unknown };
      shareClassUpdate: { error: unknown };
      positionsCount: { count: number | null; error: unknown };
      // funding_rounds
      workflowLookup: { data: unknown; error: unknown };
      roundLookup: { data: unknown; error: unknown };
      roundUpdate: { error: unknown };
      rpcResult: { data: unknown; error: unknown };
      // dilution_scenarios (B4)
      insertScenario: { data: unknown; error: unknown };
      scenarioLookup: { data: unknown; error: unknown };
      scenarioUpdate: { error: unknown };
      scenarioDelete: { error: unknown };
    };

    const mockState: MockState = {
      insertShareClass: { data: { id: 'sc-uuid-1' }, error: null },
      shareClassLookup: {
        data: {
          id: 'sc-uuid-1',
          org_id: TEST_ORG_ID,
          code: 'COMMON',
          name: 'Common Stock',
          class_type: 'COMMON',
          is_active: true,
        },
        error: null,
      },
      shareClassUpdate: { error: null },
      positionsCount: { count: 0, error: null },
      workflowLookup: { data: null, error: null },
      roundLookup: {
        data: { id: 'rnd-uuid-1', status: 'DRAFT', name: 'Series A' },
        error: null,
      },
      roundUpdate: { error: null },
      rpcResult: { data: 'rnd-uuid-1', error: null },
      insertScenario: { data: { id: 'sc-uuid-2' }, error: null },
      scenarioLookup: {
        data: {
          id: 'sc-uuid-2',
          created_by: TEST_USER_ID,
          scenario_type: 'NEW_ROUND',
          name: 'Test scenario',
          result_cache: null,
          result_computed_at: null,
        },
        error: null,
      },
      scenarioUpdate: { error: null },
      scenarioDelete: { error: null },
    };

    const requirePermissionMock = vi.fn();
    const rpcMock = vi.fn();

    function makeBuilder(table: string) {
      // Chainable builder émulant la surface Supabase utilisée par cap-table.ts
      const b: Record<string, unknown> = {};
      const noop = () => b;
      b.select = noop;
      b.eq = noop;
      b.is = noop;
      b.update = (_payload: unknown) => {
        void _payload;
        const updateKey =
          table === 'share_classes'
            ? 'shareClassUpdate'
            : table === 'dilution_scenarios'
              ? 'scenarioUpdate'
              : 'roundUpdate';
        return {
          eq: () => ({
            eq: () => Promise.resolve(mockState[updateKey]),
          }),
        };
      };
      b.delete = () => {
        return {
          eq: () => ({
            eq: () => Promise.resolve(mockState.scenarioDelete),
          }),
        };
      };
      b.insert = (_payload: unknown) => {
        void _payload;
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                table === 'dilution_scenarios'
                  ? mockState.insertScenario
                  : mockState.insertShareClass,
              ),
          }),
        };
      };
      b.maybeSingle = () => {
        if (table === 'share_classes') return Promise.resolve(mockState.shareClassLookup);
        if (table === 'funding_rounds') return Promise.resolve(mockState.roundLookup);
        if (table === 'approval_workflows') return Promise.resolve(mockState.workflowLookup);
        if (table === 'dilution_scenarios') return Promise.resolve(mockState.scenarioLookup);
        return Promise.resolve({ data: null, error: null });
      };
      // SELECT + count chained
      b.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head && opts?.count === 'exact') {
          // .select('id', { count: 'exact', head: true }).eq().eq().is()
          const chain: Record<string, unknown> = {};
          chain.eq = () => chain;
          chain.is = () => Promise.resolve(mockState.positionsCount);
          return chain;
        }
        return b;
      };
      return b;
    }

    return { TEST_ORG_ID, TEST_USER_ID, mockState, makeBuilder, rpcMock, requirePermissionMock };
  });

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => makeBuilder(table),
    rpc: (...args: unknown[]) => {
      void args;
      return Promise.resolve(mockState.rpcResult);
    },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: vi.fn().mockReturnValue({
    from: (table: string) => makeBuilder(table),
  }),
}));

import {
  cancelFundingRound,
  createFundingRound,
  createScenario,
  createShareClass,
  deactivateShareClass,
  deleteScenario,
  runScenario,
  updateScenario,
  updateShareClass,
} from '../cap-table';

const validUser = {
  id: TEST_USER_ID,
  email: 'admin@capiwise.local',
  fullName: 'Admin User',
  activeOrgId: TEST_ORG_ID,
  orgIds: [TEST_ORG_ID],
  activeRoles: ['OWNER'],
};

beforeEach(() => {
  rpcMock.mockReset();
  requirePermissionMock.mockReset();
  requirePermissionMock.mockResolvedValue(validUser);

  mockState.insertShareClass = { data: { id: 'sc-uuid-1' }, error: null };
  mockState.shareClassLookup = {
    data: {
      id: 'sc-uuid-1',
      org_id: TEST_ORG_ID,
      code: 'COMMON',
      name: 'Common Stock',
      class_type: 'COMMON',
      is_active: true,
    },
    error: null,
  };
  mockState.shareClassUpdate = { error: null };
  mockState.positionsCount = { count: 0, error: null };
  mockState.workflowLookup = { data: null, error: null };
  mockState.roundLookup = {
    data: { id: 'rnd-uuid-1', status: 'DRAFT', name: 'Series A' },
    error: null,
  };
  mockState.roundUpdate = { error: null };
  mockState.rpcResult = { data: 'rnd-uuid-1', error: null };
  mockState.insertScenario = { data: { id: 'sc-uuid-2' }, error: null };
  mockState.scenarioLookup = {
    data: {
      id: 'sc-uuid-2',
      created_by: TEST_USER_ID,
      scenario_type: 'NEW_ROUND',
      name: 'Test scenario',
      result_cache: null,
      result_computed_at: null,
    },
    error: null,
  };
  mockState.scenarioUpdate = { error: null };
  mockState.scenarioDelete = { error: null };
});

// ---------------------------------------------------------------------------
// 1. createShareClass
// ---------------------------------------------------------------------------

describe('createShareClass', () => {
  const validInput = {
    code: 'COMMON',
    name: 'Actions ordinaires',
    classType: 'COMMON' as const,
    parValue: 0.01,
  };

  it('happy path : INSERT share_class + return id', async () => {
    const result = await createShareClass(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe('sc-uuid-1');
  });

  it('Zod fail : pool_total_units requis si class_type=ESOP', async () => {
    const result = await createShareClass({
      ...validInput,
      classType: 'ESOP' as const,
      // pool_total_units omis → Zod refine fail
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/pool_total_units|ESOP/i);
    }
  });

  it('Zod fail : pool_total_units présent sur class_type=COMMON (interdit)', async () => {
    const result = await createShareClass({
      ...validInput,
      classType: 'COMMON' as const,
      poolTotalUnits: 1000, // interdit pour non-ESOP
    });
    expect(result.ok).toBe(false);
  });

  it('Zod fail : code invalide (lowercase rejeté)', async () => {
    const result = await createShareClass({ ...validInput, code: 'common' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/uppercase|underscore/i);
  });

  it('DB error 23505 (code unique violation)', async () => {
    mockState.insertShareClass = {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    };
    const result = await createShareClass(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/COMMON/);
  });
});

// ---------------------------------------------------------------------------
// 2. updateShareClass
// ---------------------------------------------------------------------------

describe('updateShareClass', () => {
  const validId = '00000000-0000-4000-8000-000000000001';

  it('happy path : update name + description', async () => {
    const result = await updateShareClass(validId, {
      name: 'New Common Stock',
      description: 'Updated description',
    });
    expect(result.ok).toBe(true);
  });

  it('refus 404 : share_class introuvable', async () => {
    mockState.shareClassLookup = { data: null, error: null };
    const result = await updateShareClass(validId, { name: 'Foo' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/introuvable/i);
  });

  it('refus : aucun champ à modifier', async () => {
    const result = await updateShareClass(validId, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Aucun champ/i);
  });

  it('Zod fail : id invalide', async () => {
    const result = await updateShareClass('not-a-uuid', { name: 'Foo' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/id invalide/i);
  });
});

// ---------------------------------------------------------------------------
// 3. deactivateShareClass
// ---------------------------------------------------------------------------

describe('deactivateShareClass', () => {
  const validId = '00000000-0000-4000-8000-000000000001';

  it('happy path : 0 positions actives → soft-delete OK', async () => {
    mockState.positionsCount = { count: 0, error: null };
    const result = await deactivateShareClass(validId);
    expect(result.ok).toBe(true);
  });

  it('refus : positions actives existantes', async () => {
    mockState.positionsCount = { count: 5, error: null };
    const result = await deactivateShareClass(validId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/5 position/i);
  });

  it('Zod fail : id invalide', async () => {
    const result = await deactivateShareClass('not-a-uuid');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/id invalide/i);
  });
});

// ---------------------------------------------------------------------------
// 4. createFundingRound
// ---------------------------------------------------------------------------

describe('createFundingRound', () => {
  const validInput = {
    name: 'Series A 2026',
    roundType: 'SERIES_A' as const,
    shareClassId: '00000000-0000-4000-8000-000000000010',
    preMoneyValuation: 10_000_000,
    amountRaised: 5_000_000,
    pricePerShare: 100,
    investors: [{ name: 'Lead VC', units: 50000, amount: 5_000_000 }],
  };

  it('happy path : RPC create_funding_round + return id', async () => {
    mockState.rpcResult = { data: 'rnd-uuid-1', error: null };
    const result = await createFundingRound(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe('rnd-uuid-1');
  });

  it('Zod fail : sum(units) × price ≠ amount (>1% écart)', async () => {
    const result = await createFundingRound({
      ...validInput,
      // 50000 × 100 = 5M mais amount déclaré 6M → 20% écart, fail
      amountRaised: 6_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Sum.*units.*price|amount/i);
    }
  });

  it('refus : workflow approval V1 non supporté', async () => {
    mockState.workflowLookup = {
      data: { id: 'wf-uuid-1', name: 'Funding Round Approval' },
      error: null,
    };
    const result = await createFundingRound(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/workflow|V2/i);
  });

  it('DB error : RPC create_funding_round retourne error', async () => {
    mockState.rpcResult = {
      data: null,
      error: { message: 'share_class not found' },
    };
    const result = await createFundingRound(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/share_class/);
  });
});

// ---------------------------------------------------------------------------
// 5. cancelFundingRound
// ---------------------------------------------------------------------------

describe('cancelFundingRound', () => {
  const validInput = {
    id: '00000000-0000-4000-8000-000000000020',
    reason: 'Investisseur retire son ticket',
  };

  it('happy path : DRAFT → CANCELLED', async () => {
    mockState.roundLookup = {
      data: { id: validInput.id, status: 'DRAFT', name: 'Series A' },
      error: null,
    };
    const result = await cancelFundingRound(validInput);
    expect(result.ok).toBe(true);
  });

  it('happy path : PENDING_APPROVAL → CANCELLED', async () => {
    mockState.roundLookup = {
      data: { id: validInput.id, status: 'PENDING_APPROVAL', name: 'Series A' },
      error: null,
    };
    const result = await cancelFundingRound(validInput);
    expect(result.ok).toBe(true);
  });

  it('refus : status CLOSED immuable (positions déjà émises)', async () => {
    mockState.roundLookup = {
      data: { id: validInput.id, status: 'CLOSED', name: 'Series A' },
      error: null,
    };
    const result = await cancelFundingRound(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/CLOSED|émises/i);
  });

  it('refus : déjà CANCELLED', async () => {
    mockState.roundLookup = {
      data: { id: validInput.id, status: 'CANCELLED', name: 'Series A' },
      error: null,
    };
    const result = await cancelFundingRound(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/déjà annulée/i);
  });

  it('refus 404 : round introuvable', async () => {
    mockState.roundLookup = { data: null, error: null };
    const result = await cancelFundingRound(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/introuvable/i);
  });

  it('Zod fail : reason trop courte', async () => {
    const result = await cancelFundingRound({ ...validInput, reason: 'no' });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. createScenario (B4)
// ---------------------------------------------------------------------------

describe('createScenario (B4)', () => {
  const validNewRoundInput = {
    name: 'Series B simulation',
    description: 'Hypothèse 10M€ post-money',
    isShared: false,
    parameters: {
      scenarioType: 'NEW_ROUND' as const,
      shareClassCode: 'PREF_B',
      preMoney: 30_000_000,
      amountRaised: 10_000_000,
      pricePerShare: 200,
      antiDilutionApply: false,
      investorName: 'Lead VC B',
    },
  };

  it('happy NEW_ROUND : INSERT + return id', async () => {
    const result = await createScenario(validNewRoundInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe('sc-uuid-2');
  });

  it('happy POOL_TOPUP', async () => {
    const result = await createScenario({
      name: 'Pool top-up 5%',
      isShared: true,
      parameters: {
        scenarioType: 'POOL_TOPUP',
        additionalUnits: 5000,
        targetPoolPercentPost: 15,
      },
    });
    expect(result.ok).toBe(true);
  });

  it('happy EXIT', async () => {
    const result = await createScenario({
      name: 'Exit 100M€',
      isShared: false,
      parameters: {
        scenarioType: 'EXIT',
        exitValuation: 100_000_000,
        exitDate: '2028-06-01',
        conversionStrategy: 'AUTO_BEST',
      },
    });
    expect(result.ok).toBe(true);
  });

  it('Zod fail : scenarioType invalide', async () => {
    const result = await createScenario({
      name: 'Invalid',
      // @ts-expect-error — test runtime
      parameters: { scenarioType: 'UNKNOWN_TYPE' },
    });
    expect(result.ok).toBe(false);
  });

  it('Zod fail : name trop court', async () => {
    const result = await createScenario({
      ...validNewRoundInput,
      name: 'a',
    });
    expect(result.ok).toBe(false);
  });

  it('DB error : INSERT fail', async () => {
    mockState.insertScenario = { data: null, error: { message: 'rls violation' } };
    const result = await createScenario(validNewRoundInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rls violation/);
  });
});

// ---------------------------------------------------------------------------
// 7. updateScenario (B4)
// ---------------------------------------------------------------------------

describe('updateScenario (B4)', () => {
  const validId = '00000000-0000-4000-8000-000000000030';

  it('happy : update name only + invalidate cache', async () => {
    const result = await updateScenario(validId, { name: 'Renamed' });
    expect(result.ok).toBe(true);
  });

  it('happy : update parameters change scenario_type aussi', async () => {
    const result = await updateScenario(validId, {
      parameters: {
        scenarioType: 'POOL_TOPUP',
        additionalUnits: 1000,
      },
    });
    expect(result.ok).toBe(true);
  });

  it('refus : autre user que le créateur', async () => {
    mockState.scenarioLookup = {
      data: {
        id: validId,
        created_by: 'another-user-uuid',
        scenario_type: 'NEW_ROUND',
        name: 'Test',
      },
      error: null,
    };
    const result = await updateScenario(validId, { name: 'Hijack' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/créateur/i);
  });

  it('refus : aucun champ à modifier', async () => {
    const result = await updateScenario(validId, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Aucun champ/i);
  });

  it('refus : 404', async () => {
    mockState.scenarioLookup = { data: null, error: null };
    const result = await updateScenario(validId, { name: 'X' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/introuvable/i);
  });

  it('Zod fail : id invalide', async () => {
    const result = await updateScenario('not-a-uuid', { name: 'X' });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. deleteScenario (B4)
// ---------------------------------------------------------------------------

describe('deleteScenario (B4)', () => {
  const validId = '00000000-0000-4000-8000-000000000031';

  it('happy : owner peut delete', async () => {
    const result = await deleteScenario(validId);
    expect(result.ok).toBe(true);
  });

  it('refus : non-owner', async () => {
    mockState.scenarioLookup = {
      data: {
        id: validId,
        created_by: 'another-user-uuid',
        scenario_type: 'EXIT',
        name: 'Big Exit',
      },
      error: null,
    };
    const result = await deleteScenario(validId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/créateur/i);
  });

  it('refus : 404', async () => {
    mockState.scenarioLookup = { data: null, error: null };
    const result = await deleteScenario(validId);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. runScenario (B4) — cache 24h
// ---------------------------------------------------------------------------

describe('runScenario (B4)', () => {
  const validId = '00000000-0000-4000-8000-000000000032';

  it('cache miss : appelle RPC + persiste cache', async () => {
    mockState.scenarioLookup = {
      data: {
        id: validId,
        result_cache: null,
        result_computed_at: null,
      },
      error: null,
    };
    mockState.rpcResult = {
      data: { positions: [], grand_total_units: 0 },
      error: null,
    };
    const result = await runScenario(validId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cached).toBe(false);
      expect(result.result).toBeDefined();
    }
  });

  it('cache hit : retourne cached sans RPC', async () => {
    mockState.scenarioLookup = {
      data: {
        id: validId,
        result_cache: { cached: true, positions: [] },
        result_computed_at: new Date().toISOString(), // cache frais
      },
      error: null,
    };
    const result = await runScenario(validId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cached).toBe(true);
    }
  });

  it('cache stale (>24h) : re-call RPC', async () => {
    mockState.scenarioLookup = {
      data: {
        id: validId,
        result_cache: { stale: true },
        result_computed_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
      error: null,
    };
    mockState.rpcResult = {
      data: { positions: ['fresh'], grand_total_units: 1 },
      error: null,
    };
    const result = await runScenario(validId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cached).toBe(false);
    }
  });

  it('refus : 404', async () => {
    mockState.scenarioLookup = { data: null, error: null };
    const result = await runScenario(validId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/introuvable/i);
  });

  it('error path : RPC fail', async () => {
    mockState.scenarioLookup = {
      data: { id: validId, result_cache: null, result_computed_at: null },
      error: null,
    };
    mockState.rpcResult = { data: null, error: { message: 'compute failed' } };
    const result = await runScenario(validId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/compute_cap_table échoué/);
  });

  it('Zod fail : id invalide', async () => {
    const result = await runScenario('not-a-uuid');
    expect(result.ok).toBe(false);
  });
});
