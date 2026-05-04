import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectiveRule, RuleCode } from '@equity/shared';
// Mock global de `server-only` configuré dans vitest.setup.ts

/**
 * Tests `runComplianceChecks` — Module 3b B7 + Module 12.5 B1.
 *
 * Mock Supabase via le pattern utilisé dans les autres Server Action tests
 * (apps/web/src/server/actions/__tests__/awards.test.ts).
 *
 * Module 12.5 B1 — mock `loadEffectiveRule` pour découpler les tests
 * d'intégration `runComplianceChecks` du chargement DB. Par défaut retourne
 * `null` (= fallback legacy, comportement Module 3b B7). Les tests dédiés
 * Module 12.5 (params dynamiques + désactivation) override cas par cas via
 * `vi.mocked(loadEffectiveRule).mockResolvedValueOnce(...)`.
 */

const mockState = {
  planRow: { data: null as unknown, error: null as unknown },
  beneficiaryRow: { data: null as unknown, error: null as unknown },
};

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const noop = () => builder;
  builder.select = noop;
  builder.eq = noop;
  builder.is = noop;
  builder.not = noop;
  builder.in = noop;
  builder.maybeSingle = () => {
    if (table === 'plans') return Promise.resolve(mockState.planRow);
    if (table === 'beneficiaries') return Promise.resolve(mockState.beneficiaryRow);
    return Promise.resolve({ data: null, error: null });
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => makeBuilder(table),
    // Module 12.5 B1 — supabase.rpc('compute_cap_table', ...) appelé pour les
    // plans AGA. Default null pour bypass le code path AGA dans les tests
    // qui n'utilisent que BSPCE/STOCK_OPTION.
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

vi.mock('../effectiveRules', () => ({
  loadEffectiveRule: vi.fn().mockResolvedValue(null),
}));

/** Helper pour forger un EffectiveRule minimal (test fixture). */
function makeEffectiveRule(
  ruleCode: RuleCode,
  overrides: Partial<EffectiveRule> = {},
): EffectiveRule {
  return {
    rule_code: ruleCode,
    scope: 'award',
    is_active: true,
    effective_severity: 'error',
    effective_params: {},
    cta_url_template: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockState.planRow = { data: null, error: null };
  mockState.beneficiaryRow = { data: null, error: null };
});

const validInput = {
  planId: 'ccc47b77-2bce-4fd4-bef6-e8a96a1941c1',
  beneficiaryId: '304e1f3b-2017-4719-b098-6554ed10fb36',
  unitsGranted: 100,
  grantDate: new Date().toISOString().slice(0, 10),
};

describe('runComplianceChecks', () => {
  it('AWARD_MODIFICATION scope : pas de rules, hasHardBlocks=false', async () => {
    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_MODIFICATION', validInput);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.hasHardBlocks).toBe(false);
  });

  it('plan introuvable → ERROR PLAN_NOT_FOUND, hasHardBlocks=true', async () => {
    mockState.planRow = { data: null, error: null };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'EMPLOYEE', email: 'x@e.com' },
      error: null,
    };

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', validInput);
    expect(res.hasHardBlocks).toBe(true);
    expect(res.errors[0]?.code).toBe('PLAN_NOT_FOUND');
  });

  it('happy path BSPCE + EMPLOYEE → 0 errors, 0 warnings', async () => {
    mockState.planRow = {
      data: {
        id: 'p',
        plan_type: 'BSPCE',
        pool_size: 10000,
        pool_allocated: 1000,
        company_id: 'c',
      },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'EMPLOYEE', email: 'x@e.com' },
      error: null,
    };

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', validInput);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.hasHardBlocks).toBe(false);
  });

  it('BSPCE + CONSULTANT → 1 ERROR (BSPCE_BENEFICIARY_TYPE), hasHardBlocks=true', async () => {
    mockState.planRow = {
      data: {
        id: 'p',
        plan_type: 'BSPCE',
        pool_size: 10000,
        pool_allocated: 1000,
        company_id: 'c',
      },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'CONSULTANT', email: 'c@e.com' },
      error: null,
    };

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', validInput);
    expect(res.hasHardBlocks).toBe(true);
    expect(res.errors.find((e) => e.code === 'BSPCE_BENEFICIARY_TYPE')).toBeDefined();
  });

  it("STOCK_OPTION + CONSULTANT → ok (BSPCE_BENEFICIARY_TYPE ne s'applique pas)", async () => {
    mockState.planRow = {
      data: {
        id: 'p',
        plan_type: 'STOCK_OPTION',
        pool_size: 10000,
        pool_allocated: 1000,
        company_id: 'c',
      },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'CONSULTANT', email: 'c@e.com' },
      error: null,
    };

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', validInput);
    // BSPCE rule filtrée par appliesTo, et POOL_AVAILABLE / GRANT_DATE_RECENT passent
    expect(res.hasHardBlocks).toBe(false);
  });

  it('pool insuffisant → ERROR POOL_AVAILABLE, hasHardBlocks=true', async () => {
    mockState.planRow = {
      data: { id: 'p', plan_type: 'BSPCE', pool_size: 100, pool_allocated: 50, company_id: 'c' },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'EMPLOYEE', email: 'x@e.com' },
      error: null,
    };

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', { ...validInput, unitsGranted: 200 });
    expect(res.hasHardBlocks).toBe(true);
    expect(res.errors.find((e) => e.code === 'POOL_AVAILABLE')).toBeDefined();
  });

  it("grant_date 35j ago → 1 WARNING soft, hasHardBlocks=false (n'est pas un blocker)", async () => {
    mockState.planRow = {
      data: {
        id: 'p',
        plan_type: 'BSPCE',
        pool_size: 10000,
        pool_allocated: 1000,
        company_id: 'c',
      },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'EMPLOYEE', email: 'x@e.com' },
      error: null,
    };
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', {
      ...validInput,
      grantDate: oldDate.toISOString().slice(0, 10),
    });
    expect(res.hasHardBlocks).toBe(false);
    expect(res.errors).toEqual([]);
    expect(res.warnings.find((w) => w.code === 'GRANT_DATE_RECENT')).toBeDefined();
  });
});

// ===========================================================================
// Module 12.5 B1 — Wiring effectiveParamsByRule + désactivation par org
// ===========================================================================

describe('runComplianceChecks — Module 12.5 B1 effective rules wiring', () => {
  it('GRANT_DATE_RECENT désactivée DB (is_active=false) → pas de warning même à 35j', async () => {
    mockState.planRow = {
      data: {
        id: 'p',
        plan_type: 'BSPCE',
        pool_size: 10000,
        pool_allocated: 1000,
        company_id: 'c',
      },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'EMPLOYEE', email: 'x@e.com' },
      error: null,
    };
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);

    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'GRANT_DATE_RECENT') {
        return makeEffectiveRule('GRANT_DATE_RECENT', {
          is_active: false,
          effective_severity: 'warning',
        });
      }
      return null; // legacy fallback pour les autres
    });

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', {
      ...validInput,
      grantDate: oldDate.toISOString().slice(0, 10),
    });
    expect(res.warnings.find((w) => w.code === 'GRANT_DATE_RECENT')).toBeUndefined();

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });

  it('GRANT_DATE_RECENT param maxDaysAgo=60 → 35j passe (org permissive)', async () => {
    mockState.planRow = {
      data: {
        id: 'p',
        plan_type: 'BSPCE',
        pool_size: 10000,
        pool_allocated: 1000,
        company_id: 'c',
      },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'EMPLOYEE', email: 'x@e.com' },
      error: null,
    };
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);

    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'GRANT_DATE_RECENT') {
        return makeEffectiveRule('GRANT_DATE_RECENT', {
          is_active: true,
          effective_severity: 'warning',
          effective_params: { maxDaysAgo: 60 },
        });
      }
      return null;
    });

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', {
      ...validInput,
      grantDate: oldDate.toISOString().slice(0, 10),
    });
    expect(res.warnings.find((w) => w.code === 'GRANT_DATE_RECENT')).toBeUndefined();

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });

  it('BSPCE_BENEFICIARY_TYPE désactivée → CONSULTANT/BSPCE passe', async () => {
    mockState.planRow = {
      data: {
        id: 'p',
        plan_type: 'BSPCE',
        pool_size: 10000,
        pool_allocated: 1000,
        company_id: 'c',
      },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'CONSULTANT', email: 'c@e.com' },
      error: null,
    };

    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'BSPCE_BENEFICIARY_TYPE') {
        return makeEffectiveRule('BSPCE_BENEFICIARY_TYPE', { is_active: false });
      }
      return null;
    });

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', validInput);
    expect(res.errors.find((e) => e.code === 'BSPCE_BENEFICIARY_TYPE')).toBeUndefined();
    expect(res.hasHardBlocks).toBe(false);

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });

  it('POOL_AVAILABLE désactivée → pool insuffisant ne bloque plus (admin off-switch)', async () => {
    mockState.planRow = {
      data: { id: 'p', plan_type: 'BSPCE', pool_size: 100, pool_allocated: 50, company_id: 'c' },
      error: null,
    };
    mockState.beneficiaryRow = {
      data: { id: 'b', beneficiary_type: 'EMPLOYEE', email: 'x@e.com' },
      error: null,
    };

    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'POOL_AVAILABLE') {
        return makeEffectiveRule('POOL_AVAILABLE', { is_active: false });
      }
      return null;
    });

    const { runComplianceChecks } = await import('../runChecks');
    const res = await runComplianceChecks('AWARD_PROPOSAL', { ...validInput, unitsGranted: 200 });
    expect(res.errors.find((e) => e.code === 'POOL_AVAILABLE')).toBeUndefined();

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });
});

// ===========================================================================
// Module 12.5 B2 — runBeneficiaryComplianceChecks
// ===========================================================================

const validBeneficiaryInput = {
  id: null,
  email: 'jean.dupont@example.com',
  firstName: 'Jean',
  lastName: 'Dupont',
  beneficiaryType: 'EMPLOYEE',
  taxResidence: 'FR',
  isTaxResidentFrance: true,
  hireDate: null as string | null,
};

describe('runBeneficiaryComplianceChecks — Module 12.5 B2 effective rules wiring', () => {
  it('HIRE_DATE_REASONABLE désactivée DB → 1850 passe (admin off-switch)', async () => {
    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'HIRE_DATE_REASONABLE') {
        return makeEffectiveRule('HIRE_DATE_REASONABLE', {
          scope: 'beneficiary',
          is_active: false,
          effective_severity: 'warning',
        });
      }
      return null;
    });

    const { runBeneficiaryComplianceChecks } = await import('../runChecks');
    const res = await runBeneficiaryComplianceChecks(
      { ...validBeneficiaryInput, hireDate: '1850-01-01' },
      'org-uuid',
    );
    expect(res.errors.find((e) => e.code === 'HIRE_DATE_INVALID')).toBeUndefined();

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });

  it('HIRE_DATE_REASONABLE param minYear=1950 → 1949 ERROR HIRE_DATE_INVALID', async () => {
    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'HIRE_DATE_REASONABLE') {
        return makeEffectiveRule('HIRE_DATE_REASONABLE', {
          scope: 'beneficiary',
          is_active: true,
          effective_severity: 'warning',
          effective_params: { minYear: 1950, maxFutureMonths: 3 },
        });
      }
      return null;
    });

    const { runBeneficiaryComplianceChecks } = await import('../runChecks');
    const res = await runBeneficiaryComplianceChecks(
      { ...validBeneficiaryInput, hireDate: '1949-12-31' },
      'org-uuid',
    );
    // Note : la rule HIRE_DATE_REASONABLE est `enforcement: 'soft'`, donc le
    // sub-issue ERROR (HIRE_DATE_INVALID, severity hardcoded #114) atterrit
    // dans `warnings[]` (le runner bucket par enforcement, pas par severity).
    const issue = res.warnings.find((w) => w.code === 'HIRE_DATE_INVALID');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('ERROR');

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });

  // Module 12.5 B4 — runApprovalAwardComplianceChecks désactivation
  it('WORKFLOW_REQUIRED_FOR_AGA désactivée DB → AGA sans workflow passe (dette #14 + override admin)', async () => {
    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'WORKFLOW_REQUIRED_FOR_AGA') {
        return makeEffectiveRule('WORKFLOW_REQUIRED_FOR_AGA', {
          scope: 'approval',
          is_active: false,
          effective_severity: 'error',
        });
      }
      return null;
    });

    const { runApprovalAwardComplianceChecks } = await import('../runChecks');
    const res = await runApprovalAwardComplianceChecks(
      { awardId: 'aw-uuid', planId: 'pl-uuid' },
      'org-uuid',
    );
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });

  it('TAX_RESIDENCE_FRANCE_CONSISTENCY désactivée → UK + isFR=true passe', async () => {
    const effMod = await import('../effectiveRules');
    const loadEff = vi.mocked(effMod.loadEffectiveRule);
    loadEff.mockImplementation(async (code) => {
      if (code === 'TAX_RESIDENCE_FRANCE_CONSISTENCY') {
        return makeEffectiveRule('TAX_RESIDENCE_FRANCE_CONSISTENCY', {
          scope: 'beneficiary',
          is_active: false,
          effective_severity: 'warning',
        });
      }
      return null;
    });

    const { runBeneficiaryComplianceChecks } = await import('../runChecks');
    const res = await runBeneficiaryComplianceChecks(
      { ...validBeneficiaryInput, taxResidence: 'UK', isTaxResidentFrance: true },
      'org-uuid',
    );
    expect(res.errors.find((e) => e.code === 'TAX_RESIDENCE_FRANCE_CONSISTENCY')).toBeUndefined();
    expect(res.warnings.find((w) => w.code === 'TAX_RESIDENCE_FRANCE_CONSISTENCY')).toBeUndefined();

    loadEff.mockReset();
    loadEff.mockResolvedValue(null);
  });
});
