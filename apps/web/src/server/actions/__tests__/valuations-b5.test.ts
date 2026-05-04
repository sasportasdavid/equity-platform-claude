import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 11 B5 — Tests Server Actions :
 *   - requestValuationRun (10 cases)
 *   - listValuationRuns   (4 cases)
 *   - getValuationRunById (3 cases)
 *
 * Pattern : `vi.hoisted` partage le state mutable entre les `vi.mock`
 * factories. Chaque test branche `mockState.*` puis appelle la SA.
 */

const { mockState, requirePermissionMock, invokeMock } = vi.hoisted(() => {
  const mockState: {
    requirePermissionThrows: boolean;
    activeOrgId: string | null;
    lastHypo: { data: unknown; error: unknown };
    simConfig: { data: unknown; error: unknown };
    insertReturn: { data: unknown; error: unknown };
    listReturn: { data: unknown; error: unknown; count: number | null };
    profilesReturn: { data: unknown; error: unknown };
    runDetailReturn: { data: unknown; error: unknown };
    resultRowReturn: { data: unknown; error: unknown };
    profileEmailReturn: { data: unknown; error: unknown };
    invokeError: unknown;
    insertedRow: Record<string, unknown> | null;
    capturedFilters: Record<string, unknown>;
  } = {
    requirePermissionThrows: false,
    activeOrgId: 'org-uuid-1',
    lastHypo: { data: { id: 'hypo-uuid-1' }, error: null },
    simConfig: { data: { id: 'sim-uuid-1' }, error: null },
    insertReturn: { data: { id: 'run-uuid-1' }, error: null },
    listReturn: { data: [], error: null, count: 0 },
    profilesReturn: { data: [], error: null },
    runDetailReturn: { data: null, error: null },
    resultRowReturn: { data: null, error: null },
    profileEmailReturn: { data: null, error: null },
    invokeError: null,
    insertedRow: null,
    capturedFilters: {},
  };

  const requirePermissionMock = vi.fn().mockResolvedValue({
    id: 'user-uuid-1',
    email: 'admin@example.com',
    fullName: 'Admin',
    activeOrgId: 'org-uuid-1',
    orgIds: ['org-uuid-1'],
    activeRoles: ['OWNER'],
  });

  const invokeMock = vi.fn();

  return { mockState, requirePermissionMock, invokeMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => {
  function makeBuilder(table: string) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, val: unknown) => {
      mockState.capturedFilters[col] = val;
      return b;
    };
    b.in = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.range = () => b;
    b.maybeSingle = () => {
      if (table === 'hypothesis_sets') return Promise.resolve(mockState.lastHypo);
      if (table === 'simulation_configs') return Promise.resolve(mockState.simConfig);
      if (table === 'valuation_runs') {
        // requestValuationRun's INSERT.select.single OR getValuationRunById's maybeSingle
        return Promise.resolve(mockState.runDetailReturn);
      }
      if (table === 'valuation_results') return Promise.resolve(mockState.resultRowReturn);
      if (table === 'user_profiles') return Promise.resolve(mockState.profileEmailReturn);
      return Promise.resolve({ data: null, error: null });
    };
    b.single = () => Promise.resolve(mockState.insertReturn);
    b.insert = (row: Record<string, unknown>) => {
      mockState.insertedRow = row;
      return {
        select: () => ({
          single: () => Promise.resolve(mockState.insertReturn),
        }),
      };
    };
    b.update = () => ({
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    });
    // Make builder thenable for `await query` in listValuationRuns
    b.then = (resolve: (v: unknown) => unknown) => {
      if (table === 'valuation_runs') {
        return Promise.resolve(mockState.listReturn).then(resolve);
      }
      if (table === 'user_profiles') {
        return Promise.resolve(mockState.profilesReturn).then(resolve);
      }
      return Promise.resolve({ data: null, error: null, count: 0 }).then(resolve);
    };
    return b;
  }

  return {
    createSupabaseServerClient: vi.fn().mockResolvedValue({
      from: (table: string) => makeBuilder(table),
      functions: { invoke: invokeMock },
    }),
  };
});

import { getValuationRunById, listValuationRuns, requestValuationRun } from '../valuations';

const VALID_PLAN_ID = '11111111-1111-4111-8111-111111111111';
const VALID_RUN_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  requirePermissionMock.mockClear();
  requirePermissionMock.mockResolvedValue({
    id: 'user-uuid-1',
    email: 'admin@example.com',
    fullName: 'Admin',
    activeOrgId: 'org-uuid-1',
    orgIds: ['org-uuid-1'],
    activeRoles: ['OWNER'],
  });
  invokeMock.mockClear();
  invokeMock.mockResolvedValue({ data: null, error: null });

  mockState.lastHypo = { data: { id: 'hypo-uuid-1' }, error: null };
  mockState.simConfig = { data: { id: 'sim-uuid-1' }, error: null };
  mockState.insertReturn = { data: { id: 'run-uuid-1' }, error: null };
  mockState.listReturn = { data: [], error: null, count: 0 };
  mockState.profilesReturn = { data: [], error: null };
  mockState.runDetailReturn = { data: null, error: null };
  mockState.resultRowReturn = { data: null, error: null };
  mockState.profileEmailReturn = { data: null, error: null };
  mockState.invokeError = null;
  mockState.insertedRow = null;
  mockState.capturedFilters = {};
});

// =============================================================================
// requestValuationRun — 10 tests
// =============================================================================

describe('requestValuationRun', () => {
  it('happy path: insert QUEUED + invoke EF + retourne runId + flag viz', async () => {
    const res = await requestValuationRun({ planId: VALID_PLAN_ID, includeVisualization: true });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.runId).toBe('run-uuid-1');
      expect(res.includesVisualization).toBe(true);
    }
    expect(invokeMock).toHaveBeenCalledWith('compute-valuation', {
      body: { run_id: 'run-uuid-1' },
    });
  });

  it("persiste includes_visualization=true et run_type=MANUAL dans l'INSERT", async () => {
    await requestValuationRun({ planId: VALID_PLAN_ID, includeVisualization: true });
    expect(mockState.insertedRow).toMatchObject({
      includes_visualization: true,
      run_type: 'MANUAL',
      plan_id: VALID_PLAN_ID,
      org_id: 'org-uuid-1',
      status: 'QUEUED',
    });
  });

  it('persiste includes_visualization=false si demandé', async () => {
    await requestValuationRun({ planId: VALID_PLAN_ID, includeVisualization: false });
    expect(mockState.insertedRow?.includes_visualization).toBe(false);
  });

  it('persiste numPaths/numTimeSteps/seed dans parameters jsonb', async () => {
    await requestValuationRun({
      planId: VALID_PLAN_ID,
      numPaths: 50000,
      numTimeSteps: 60,
      seed: 42,
    });
    const params = mockState.insertedRow?.parameters as Record<string, unknown>;
    expect(params).toMatchObject({
      num_paths: 50000,
      num_time_steps: 60,
      seed: 42,
      include_visualization: true, // default
    });
  });

  it('rejette planId non-UUID via Zod', async () => {
    const res = await requestValuationRun({ planId: 'not-a-uuid' });
    expect(res.ok).toBe(false);
  });

  it('rejette numPaths hors bornes [1000, 100000]', async () => {
    const res = await requestValuationRun({ planId: VALID_PLAN_ID, numPaths: 50 });
    expect(res.ok).toBe(false);
  });

  it('retourne erreur si pas de hypothesis_set pour le plan', async () => {
    mockState.lastHypo = { data: null, error: null };
    const res = await requestValuationRun({ planId: VALID_PLAN_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/hypothesis_set/i);
  });

  it('retourne erreur si pas de simulation_config rattaché', async () => {
    mockState.simConfig = { data: null, error: null };
    const res = await requestValuationRun({ planId: VALID_PLAN_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/simulation_config/i);
  });

  it('retourne erreur si activeOrgId manquante', async () => {
    requirePermissionMock.mockResolvedValueOnce({
      id: 'u1',
      email: 'e',
      fullName: 'A',
      activeOrgId: null,
      orgIds: [],
      activeRoles: ['OWNER'],
    });
    const res = await requestValuationRun({ planId: VALID_PLAN_ID });
    expect(res.ok).toBe(false);
  });

  it('retourne erreur si invoke EF échoue', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'EF down' } });
    // Mock the post-invoke read of the run to return ERROR or QUEUED — provides
    // a path through the error-recovery code that checks edge-written messages.
    mockState.runDetailReturn = { data: { status: 'QUEUED', error_message: null }, error: null };
    const res = await requestValuationRun({ planId: VALID_PLAN_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/EF down|compute-valuation/i);
  });
});

// =============================================================================
// listValuationRuns — 4 tests
// =============================================================================

describe('listValuationRuns', () => {
  it('retourne tableau vide quand aucun run', async () => {
    mockState.listReturn = { data: [], error: null, count: 0 };
    const res = await listValuationRuns({});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.runs).toEqual([]);
      expect(res.total).toBe(0);
    }
  });

  it('mappe correctement les champs DB → ValuationRunListItem', async () => {
    mockState.listReturn = {
      data: [
        {
          id: 'run-1',
          plan_id: 'plan-1',
          status: 'DONE',
          run_type: 'MANUAL',
          pricer_used: 'MONTE_CARLO_MULTI_TRANCHE',
          engine_version: 'V8',
          includes_visualization: true,
          triggered_by: 'user-1',
          started_at: '2026-05-01T10:00:00Z',
          completed_at: '2026-05-01T10:01:00Z',
          created_at: '2026-05-01T10:00:00Z',
          error_message: null,
          plans: { name: 'BSPCE 2026' },
          valuation_results: [{ fair_value_per_instrument: 12.47 }],
        },
      ],
      error: null,
      count: 1,
    };
    mockState.profilesReturn = {
      data: [{ id: 'user-1', email: 'manager@example.com' }],
      error: null,
    };
    const res = await listValuationRuns({});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.runs).toHaveLength(1);
      expect(res.runs[0]).toMatchObject({
        id: 'run-1',
        planName: 'BSPCE 2026',
        status: 'DONE',
        includesVisualization: true,
        fairValuePerUnit: 12.47,
        triggeredByEmail: 'manager@example.com',
      });
    }
  });

  it('rejette filter limit > 200 (Zod max)', async () => {
    const res = await listValuationRuns({ limit: 500 });
    expect(res.ok).toBe(false);
  });

  it('rejette planId non-UUID', async () => {
    const res = await listValuationRuns({ planId: 'invalid' });
    expect(res.ok).toBe(false);
  });
});

// =============================================================================
// getValuationRunById — 3 tests
// =============================================================================

describe('getValuationRunById', () => {
  it('retourne erreur si runId non-UUID', async () => {
    const res = await getValuationRunById('not-a-uuid');
    expect(res.ok).toBe(false);
  });

  it('retourne erreur si run introuvable (RLS / org mismatch)', async () => {
    mockState.runDetailReturn = { data: null, error: null };
    const res = await getValuationRunById(VALID_RUN_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable|accès refusé/i);
  });

  it('mappe les champs DB → ValuationRunDetail (avec results joints)', async () => {
    mockState.runDetailReturn = {
      data: {
        id: VALID_RUN_ID,
        plan_id: 'plan-1',
        status: 'DONE',
        run_type: 'MANUAL',
        pricer_used: 'MONTE_CARLO_MULTI_TRANCHE',
        engine_version: 'V8',
        input_hash: 'abc123',
        includes_visualization: true,
        triggered_by: 'user-1',
        started_at: '2026-05-01T10:00:00Z',
        completed_at: '2026-05-01T10:01:00Z',
        created_at: '2026-05-01T10:00:00Z',
        error_message: null,
        parameters: { num_paths: 100000 },
        payload_sent: { market: { S0: 100 } },
        response_received: { fair_value_per_unit: 12.47 },
        plans: { name: 'BSPCE 2026' },
      },
      error: null,
    };
    mockState.resultRowReturn = {
      data: {
        fair_value_per_instrument: 12.47,
        std_error: 0.05,
        ci95_low: 12.4,
        ci95_high: 12.55,
        sensitivities: { delta: 0.5 },
        distribution_stats: { paths: 100 },
      },
      error: null,
    };
    mockState.profileEmailReturn = { data: { email: 'manager@example.com' }, error: null };
    const res = await getValuationRunById(VALID_RUN_ID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.run).toMatchObject({
        id: VALID_RUN_ID,
        planName: 'BSPCE 2026',
        status: 'DONE',
        inputHash: 'abc123',
        includesVisualization: true,
        triggeredByEmail: 'manager@example.com',
        fairValuePerUnit: 12.47,
      });
      expect(res.run.results).toMatchObject({
        fairValuePerInstrument: 12.47,
        stdError: 0.05,
      });
    }
  });
});
