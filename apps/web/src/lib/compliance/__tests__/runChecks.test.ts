import { beforeEach, describe, expect, it, vi } from 'vitest';
// Mock global de `server-only` configuré dans vitest.setup.ts

/**
 * Tests `runComplianceChecks` — Module 3b B7.
 *
 * Mock Supabase via le pattern utilisé dans les autres Server Action tests
 * (apps/web/src/server/actions/__tests__/awards.test.ts).
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
  }),
}));

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
