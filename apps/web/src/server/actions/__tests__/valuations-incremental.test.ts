import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 11 B2 — Tests Server Action computeIncrementalFairValue
 * (résolution dette #11).
 *
 * Couvre :
 *   1. Happy path : 2 runs DONE, delta calculé correct, UPDATE + audit OK
 *   2. Permission denied (requirePermission throw)
 *   3. Validation Zod fail (modificationId pas UUID)
 *   4. Modification not found
 *   5. Award lié introuvable
 *   6. Pre-valuation manquante (no row in valuation_award_results)
 *   7. Post-valuation manquante
 *   8. fair_value_per_unit invalide (NaN/non-numeric)
 *   9. Delta négatif (modification défavorable) : permis V1, calcule -delta
 *  10. UPDATE échoue → ok: false avec message
 *
 * Pattern mock : vi.hoisted pour partager state entre vi.mock factories.
 */

const { mockState, requirePermissionMock, makeBuilder } = vi.hoisted(() => {
  type RowOrError = { data: unknown; error: unknown };

  const mockState: {
    requirePermissionThrows: boolean;
    modification: RowOrError;
    award: RowOrError;
    preResult: RowOrError;
    postResult: RowOrError;
    updateError: unknown;
    valuationCallCount: number;
  } = {
    requirePermissionThrows: false,
    modification: {
      data: {
        id: 'mod-uuid-1',
        award_id: 'aw-uuid-1',
        org_id: 'org-uuid-1',
        modification_type: 'REPRICING',
      },
      error: null,
    },
    award: { data: { id: 'aw-uuid-1', units_outstanding: 1000 }, error: null },
    preResult: {
      data: { fair_value_per_unit: 5.0, valuation_run_id: 'run-pre' },
      error: null,
    },
    postResult: {
      data: { fair_value_per_unit: 7.5, valuation_run_id: 'run-post' },
      error: null,
    },
    updateError: null,
    valuationCallCount: 0,
  };

  const requirePermissionMock = vi.fn().mockResolvedValue({
    id: 'user-uuid-1',
    email: 'admin@example.com',
    fullName: 'Admin User',
    activeOrgId: 'org-uuid-1',
    orgIds: ['org-uuid-1'],
    activeRoles: ['OWNER'],
  });

  function makeBuilder(table: string) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.update = () => ({
      eq: () => ({
        eq: () => Promise.resolve({ error: mockState.updateError }),
      }),
    });
    b.maybeSingle = () => {
      if (table === 'award_modifications') return Promise.resolve(mockState.modification);
      if (table === 'awards') return Promise.resolve(mockState.award);
      if (table === 'valuation_award_results') {
        // Counter global → 1er call = pre, 2e call = post (cohérent avec
        // l'ordre de Promise.all([preRes, postRes]) côté SA).
        const idx = mockState.valuationCallCount++;
        return idx === 0
          ? Promise.resolve(mockState.preResult)
          : Promise.resolve(mockState.postResult);
      }
      return Promise.resolve({ data: null, error: null });
    };
    return b;
  }

  return { mockState, requirePermissionMock, makeBuilder };
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
  }),
}));

import { computeIncrementalFairValue } from '../valuations';

const VALID_INPUT = {
  modificationId: '11111111-1111-4111-8111-111111111111',
  valuationRunIdPre: '22222222-2222-4222-8222-222222222222',
  valuationRunIdPost: '33333333-3333-4333-8333-333333333333',
};

beforeEach(() => {
  // Reset state to defaults
  requirePermissionMock.mockClear();
  requirePermissionMock.mockResolvedValue({
    id: 'user-uuid-1',
    email: 'admin@example.com',
    fullName: 'Admin User',
    activeOrgId: 'org-uuid-1',
    orgIds: ['org-uuid-1'],
    activeRoles: ['OWNER'],
  });

  mockState.modification = {
    data: {
      id: 'mod-uuid-1',
      award_id: 'aw-uuid-1',
      org_id: 'org-uuid-1',
      modification_type: 'REPRICING',
    },
    error: null,
  };
  mockState.award = { data: { id: 'aw-uuid-1', units_outstanding: 1000 }, error: null };
  mockState.preResult = {
    data: { fair_value_per_unit: 5.0, valuation_run_id: 'run-pre' },
    error: null,
  };
  mockState.postResult = {
    data: { fair_value_per_unit: 7.5, valuation_run_id: 'run-post' },
    error: null,
  };
  mockState.updateError = null;
  mockState.valuationCallCount = 0;
});

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe('computeIncrementalFairValue — happy path', () => {
  it('calcule delta = fv_post - fv_pre × units_outstanding et retourne ok', async () => {
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fairValuePreUnit).toBe(5.0);
      expect(result.fairValuePostUnit).toBe(7.5);
      expect(result.unitsOutstanding).toBe(1000);
      // delta = 7.5 - 5.0 = 2.5 ; incremental = 2.5 * 1000 = 2500
      expect(result.incrementalFairValue).toBe(2500);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Validation
// ---------------------------------------------------------------------------

describe('computeIncrementalFairValue — validation', () => {
  it('rejette modificationId non-UUID', async () => {
    const result = await computeIncrementalFairValue({
      modificationId: 'not-a-uuid',
      valuationRunIdPre: VALID_INPUT.valuationRunIdPre,
      valuationRunIdPost: VALID_INPUT.valuationRunIdPost,
    });
    expect(result.ok).toBe(false);
  });

  it('rejette valuationRunIdPre non-UUID', async () => {
    const result = await computeIncrementalFairValue({
      modificationId: VALID_INPUT.modificationId,
      valuationRunIdPre: 'invalid',
      valuationRunIdPost: VALID_INPUT.valuationRunIdPost,
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Permissions
// ---------------------------------------------------------------------------

describe('computeIncrementalFairValue — permissions', () => {
  it('rejette si user sans activeOrgId', async () => {
    requirePermissionMock.mockResolvedValueOnce({
      id: 'user-uuid-1',
      email: 'admin@example.com',
      fullName: 'Admin User',
      activeOrgId: null,
      orgIds: [],
      activeRoles: ['OWNER'],
    });
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Organisation active manquante/);
  });
});

// ---------------------------------------------------------------------------
// 4. Modification / award introuvables
// ---------------------------------------------------------------------------

describe('computeIncrementalFairValue — entities introuvables', () => {
  it('rejette si modification introuvable', async () => {
    mockState.modification = { data: null, error: null };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Modification introuvable/);
  });

  it('rejette si award lié introuvable', async () => {
    mockState.award = { data: null, error: null };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Award lié.*introuvable/);
  });

  it('rejette si units_outstanding <= 0', async () => {
    mockState.award = { data: { id: 'aw-uuid-1', units_outstanding: 0 }, error: null };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/units_outstanding > 0/);
  });
});

// ---------------------------------------------------------------------------
// 5. Valuation results manquants
// ---------------------------------------------------------------------------

describe('computeIncrementalFairValue — valuations manquantes', () => {
  it('rejette si valuation pre introuvable', async () => {
    mockState.preResult = { data: null, error: null };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/pre-modification introuvable/);
  });

  it('rejette si valuation post introuvable', async () => {
    mockState.postResult = { data: null, error: null };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/post-modification introuvable/);
  });

  it('rejette si fair_value_per_unit invalide (string)', async () => {
    mockState.preResult = {
      data: { fair_value_per_unit: 'NaN' as unknown as number, valuation_run_id: 'run-pre' },
      error: null,
    };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/fair_value_per_unit invalide/);
  });
});

// ---------------------------------------------------------------------------
// 6. Delta négatif (modification défavorable IFRS 2.B43)
// ---------------------------------------------------------------------------

describe('computeIncrementalFairValue — delta négatif', () => {
  it('permet un delta négatif (modification défavorable, IFRS 2.B43 reverse)', async () => {
    mockState.preResult = {
      data: { fair_value_per_unit: 10.0, valuation_run_id: 'run-pre' },
      error: null,
    };
    mockState.postResult = {
      data: { fair_value_per_unit: 7.5, valuation_run_id: 'run-post' },
      error: null,
    };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // delta = 7.5 - 10 = -2.5 ; incremental = -2.5 * 1000 = -2500
      expect(result.incrementalFairValue).toBe(-2500);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. UPDATE error
// ---------------------------------------------------------------------------

describe('computeIncrementalFairValue — UPDATE failure', () => {
  it('rejette si UPDATE award_modifications échoue', async () => {
    mockState.updateError = { message: 'permission denied' };
    const result = await computeIncrementalFairValue(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/UPDATE.*échoué/);
  });
});
