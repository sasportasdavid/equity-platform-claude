import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 10 B3 — Tests query getCapTable.
 *
 * Couvre :
 *  - happy CONSOLIDATED (org vide → grand_total=0)
 *  - happy CONSOLIDATED (org avec positions → totaux corrects)
 *  - happy DILUTED (positions + awards virtuels)
 *  - error path : RPC retourne une erreur
 *  - error path : Zod fail (viewMode invalide)
 *  - error path : pas d'org actif (perm OK mais user.activeOrgId null)
 */

const { TEST_ORG_ID, TEST_USER_ID, mockState, requirePermissionMock, rpcMock } = vi.hoisted(() => {
  const TEST_ORG_ID = '00000000-0000-4000-8000-000000000000';
  const TEST_USER_ID = '00000000-0000-4000-8000-000000000099';
  const mockState: { rpcResult: { data: unknown; error: unknown } } = {
    rpcResult: { data: null, error: null },
  };
  return {
    TEST_ORG_ID,
    TEST_USER_ID,
    mockState,
    requirePermissionMock: vi.fn(),
    rpcMock: vi.fn(),
  };
});

vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: (...args: unknown[]) => {
      rpcMock(...args);
      return Promise.resolve(mockState.rpcResult);
    },
  }),
}));

import { getCapTable } from '../cap-table';

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
  mockState.rpcResult = { data: null, error: null };
});

describe('getCapTable', () => {
  it('happy path : org vide → positions=[] grand_total=0', async () => {
    mockState.rpcResult = {
      data: {
        org_id: TEST_ORG_ID,
        asof_date: '2026-05-04',
        view_mode: 'CONSOLIDATED',
        scenario_id: null,
        positions: [],
        totals_by_class: {},
        grand_total_units: 0,
        computed_at: new Date().toISOString(),
      },
      error: null,
    };

    const result = await getCapTable({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.positions).toHaveLength(0);
      expect(result.data.grand_total_units).toBe(0);
      expect(result.data.view_mode).toBe('CONSOLIDATED');
    }
  });

  it('happy CONSOLIDATED avec positions → totaux corrects', async () => {
    mockState.rpcResult = {
      data: {
        org_id: TEST_ORG_ID,
        asof_date: '2026-05-04',
        view_mode: 'CONSOLIDATED',
        scenario_id: null,
        positions: [
          {
            id: 'pos-1',
            stakeholder_type: 'FOUNDER',
            stakeholder_name: 'Alice Founder',
            share_class_code: 'COMMON',
            share_class_type: 'COMMON',
            units: 1000,
            source: 'FOUNDER_GRANT',
            acquired_at: '2025-01-01',
          },
          {
            id: 'pos-2',
            stakeholder_type: 'INVESTOR',
            stakeholder_name: 'Lead VC',
            share_class_code: 'PREF_A',
            share_class_type: 'PREFERRED',
            units: 500,
            source: 'FUNDING_ROUND',
            acquired_at: '2025-06-01',
          },
        ],
        totals_by_class: { COMMON: 1000, PREF_A: 500 },
        grand_total_units: 1500,
        computed_at: new Date().toISOString(),
      },
      error: null,
    };

    const result = await getCapTable({ viewMode: 'CONSOLIDATED' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.positions).toHaveLength(2);
      expect(result.data.totals_by_class).toEqual({ COMMON: 1000, PREF_A: 500 });
      expect(result.data.grand_total_units).toBe(1500);
    }
  });

  it('happy DILUTED : awards virtuels ESOP_VIRTUAL inclus', async () => {
    mockState.rpcResult = {
      data: {
        org_id: TEST_ORG_ID,
        asof_date: '2026-05-04',
        view_mode: 'DILUTED',
        scenario_id: null,
        positions: [
          {
            id: 'pos-1',
            stakeholder_type: 'FOUNDER',
            stakeholder_name: 'Alice',
            share_class_code: 'COMMON',
            share_class_type: 'COMMON',
            units: 1000,
            source: 'FOUNDER_GRANT',
            acquired_at: '2025-01-01',
          },
          {
            stakeholder_type: 'BENEFICIARY',
            stakeholder_id: 'ben-1',
            stakeholder_name: 'Bob Beneficiary',
            share_class_code: 'ESOP_VIRTUAL',
            share_class_type: 'ESOP',
            units: 200,
            source: 'AWARD_GRANTED_VIRTUAL',
            acquired_at: '2025-09-01',
          },
        ],
        totals_by_class: { COMMON: 1000, ESOP_VIRTUAL: 200 },
        grand_total_units: 1200,
        computed_at: new Date().toISOString(),
      },
      error: null,
    };

    const result = await getCapTable({ viewMode: 'DILUTED' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const virtualPos = result.data.positions.find((p) => p.share_class_code === 'ESOP_VIRTUAL');
      expect(virtualPos).toBeDefined();
      expect(virtualPos?.units).toBe(200);
    }
    // Vérifie que rpcMock a été appelé avec p_view_mode='DILUTED'
    expect(rpcMock).toHaveBeenCalledWith(
      'compute_cap_table',
      expect.objectContaining({ p_view_mode: 'DILUTED' }),
    );
  });

  it('error path : RPC retourne erreur (ex: insufficient permissions)', async () => {
    mockState.rpcResult = {
      data: null,
      error: { message: 'Insufficient permissions to read cap table' },
    };

    const result = await getCapTable({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/compute_cap_table failed/i);
      expect(result.error).toMatch(/Insufficient permissions/i);
    }
  });

  it('error path : Zod fail (viewMode invalide)', async () => {
    const result = await getCapTable({
      // @ts-expect-error — test runtime validation
      viewMode: 'INVALID',
    });
    expect(result.ok).toBe(false);
  });

  it('error path : org actif manquant', async () => {
    requirePermissionMock.mockResolvedValueOnce({
      ...validUser,
      activeOrgId: null,
    });

    const result = await getCapTable({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/[Oo]rganisation active manquante/);
    }
  });

  it('happy path : default viewMode CONSOLIDATED si non fourni', async () => {
    mockState.rpcResult = {
      data: {
        org_id: TEST_ORG_ID,
        asof_date: '2026-05-04',
        view_mode: 'CONSOLIDATED',
        scenario_id: null,
        positions: [],
        totals_by_class: {},
        grand_total_units: 0,
        computed_at: new Date().toISOString(),
      },
      error: null,
    };

    await getCapTable({});
    // RPC appelé avec p_view_mode='CONSOLIDATED' par défaut Zod
    expect(rpcMock).toHaveBeenCalledWith(
      'compute_cap_table',
      expect.objectContaining({ p_view_mode: 'CONSOLIDATED' }),
    );
  });
});
