import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Actions beneficiaries — Module 4 B2.
 *
 * Mocks Supabase + requirePermission + audit + compliance pour tester
 * la logique TS sans toucher la DB.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/compliance/runChecks', () => ({
  runBeneficiaryComplianceChecks: vi
    .fn()
    .mockResolvedValue({ errors: [], warnings: [], hasHardBlocks: false }),
}));

const mockState = {
  beneSelect: { data: null as unknown, error: null as unknown },
  insertResult: { data: null as unknown, error: null as unknown },
  updateError: null as unknown,
  rpcResult: { data: null as unknown, error: null as unknown },
  authUser: { data: { user: null as unknown }, error: null as unknown },
};

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const noop = () => builder;
  builder.select = noop;
  builder.eq = noop;
  builder.is = noop;
  builder.not = noop;
  builder.maybeSingle = () =>
    Promise.resolve({ data: mockState.beneSelect.data, error: mockState.beneSelect.error });
  builder.single = () =>
    Promise.resolve({ data: mockState.insertResult.data, error: mockState.insertResult.error });
  builder.insert = noop;
  // update().eq().eq() — chainable + thenable au bout de la chaîne
  const updateChain: Record<string, unknown> = {};
  updateChain.eq = () => updateChain;
  updateChain.then = (resolve: (val: { error: unknown }) => unknown) =>
    Promise.resolve({ error: mockState.updateError }).then(resolve);
  builder.update = () => updateChain;
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: () => makeBuilder(),
    rpc: vi.fn().mockImplementation(() => Promise.resolve(mockState.rpcResult)),
    auth: {
      getUser: vi.fn().mockImplementation(() => Promise.resolve(mockState.authUser)),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

beforeEach(() => {
  mockState.beneSelect = { data: null, error: null };
  mockState.insertResult = { data: null, error: null };
  mockState.updateError = null;
  mockState.rpcResult = { data: null, error: null };
  mockState.authUser = { data: { user: null }, error: null };
});

const validCreate = {
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  beneficiaryType: 'EMPLOYEE' as const,
  country: 'FR',
  taxResidence: 'FR',
  isTaxResidentFrance: true,
};

describe('createBeneficiary', () => {
  it('happy path → ok=true avec id', async () => {
    mockState.insertResult = { data: { id: 'new-bene-uuid' }, error: null };
    const { createBeneficiary } = await import('../beneficiaries');
    const res = await createBeneficiary(validCreate);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBe('new-bene-uuid');
  });

  it('input invalide → ok=false avec validationIssues', async () => {
    const { createBeneficiary } = await import('../beneficiaries');
    const res = await createBeneficiary({ email: 'not-email', firstName: 'X', lastName: 'Y' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.validationIssues).toBeGreaterThan(0);
  });

  it('compliance hard block → ok=false avec complianceIssues', async () => {
    const { runBeneficiaryComplianceChecks } = await import('@/lib/compliance/runChecks');
    vi.mocked(runBeneficiaryComplianceChecks).mockResolvedValueOnce({
      errors: [{ severity: 'ERROR', code: 'EMAIL_UNIQUE_IN_ORG', message: 'Duplicate' }],
      warnings: [],
      hasHardBlocks: true,
    });
    const { createBeneficiary } = await import('../beneficiaries');
    const res = await createBeneficiary(validCreate);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.complianceIssues).toBeDefined();
      expect(res.complianceIssues?.[0]?.code).toBe('EMAIL_UNIQUE_IN_ORG');
    }
  });
});

describe('updateBeneficiary', () => {
  it('patch partiel → ok=true', async () => {
    mockState.beneSelect = {
      data: {
        id: 'bene-uuid',
        email: 'old@example.com',
        first_name: 'Old',
        last_name: 'Name',
        beneficiary_type: 'EMPLOYEE',
        tax_residence_country: 'FR',
        is_tax_resident_france: true,
        hire_date: null,
        manager_id: null,
        iban: null,
      },
      error: null,
    };
    const { updateBeneficiary } = await import('../beneficiaries');
    const res = await updateBeneficiary({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
      patch: { jobTitle: 'Engineer' },
    });
    expect(res.ok).toBe(true);
  });

  it('patch avec défauts schema appliqués (country/taxResidence) → ok=true', async () => {
    // Note : updateBeneficiarySchema = createBeneficiarySchema.partial() préserve
    // les .default() pour country='FR', taxResidence='FR', isTaxResidentFrance=true.
    // Donc patch={} après parsing devient { country, taxResidence, isTaxResidentFrance }.
    mockState.beneSelect = {
      data: {
        id: 'bene-uuid',
        email: 'a@e.com',
        first_name: 'A',
        last_name: 'B',
        beneficiary_type: 'EMPLOYEE',
        tax_residence_country: 'FR',
        is_tax_resident_france: true,
        hire_date: null,
        manager_id: null,
        iban: null,
      },
      error: null,
    };
    const { updateBeneficiary } = await import('../beneficiaries');
    const res = await updateBeneficiary({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
      patch: {},
    });
    expect(res.ok).toBe(true);
  });
});

describe('transitionBeneficiaryLifecycle', () => {
  it('active → on_leave : ok=true', async () => {
    mockState.rpcResult = { data: '12345678-1234-4567-8901-123456789012', error: null };
    const { transitionBeneficiaryLifecycle } = await import('../beneficiaries');
    const res = await transitionBeneficiaryLifecycle({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
      toStatus: 'on_leave',
      reason: 'Test transition vers on_leave',
    });
    expect(res.ok).toBe(true);
  });

  it('terminated sans terminationDate → validation fail', async () => {
    const { transitionBeneficiaryLifecycle } = await import('../beneficiaries');
    const res = await transitionBeneficiaryLifecycle({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
      toStatus: 'terminated',
      reason: 'Test transition vers terminated',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.validationIssues).toBeGreaterThan(0);
  });
});

describe('archiveBeneficiary', () => {
  it('happy path → ok=true', async () => {
    const { archiveBeneficiary } = await import('../beneficiaries');
    const res = await archiveBeneficiary({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
      reason: 'Test archive',
    });
    expect(res.ok).toBe(true);
  });

  it('trigger DB raise (awards actifs) → ok=false avec message FR', async () => {
    mockState.updateError = { message: 'Cannot soft-delete beneficiary with 2 active award(s).' };
    const { archiveBeneficiary } = await import('../beneficiaries');
    const res = await archiveBeneficiary({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
      reason: 'Test',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/awards actifs/);
  });
});

describe('inviteBeneficiary', () => {
  it('happy path : magic link + RPC ok → ok=true avec invitedAt', async () => {
    mockState.beneSelect = {
      data: { id: 'bene-uuid', email: 'invite@example.com', status: 'active' },
      error: null,
    };
    mockState.rpcResult = { data: 'bene-uuid', error: null };
    const { inviteBeneficiary } = await import('../beneficiaries');
    const res = await inviteBeneficiary({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.invitedAt).toBeDefined();
  });

  it('terminated → ok=false', async () => {
    mockState.beneSelect = {
      data: { id: 'bene-uuid', email: 'x@e.com', status: 'terminated' },
      error: null,
    };
    const { inviteBeneficiary } = await import('../beneficiaries');
    const res = await inviteBeneficiary({
      beneficiaryId: '12345678-1234-4567-8901-123456789012',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/terminated/);
  });
});

describe('bulkCreateBeneficiaries', () => {
  it('3 rows valides → created=3', async () => {
    mockState.rpcResult = {
      data: { created: 3, errors: [], created_ids: ['1', '2', '3'] },
      error: null,
    };
    const { bulkCreateBeneficiaries } = await import('../beneficiaries');
    const res = await bulkCreateBeneficiaries({
      rows: [
        { email: 'a@e.com', beneficiaryType: 'EMPLOYEE' },
        { email: 'b@e.com', beneficiaryType: 'EMPLOYEE' },
        { email: 'c@e.com', beneficiaryType: 'EMPLOYEE' },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.created).toBe(3);
      expect(res.errors).toEqual([]);
    }
  });

  it('1 doublon + 2 nouveaux → created=2 + 1 warning', async () => {
    mockState.rpcResult = {
      data: {
        created: 2,
        errors: [
          {
            rowIndex: 0,
            email: 'a@e.com',
            severity: 'WARNING',
            message: 'already exists',
            existing_id: 'old-id',
          },
        ],
        created_ids: ['2', '3'],
      },
      error: null,
    };
    const { bulkCreateBeneficiaries } = await import('../beneficiaries');
    const res = await bulkCreateBeneficiaries({
      rows: [
        { email: 'a@e.com', beneficiaryType: 'EMPLOYEE' },
        { email: 'b@e.com', beneficiaryType: 'EMPLOYEE' },
        { email: 'c@e.com', beneficiaryType: 'EMPLOYEE' },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.created).toBe(2);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]?.severity).toBe('WARNING');
    }
  });

  it('> 500 rows → validation fail (Zod)', async () => {
    const { bulkCreateBeneficiaries } = await import('../beneficiaries');
    const rows = Array.from({ length: 501 }, (_, i) => ({
      email: `test${i}@e.com`,
      beneficiaryType: 'EMPLOYEE' as const,
    }));
    const res = await bulkCreateBeneficiaries({ rows });
    expect(res.ok).toBe(false);
  });
});
