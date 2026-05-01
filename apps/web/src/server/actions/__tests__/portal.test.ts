import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Action portal.completeBeneficiaryProfile — Module 8 B2.
 *
 * Couvre :
 *  - Zod validation : reject missing required fields, reject invalid country
 *  - Reject quand auth user n'a PAS de beneficiary record
 *  - Happy path : retourne ok=true + beneficiaryId
 *  - Phone update via RPC est appelé seulement si phone non vide
 *  - Phone vide : pas d'appel RPC
 *  - Audit event tracé avec metadata.from_onboarding=true
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const TEST_USER_ID = '00000000-0000-4000-8000-000000000099';
const TEST_BENE_ID = '11111111-1111-4111-8111-111111111111';
const TEST_ORG_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('@/lib/auth/rbac', () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: TEST_USER_ID,
    email: 'bene@capiwise.local',
    fullName: 'Bene User',
    activeOrgId: TEST_ORG_ID,
    orgIds: [TEST_ORG_ID],
    activeRoles: ['BENEFICIARY'],
  }),
}));

const auditMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit', () => ({ logAuditEvent: (input: unknown) => auditMock(input) }));

const mockState = {
  beneLookup: {
    data: { id: TEST_BENE_ID, org_id: TEST_ORG_ID, first_name: 'Old', last_name: 'Name' } as {
      id: string;
      org_id: string;
      first_name: string;
      last_name: string;
    } | null,
    error: null as unknown,
  },
  beneUpdate: { error: null as unknown },
  userProfileUpdate: { error: null as unknown },
  rpcResult: { error: null as { message: string } | null },
};

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const noop = () => b;
  b.select = noop;
  b.eq = noop;
  b.is = noop;
  b.maybeSingle = () => {
    if (table === 'beneficiaries') return Promise.resolve(mockState.beneLookup);
    return Promise.resolve({ data: null, error: null });
  };
  b.update = () => ({
    eq: () => {
      if (table === 'beneficiaries') return Promise.resolve(mockState.beneUpdate);
      if (table === 'user_profiles') return Promise.resolve(mockState.userProfileUpdate);
      return Promise.resolve({ error: null });
    },
  });
  return b;
}

const rpcMock = vi.fn();
const adminAuthGetUserById = vi
  .fn()
  .mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null });
const adminAuthUpdateUserById = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
    auth: {
      admin: {
        getUserById: (id: string) => adminAuthGetUserById(id),
        updateUserById: (id: string, payload: unknown) => adminAuthUpdateUserById(id, payload),
      },
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      rpc: (name: string, payload: unknown) => rpcMock(name, payload),
    }),
}));

beforeEach(() => {
  mockState.beneLookup = {
    data: { id: TEST_BENE_ID, org_id: TEST_ORG_ID, first_name: 'Old', last_name: 'Name' },
    error: null,
  };
  mockState.beneUpdate = { error: null };
  mockState.userProfileUpdate = { error: null };
  mockState.rpcResult = { error: null };
  rpcMock.mockReset();
  rpcMock.mockImplementation(() => Promise.resolve(mockState.rpcResult));
  auditMock.mockClear();
  adminAuthGetUserById.mockClear();
  adminAuthUpdateUserById.mockClear();
});

const validInput = {
  firstName: 'Alice',
  lastName: 'Martin',
  phone: '',
  addressLine1: '12 rue de Paris',
  addressLine2: '',
  postalCode: '75001',
  city: 'Paris',
  country: 'FR',
};

describe('completeBeneficiaryProfile', () => {
  it('rejects when firstName is missing (Zod)', async () => {
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile({ ...validInput, firstName: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.validationIssues).toBeGreaterThan(0);
  });

  it('rejects when country is not 2 letters', async () => {
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile({ ...validInput, country: 'France' });
    expect(res.ok).toBe(false);
  });

  it('rejects when no beneficiary record found', async () => {
    mockState.beneLookup = { data: null, error: null };
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Aucun bénéficiaire/i);
  });

  it('happy path : ok=true + beneficiaryId, no RPC call when phone empty', async () => {
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile(validInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.beneficiaryId).toBe(TEST_BENE_ID);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls update_beneficiary_self_phone RPC when phone provided', async () => {
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile({
      ...validInput,
      phone: '+33 6 12 34 56 78',
    });
    expect(res.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('update_beneficiary_self_phone', {
      p_phone: '+33 6 12 34 56 78',
    });
  });

  it('skips RPC call when phone is whitespace only', async () => {
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile({ ...validInput, phone: '   ' });
    expect(res.ok).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns RPC error when phone update fails', async () => {
    mockState.rpcResult = { error: { message: 'encryption key missing' } };
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile({ ...validInput, phone: '+33612345678' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/téléphone échouée|encryption/i);
  });

  it('audit event tagged from_onboarding=true with filled_fields', async () => {
    const { completeBeneficiaryProfile } = await import('../portal');
    await completeBeneficiaryProfile({
      ...validInput,
      addressLine2: 'Bât. B',
      phone: '+33612345678',
    });
    expect(auditMock).toHaveBeenCalledTimes(1);
    const [audit] = auditMock.mock.calls[0] as [Record<string, unknown>];
    expect(audit.eventType).toBe('beneficiary.profile_completed');
    const meta = audit.metadata as { filled_fields: string[]; from_onboarding: boolean };
    expect(meta.from_onboarding).toBe(true);
    expect(meta.filled_fields).toContain('first_name');
    expect(meta.filled_fields).toContain('address_line_2');
    expect(meta.filled_fields).toContain('phone_encrypted');
  });

  it('propagates DB update error', async () => {
    mockState.beneUpdate = { error: { message: 'constraint violation' } };
    const { completeBeneficiaryProfile } = await import('../portal');
    const res = await completeBeneficiaryProfile(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/constraint/i);
  });
});
