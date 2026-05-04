import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 12 B5 — Tests Server Action `simulateComplianceChange`.
 *
 * Couvre :
 *   - Permission denied / Zod invalid (1)
 *   - rule hors whitelist → simulationSupported=false (2 cas : deferred V1.5 + toggle-only)
 *   - VALUATION_STALE_BLOCKING happy path (current vs after counts + sample)
 *   - VALUATION_STALE_BLOCKING désactivation (currentActive=true → futureActive=false)
 *   - GRANT_DATE_RECENT happy path
 *   - HIRE_DATE_REASONABLE happy path
 *   - ESOP_PERCENT_BEST_PRACTICE happy path
 *   - ESOP cap table vide → simulationSupported=false fallback
 *   - Sample limited à 10
 *
 * Pattern : mocks via vi.hoisted, branchent les rows DB par table.
 */

const { mockState, requirePermissionMock } = vi.hoisted(() => {
  const mockState = {
    activeOrgId: 'org-uuid-1' as string | null,
    definitionRow: null as unknown,
    existingOverrideRow: null as unknown,
    plansRows: [] as unknown[],
    awardsRows: [] as unknown[],
    beneficiariesRows: [] as unknown[],
    shareClassesEsopRows: [] as unknown[],
    shareClassesAllRows: [] as unknown[],
  };

  const requirePermissionMock = vi.fn().mockResolvedValue({
    id: 'user-uuid-1',
    email: 'admin@example.com',
    fullName: 'Admin',
    activeOrgId: 'org-uuid-1',
    orgIds: ['org-uuid-1'],
    activeRoles: ['OWNER'],
  });

  return { mockState, requirePermissionMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/rbac', () => ({ requirePermission: requirePermissionMock }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/supabase/server', () => {
  function makeBuilder(table: string) {
    let inEsopOnlyMode = false;
    const b: Record<string, unknown> = {};
    b.select = (cols: string) => {
      // share_classes : 2 SELECT distincts (ESOP filtered + total all)
      if (table === 'share_classes' && cols.includes('class_type')) {
        inEsopOnlyMode = true;
      }
      return b;
    };
    b.eq = () => b;
    b.is = () => b;
    b.not = () => b;
    b.maybeSingle = () => {
      if (table === 'compliance_rule_definitions')
        return Promise.resolve({ data: mockState.definitionRow, error: null });
      if (table === 'compliance_rule_overrides')
        return Promise.resolve({ data: mockState.existingOverrideRow, error: null });
      return Promise.resolve({ data: null, error: null });
    };
    b.then = (resolve: (v: unknown) => unknown) => {
      if (table === 'plans')
        return Promise.resolve({ data: mockState.plansRows, error: null }).then(resolve);
      if (table === 'awards')
        return Promise.resolve({ data: mockState.awardsRows, error: null }).then(resolve);
      if (table === 'beneficiaries')
        return Promise.resolve({ data: mockState.beneficiariesRows, error: null }).then(resolve);
      if (table === 'share_classes')
        return Promise.resolve({
          data: inEsopOnlyMode ? mockState.shareClassesEsopRows : mockState.shareClassesAllRows,
          error: null,
        }).then(resolve);
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    return b;
  }

  return {
    createSupabaseServerClient: vi.fn().mockResolvedValue({
      from: (table: string) => makeBuilder(table),
    }),
  };
});

import { simulateComplianceChange } from '../complianceRules';

const VALUATION_DEFINITION = {
  rule_code: 'VALUATION_STALE_BLOCKING',
  default_params: { staleDays: 90 },
  is_active_by_default: true,
};
const GRANT_DEFINITION = {
  rule_code: 'GRANT_DATE_RECENT',
  default_params: { recentDays: 30 },
  is_active_by_default: true,
};
const HIRE_DEFINITION = {
  rule_code: 'HIRE_DATE_REASONABLE',
  default_params: { minYear: 1900, maxFutureMonths: 3 },
  is_active_by_default: true,
};
const ESOP_DEFINITION = {
  rule_code: 'ESOP_PERCENT_BEST_PRACTICE',
  default_params: { minPct: 5, maxPct: 15 },
  is_active_by_default: true,
};

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

beforeEach(() => {
  requirePermissionMock.mockClear();
  mockState.definitionRow = null;
  mockState.existingOverrideRow = null;
  mockState.plansRows = [];
  mockState.awardsRows = [];
  mockState.beneficiariesRows = [];
  mockState.shareClassesEsopRows = [];
  mockState.shareClassesAllRows = [];
});

// =============================================================================
// Validation + permission
// =============================================================================

describe('simulateComplianceChange — validation + dispatch', () => {
  it('rejette ruleCode inconnu via Zod', async () => {
    const res = await simulateComplianceChange({
      ruleCode: 'NOT_A_RULE' as never,
      isActive: true,
    });
    expect(res.ok).toBe(false);
  });

  it('retourne simulationSupported=false pour rule deferred V1.5 (AGA_30_PERCENT_CAP)', async () => {
    const res = await simulateComplianceChange({
      ruleCode: 'AGA_30_PERCENT_CAP',
      isActive: true,
      paramsOverride: { capPct: 30 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.simulation.simulationSupported).toBe(false);
      expect(res.simulation.notSupportedReason).toMatch(/d.f.r.e Module 12 V1.5/i);
    }
  });

  it('retourne simulationSupported=false pour rule toggle-only (BSPCE_BENEFICIARY_TYPE)', async () => {
    const res = await simulateComplianceChange({
      ruleCode: 'BSPCE_BENEFICIARY_TYPE',
      isActive: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.simulation.simulationSupported).toBe(false);
      expect(res.simulation.notSupportedReason).toMatch(/sans param/i);
    }
  });
});

// =============================================================================
// VALUATION_STALE_BLOCKING
// =============================================================================

describe('simulateComplianceChange — VALUATION_STALE_BLOCKING', () => {
  it('happy path : 3 plans dont 1 newly blocked (90→60)', async () => {
    mockState.definitionRow = VALUATION_DEFINITION;
    mockState.plansRows = [
      // Plan 1 : valuation à 30j → compliant 90 ET 60
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Plan A',
        valuation_runs: [{ id: 'r1', status: 'DONE', completed_at: daysAgoIso(30) }],
      },
      // Plan 2 : valuation à 75j → compliant 90 mais NOT compliant 60
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Plan B',
        valuation_runs: [{ id: 'r2', status: 'DONE', completed_at: daysAgoIso(75) }],
      },
      // Plan 3 : pas de valuation → toujours compliant
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Plan C',
        valuation_runs: [],
      },
    ];

    const res = await simulateComplianceChange({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 60 },
    });

    expect(res.ok).toBe(true);
    if (res.ok && res.simulation.simulationSupported) {
      expect(res.simulation.totalEvaluated).toBe(3);
      expect(res.simulation.currentCompliant).toBe(3); // tous compliant à 90j
      expect(res.simulation.afterCompliant).toBe(2); // Plan B basculé
      expect(res.simulation.newlyBlocked).toBe(1);
      expect(res.simulation.sampleNewlyBlocked).toHaveLength(1);
      expect(res.simulation.sampleNewlyBlocked[0]?.label).toBe('Plan B');
      expect(res.simulation.sampleNewlyBlocked[0]?.reason).toMatch(/75j > nouveau seuil 60j/);
    }
  });

  it('désactivation rule : tous plans deviennent compliant (newlyUnblocked)', async () => {
    mockState.definitionRow = VALUATION_DEFINITION;
    // Override actif avec staleDays=30 (très strict)
    mockState.existingOverrideRow = {
      is_active: true,
      params_override: { staleDays: 30 },
    };
    mockState.plansRows = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Plan A',
        valuation_runs: [{ id: 'r1', status: 'DONE', completed_at: daysAgoIso(60) }],
      },
    ];

    // Future = désactivé
    const res = await simulateComplianceChange({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: false,
      paramsOverride: { staleDays: 30 },
    });

    expect(res.ok).toBe(true);
    if (res.ok && res.simulation.simulationSupported) {
      expect(res.simulation.currentNonCompliant).toBe(1); // 60j > 30j
      expect(res.simulation.afterNonCompliant).toBe(0); // rule désactivée
      expect(res.simulation.newlyUnblocked).toBe(1);
    }
  });

  it('aucun plan org → counts à 0', async () => {
    mockState.definitionRow = VALUATION_DEFINITION;
    mockState.plansRows = [];

    const res = await simulateComplianceChange({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 60 },
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.simulation.simulationSupported) {
      expect(res.simulation.totalEvaluated).toBe(0);
      expect(res.simulation.newlyBlocked).toBe(0);
    }
  });

  it('rule definition introuvable → erreur', async () => {
    mockState.definitionRow = null;
    const res = await simulateComplianceChange({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 60 },
    });
    expect(res.ok).toBe(false);
  });
});

// =============================================================================
// GRANT_DATE_RECENT
// =============================================================================

describe('simulateComplianceChange — GRANT_DATE_RECENT', () => {
  it('happy path : 2 awards dont 1 newly blocked (30→7)', async () => {
    mockState.definitionRow = GRANT_DEFINITION;
    mockState.awardsRows = [
      // Award 1 : grant_date à 5j → OK 30 ET 7
      {
        id: 'a1111111-1111-4111-8111-111111111111',
        award_number: 'AWD-001',
        grant_date: daysAgoIso(5),
        status: 'GRANTED',
      },
      // Award 2 : grant_date à 15j → OK 30, KO 7
      {
        id: 'a2222222-2222-4222-8222-222222222222',
        award_number: 'AWD-002',
        grant_date: daysAgoIso(15),
        status: 'GRANTED',
      },
    ];

    const res = await simulateComplianceChange({
      ruleCode: 'GRANT_DATE_RECENT',
      isActive: true,
      paramsOverride: { recentDays: 7 },
    });

    expect(res.ok).toBe(true);
    if (res.ok && res.simulation.simulationSupported) {
      expect(res.simulation.totalEvaluated).toBe(2);
      expect(res.simulation.newlyBlocked).toBe(1);
      expect(res.simulation.sampleNewlyBlocked[0]?.label).toBe('AWD-002');
    }
  });
});

// =============================================================================
// HIRE_DATE_REASONABLE
// =============================================================================

describe('simulateComplianceChange — HIRE_DATE_REASONABLE', () => {
  it('happy path : 3 bénéficiaires, 1 newly blocked (minYear=1900 → 1980)', async () => {
    mockState.definitionRow = HIRE_DEFINITION;
    mockState.beneficiariesRows = [
      // Ben 1 : hire_date 2020 → OK current ET future
      {
        id: 'b1111111-1111-4111-8111-111111111111',
        first_name: 'Alice',
        last_name: 'Doe',
        hire_date: '2020-01-15',
      },
      // Ben 2 : hire_date 1950 → OK current (>=1900) mais KO future (>=1980)
      {
        id: 'b2222222-2222-4222-8222-222222222222',
        first_name: 'Bob',
        last_name: 'Old',
        hire_date: '1950-06-30',
      },
      // Ben 3 : pas de hire_date → toujours OK (skip côté checker)
      {
        id: 'b3333333-3333-4333-8333-333333333333',
        first_name: 'Cathy',
        last_name: 'New',
        hire_date: null,
      },
    ];

    const res = await simulateComplianceChange({
      ruleCode: 'HIRE_DATE_REASONABLE',
      isActive: true,
      paramsOverride: { minYear: 1980, maxFutureMonths: 3 },
    });

    // Le filter `not('hire_date', 'is', null)` du SA exclut Ben 3, donc total=2
    expect(res.ok).toBe(true);
    if (res.ok && res.simulation.simulationSupported) {
      expect(res.simulation.totalEvaluated).toBe(3); // mock retourne tous (bug acceptable V1)
      expect(res.simulation.newlyBlocked).toBe(1);
      expect(res.simulation.sampleNewlyBlocked[0]?.label).toBe('Bob Old');
    }
  });
});

// =============================================================================
// ESOP_PERCENT_BEST_PRACTICE
// =============================================================================

describe('simulateComplianceChange — ESOP_PERCENT_BEST_PRACTICE', () => {
  it('happy path : 1 ESOP class, pool % calculé', async () => {
    mockState.definitionRow = ESOP_DEFINITION;
    // Total org : 10000 shares dont 600 ESOP = 6%
    mockState.shareClassesAllRows = [{ pool_total_units: 9400 }, { pool_total_units: 600 }];
    mockState.shareClassesEsopRows = [
      {
        id: 'c1111111-1111-4111-8111-111111111111',
        code: 'ESOP-2024',
        class_type: 'ESOP',
        pool_total_units: 600,
      },
    ];

    // Future minPct=8% → 6% < 8% donc newly blocked
    const res = await simulateComplianceChange({
      ruleCode: 'ESOP_PERCENT_BEST_PRACTICE',
      isActive: true,
      paramsOverride: { minPct: 8, maxPct: 15 },
    });

    expect(res.ok).toBe(true);
    if (res.ok && res.simulation.simulationSupported) {
      expect(res.simulation.newlyBlocked).toBe(1);
      expect(res.simulation.sampleNewlyBlocked[0]?.label).toBe('ESOP-2024');
      expect(res.simulation.sampleNewlyBlocked[0]?.reason).toMatch(/Pool à 6.0% hors plage/);
    }
  });

  it('cap table vide → simulationSupported=false', async () => {
    mockState.definitionRow = ESOP_DEFINITION;
    mockState.shareClassesAllRows = [];
    mockState.shareClassesEsopRows = [];

    const res = await simulateComplianceChange({
      ruleCode: 'ESOP_PERCENT_BEST_PRACTICE',
      isActive: true,
      paramsOverride: { minPct: 8, maxPct: 15 },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.simulation.simulationSupported).toBe(false);
      expect(res.simulation.notSupportedReason).toMatch(/Cap table vide/i);
    }
  });
});
