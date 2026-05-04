import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 12 B3b — Tests Server Actions complianceRules.
 *
 * Couvre les 4 SAs :
 *   - updateComplianceRuleOverride (8 tests)
 *   - listComplianceRulesForUI (3 tests)
 *   - getComplianceRuleAuditLog (2 tests)
 *   - resetAllComplianceOverrides (2 tests)
 *
 * Pattern : `vi.hoisted` partage le mock state. Mocks Supabase chainable
 * thenable + maybeSingle/single selon les calls.
 */

const { mockState, requirePermissionMock, logAuditMock, revalidatePathMock } = vi.hoisted(() => {
  const mockState = {
    requirePermissionThrows: false,
    activeOrgId: 'org-uuid-1' as string | null,
    definitionRow: null as unknown,
    existingOverrideRow: null as unknown,
    upsertResult: { data: { id: 'override-uuid-1' } as unknown, error: null as unknown },
    listResult: { data: [] as unknown[], error: null as unknown },
    auditQueryResult: { data: [] as unknown[], error: null as unknown },
    deleteCount: 0,
    deleteError: null as unknown,
    capturedUpsertRow: null as Record<string, unknown> | null,
  };

  const requirePermissionMock = vi.fn().mockResolvedValue({
    id: 'user-uuid-1',
    email: 'admin@example.com',
    fullName: 'Admin',
    activeOrgId: 'org-uuid-1',
    orgIds: ['org-uuid-1'],
    activeRoles: ['OWNER'],
  });

  const logAuditMock = vi.fn().mockResolvedValue(undefined);
  const revalidatePathMock = vi.fn();

  return { mockState, requirePermissionMock, logAuditMock, revalidatePathMock };
});

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: logAuditMock,
}));

vi.mock('@/lib/supabase/server', () => {
  function makeBuilder(table: string) {
    const b: Record<string, unknown> = {};
    b.select = (_: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        // count head pattern (resetAll deletedCount)
        return {
          eq: () => Promise.resolve({ count: mockState.deleteCount, error: null }),
        };
      }
      return b;
    };
    b.eq = () => b;
    b.like = () => b;
    b.filter = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.maybeSingle = () => {
      if (table === 'compliance_rule_definitions')
        return Promise.resolve({ data: mockState.definitionRow, error: null });
      if (table === 'compliance_rule_overrides')
        return Promise.resolve({ data: mockState.existingOverrideRow, error: null });
      return Promise.resolve({ data: null, error: null });
    };
    b.single = () => Promise.resolve(mockState.upsertResult);
    b.upsert = (row: Record<string, unknown>) => {
      mockState.capturedUpsertRow = row;
      return {
        select: () => ({
          single: () => Promise.resolve(mockState.upsertResult),
        }),
      };
    };
    b.delete = () => ({
      eq: () => Promise.resolve({ error: mockState.deleteError }),
    });
    // Make builder thenable for `await query` (listForUI + auditLog)
    b.then = (resolve: (v: unknown) => unknown) => {
      if (table === 'effective_compliance_rules') {
        return Promise.resolve({
          data: mockState.listResult.data,
          error: mockState.listResult.error,
        }).then(resolve);
      }
      if (table === 'audit_events') {
        return Promise.resolve({
          data: mockState.auditQueryResult.data,
          error: mockState.auditQueryResult.error,
        }).then(resolve);
      }
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

import {
  getComplianceRuleAuditLog,
  listComplianceRulesForUI,
  resetAllComplianceOverrides,
  updateComplianceRuleOverride,
} from '../complianceRules';

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
  logAuditMock.mockClear();
  revalidatePathMock.mockClear();

  mockState.activeOrgId = 'org-uuid-1';
  mockState.definitionRow = null;
  mockState.existingOverrideRow = null;
  mockState.upsertResult = { data: { id: 'override-uuid-1' }, error: null };
  mockState.listResult = { data: [], error: null };
  mockState.auditQueryResult = { data: [], error: null };
  mockState.deleteCount = 0;
  mockState.deleteError = null;
  mockState.capturedUpsertRow = null;
});

const VALUATION_DEFINITION = {
  rule_code: 'VALUATION_STALE_BLOCKING',
  params_schema: {
    staleDays: { type: 'integer', min: 30, max: 365 },
  },
  default_params: { staleDays: 90 },
  is_active_by_default: true,
  severity_default: 'error',
};

// =============================================================================
// updateComplianceRuleOverride — 8 tests
// =============================================================================

describe('updateComplianceRuleOverride', () => {
  it('happy path : activation isActive=true sans override existant → audit activated', async () => {
    mockState.definitionRow = { ...VALUATION_DEFINITION, is_active_by_default: false };
    mockState.existingOverrideRow = null;

    const res = await updateComplianceRuleOverride({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 60 },
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ruleCode).toBe('VALUATION_STALE_BLOCKING');
    const auditCall = logAuditMock.mock.calls[0]?.[0];
    expect(auditCall?.eventType).toBe('compliance_rule.activated');
  });

  it('happy path : désactivation isActive=false sur rule active → audit deactivated', async () => {
    mockState.definitionRow = VALUATION_DEFINITION;
    mockState.existingOverrideRow = {
      id: 'ovr-1',
      is_active: true,
      params_override: { staleDays: 60 },
    };

    const res = await updateComplianceRuleOverride({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: false,
      paramsOverride: { staleDays: 60 },
    });

    expect(res.ok).toBe(true);
    const auditCall = logAuditMock.mock.calls[0]?.[0];
    expect(auditCall?.eventType).toBe('compliance_rule.deactivated');
  });

  it('happy path : modification params seulement → audit params_updated avec diff', async () => {
    mockState.definitionRow = VALUATION_DEFINITION;
    mockState.existingOverrideRow = {
      id: 'ovr-1',
      is_active: true,
      params_override: { staleDays: 60 },
    };

    const res = await updateComplianceRuleOverride({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 30 },
    });

    expect(res.ok).toBe(true);
    const auditCall = logAuditMock.mock.calls[0]?.[0];
    expect(auditCall?.eventType).toBe('compliance_rule.params_updated');
    expect(auditCall?.metadata?.diff).toEqual({ staleDays: { from: 60, to: 30 } });
  });

  it('rejette ruleCode inconnu via Zod', async () => {
    const res = await updateComplianceRuleOverride({
      ruleCode: 'NOT_A_RULE' as never,
      isActive: true,
    });
    expect(res.ok).toBe(false);
  });

  it('rejette param hors bornes du params_schema (staleDays=10 < min 30)', async () => {
    mockState.definitionRow = VALUATION_DEFINITION;

    const res = await updateComplianceRuleOverride({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 10 },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/min 30/i);
  });

  it('rejette param non listé dans params_schema (foo non défini)', async () => {
    mockState.definitionRow = VALUATION_DEFINITION;

    const res = await updateComplianceRuleOverride({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { foo: 42 },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/inconnu/i);
  });

  it('rejette si rule_code introuvable côté DB (definition null)', async () => {
    mockState.definitionRow = null;

    const res = await updateComplianceRuleOverride({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/definition introuvable/i);
  });

  it("persiste org_id + updated_by dans l'UPSERT", async () => {
    mockState.definitionRow = VALUATION_DEFINITION;

    await updateComplianceRuleOverride({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 90 },
      notes: 'Test notes',
    });

    expect(mockState.capturedUpsertRow).toMatchObject({
      org_id: 'org-uuid-1',
      rule_code: 'VALUATION_STALE_BLOCKING',
      is_active: true,
      updated_by: 'user-uuid-1',
      notes: 'Test notes',
    });
  });
});

// =============================================================================
// listComplianceRulesForUI — 3 tests
// =============================================================================

describe('listComplianceRulesForUI', () => {
  function makeRow(rule_code: string, scope: string): Record<string, unknown> {
    return {
      rule_code,
      scope,
      description_fr: 'desc',
      description_en: null,
      is_active: true,
      effective_severity: 'error',
      severity_default: 'error',
      is_severity_overridable: false,
      effective_params: {},
      params_schema: {},
      default_params: {},
      cta_url_template: null,
      documentation_url: null,
      is_overridden: false,
      override_notes: null,
      params_override: null,
      override_updated_at: null,
      override_updated_by: null,
    };
  }

  it('retourne 23 rules groupées par scope', async () => {
    mockState.listResult = {
      data: [
        makeRow('BSPCE_BENEFICIARY_TYPE', 'award'),
        makeRow('AGA_30_PERCENT_CAP', 'award'),
        makeRow('EMAIL_UNIQUE_IN_ORG', 'beneficiary'),
        makeRow('VALUATION_STALE_BLOCKING', 'valuation'),
      ],
      error: null,
    };

    const res = await listComplianceRulesForUI();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.totalCount).toBe(4);
      expect(res.rulesByScope.award).toHaveLength(2);
      expect(res.rulesByScope.beneficiary).toHaveLength(1);
      expect(res.rulesByScope.valuation).toHaveLength(1);
      expect(res.rulesByScope.plan).toHaveLength(0);
    }
  });

  it('retourne erreur si SELECT échoue', async () => {
    mockState.listResult = { data: null as never, error: { message: 'permission denied' } };

    const res = await listComplianceRulesForUI();
    expect(res.ok).toBe(false);
  });

  it('skip silently les rows malformées (rule_code inconnu)', async () => {
    mockState.listResult = {
      data: [
        makeRow('VALUATION_STALE_BLOCKING', 'valuation'),
        makeRow('NOT_A_RULE_CODE', 'award'), // Zod va rejeter
      ],
      error: null,
    };

    const res = await listComplianceRulesForUI();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.totalCount).toBe(1);
      expect(res.rulesByScope.valuation).toHaveLength(1);
    }
  });
});

// =============================================================================
// getComplianceRuleAuditLog — 2 tests
// =============================================================================

describe('getComplianceRuleAuditLog', () => {
  it('rejette ruleCode invalide', async () => {
    const res = await getComplianceRuleAuditLog('NOT_A_RULE');
    expect(res.ok).toBe(false);
  });

  it('happy path : retourne les events compliance_rule.* mappés', async () => {
    mockState.auditQueryResult = {
      data: [
        {
          id: 'audit-1',
          event_type: 'compliance_rule.activated',
          occurred_at: '2026-05-04T12:00:00Z',
          user_email: 'owner@example.com',
          before_state: { is_active: false },
          after_state: { is_active: true },
          metadata: { rule_code: 'VALUATION_STALE_BLOCKING', diff: {} },
        },
      ],
      error: null,
    };

    const res = await getComplianceRuleAuditLog('VALUATION_STALE_BLOCKING');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0]?.eventType).toBe('compliance_rule.activated');
      expect(res.entries[0]?.userEmail).toBe('owner@example.com');
    }
  });
});

// =============================================================================
// resetAllComplianceOverrides — 2 tests
// =============================================================================

describe('resetAllComplianceOverrides', () => {
  it('happy path : DELETE OK + audit avec deleted_count', async () => {
    mockState.deleteCount = 5;
    mockState.deleteError = null;

    const res = await resetAllComplianceOverrides();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.deletedCount).toBe(5);

    const auditCall = logAuditMock.mock.calls[0]?.[0];
    expect(auditCall?.eventType).toBe('compliance_rule.reset_all');
    expect(auditCall?.metadata?.deleted_count).toBe(5);
  });

  it('retourne erreur si DELETE échoue', async () => {
    mockState.deleteError = { message: 'permission denied' };

    const res = await resetAllComplianceOverrides();
    expect(res.ok).toBe(false);
  });
});
