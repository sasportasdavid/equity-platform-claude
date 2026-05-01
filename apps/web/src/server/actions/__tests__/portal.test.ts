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

type DocumentLookup = {
  id: string;
  status: string;
  storage_bucket: string | null;
  signed_pdf_storage_path: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  org_id: string;
};

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
  documentLookup: {
    data: null as DocumentLookup | null,
    error: null as unknown,
  },
  awardLookup: {
    data: null as { id: string; beneficiary_id: string } | null,
    error: null as unknown,
  },
  signedUrlResult: {
    data: { signedUrl: 'https://storage.example/signed?token=abc' } as { signedUrl: string } | null,
    error: null as { message: string } | null,
  },
};

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const noop = () => b;
  b.select = noop;
  b.eq = noop;
  b.is = noop;
  b.maybeSingle = () => {
    if (table === 'beneficiaries') return Promise.resolve(mockState.beneLookup);
    if (table === 'document_instances') return Promise.resolve(mockState.documentLookup);
    if (table === 'awards') return Promise.resolve(mockState.awardLookup);
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

const createSignedUrlMock = vi.fn();

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
    storage: {
      from: () => ({
        createSignedUrl: (path: string, ttl: number) => createSignedUrlMock(path, ttl),
      }),
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
  mockState.documentLookup = { data: null, error: null };
  mockState.awardLookup = { data: null, error: null };
  mockState.signedUrlResult = {
    data: { signedUrl: 'https://storage.example/signed?token=abc' },
    error: null,
  };
  createSignedUrlMock.mockReset();
  createSignedUrlMock.mockImplementation(() => Promise.resolve(mockState.signedUrlResult));
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

// ---------------------------------------------------------------------------
// getPortalDocumentSignedUrl — Module 8 B3
// ---------------------------------------------------------------------------

const TEST_DOC_ID = '33333333-3333-4333-8333-333333333333';
const TEST_AWARD_ID = '44444444-4444-4444-8444-444444444444';

const SIGNED_DOC: DocumentLookup = {
  id: TEST_DOC_ID,
  status: 'SIGNED',
  storage_bucket: 'documents',
  signed_pdf_storage_path: 'awards/AWD-2026-0007/signed.pdf',
  related_entity_type: 'AWARD',
  related_entity_id: TEST_AWARD_ID,
  org_id: TEST_ORG_ID,
};

describe('getPortalDocumentSignedUrl', () => {
  it('rejects invalid documentId (not uuid)', async () => {
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: 'not-a-uuid' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.validationIssues).toBeGreaterThan(0);
  });

  it('rejects when no beneficiary record', async () => {
    mockState.beneLookup = { data: null, error: null };
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: TEST_DOC_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Aucun bénéficiaire/i);
  });

  it('rejects when document not found', async () => {
    mockState.documentLookup = { data: null, error: null };
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: TEST_DOC_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable/i);
  });

  it('rejects when document org_id mismatch', async () => {
    mockState.documentLookup = {
      data: { ...SIGNED_DOC, org_id: 'other-org' },
      error: null,
    };
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: TEST_DOC_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/organisation/i);
  });

  it('rejects when document not SIGNED', async () => {
    mockState.documentLookup = {
      data: { ...SIGNED_DOC, status: 'GENERATED', signed_pdf_storage_path: null },
      error: null,
    };
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: TEST_DOC_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/non signé|indisponible/i);
  });

  it('rejects when award belongs to a different beneficiary', async () => {
    mockState.documentLookup = { data: SIGNED_DOC, error: null };
    mockState.awardLookup = {
      data: { id: TEST_AWARD_ID, beneficiary_id: 'other-beneficiary-id' },
      error: null,
    };
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: TEST_DOC_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Accès refusé/i);
  });

  it('happy path : ok=true + signedUrl + audit logged', async () => {
    mockState.documentLookup = { data: SIGNED_DOC, error: null };
    mockState.awardLookup = {
      data: { id: TEST_AWARD_ID, beneficiary_id: TEST_BENE_ID },
      error: null,
    };
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: TEST_DOC_ID });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.signedUrl).toMatch(/^https:\/\//);
      expect(res.expiresAt).toBeTruthy();
    }
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      'awards/AWD-2026-0007/signed.pdf',
      expect.any(Number),
    );
    expect(auditMock).toHaveBeenCalled();
    const [auditCall] = auditMock.mock.calls.at(-1) as [Record<string, unknown>];
    expect(auditCall.eventType).toBe('portal.document_downloaded');
  });

  it('propagates Storage error', async () => {
    mockState.documentLookup = { data: SIGNED_DOC, error: null };
    mockState.awardLookup = {
      data: { id: TEST_AWARD_ID, beneficiary_id: TEST_BENE_ID },
      error: null,
    };
    mockState.signedUrlResult = { data: null, error: { message: 'bucket not found' } };
    const { getPortalDocumentSignedUrl } = await import('../portal');
    const res = await getPortalDocumentSignedUrl({ documentId: TEST_DOC_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/bucket/i);
  });
});

// ---------------------------------------------------------------------------
// simulateLeaverScenario — Module 8 B4
// ---------------------------------------------------------------------------

const VALID_SIMULATE_INPUT = {
  awardId: TEST_AWARD_ID,
  leaverType: 'resignation',
  terminationDate: '2027-01-01',
};

const SAMPLE_RPC_RESULT = {
  leaver_type: 'resignation',
  termination_date: '2027-01-01',
  treatment: 'keep_vested',
  units_granted: 1200,
  units_already_vested: 300,
  units_accelerated: 0,
  units_forfeited: 900,
  units_total_after_leave: 300,
  exercise_window_days: 90,
  exercise_deadline: '2027-04-01',
  acceleration_months: 0,
  used_snapshot_fallback: true,
};

describe('simulateLeaverScenario', () => {
  it('rejects invalid awardId (not uuid)', async () => {
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario({
      ...VALID_SIMULATE_INPUT,
      awardId: 'not-a-uuid',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.validationIssues).toBeGreaterThan(0);
  });

  it('rejects invalid date format', async () => {
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario({
      ...VALID_SIMULATE_INPUT,
      terminationDate: '01/01/2027',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.validationIssues).toBeGreaterThan(0);
  });

  it('rejects empty leaverType', async () => {
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario({
      ...VALID_SIMULATE_INPUT,
      leaverType: '',
    });
    expect(res.ok).toBe(false);
  });

  it('happy path : ok=true + result + audit logged', async () => {
    rpcMock.mockImplementationOnce(() => Promise.resolve({ data: SAMPLE_RPC_RESULT, error: null }));
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario(VALID_SIMULATE_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.treatment).toBe('keep_vested');
      expect(res.result.units_already_vested).toBe(300);
    }
    expect(rpcMock).toHaveBeenCalledWith('simulate_leaver_scenario', {
      p_award_id: TEST_AWARD_ID,
      p_leaver_type: 'resignation',
      p_termination_date: '2027-01-01',
    });
    const lastAudit = auditMock.mock.calls.at(-1) as [Record<string, unknown>] | undefined;
    expect(lastAudit?.[0]?.eventType).toBe('portal.leaver_simulated');
  });

  it('translates "Award not found" RPC error to French', async () => {
    rpcMock.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { message: 'Award not found' } }),
    );
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario(VALID_SIMULATE_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable|accès refusé/i);
  });

  it('translates "Not authenticated" RPC error', async () => {
    rpcMock.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { message: 'Not authenticated' } }),
    );
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario(VALID_SIMULATE_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/authentifié/i);
  });

  it('returns error when RPC returns null payload (no data)', async () => {
    rpcMock.mockImplementationOnce(() => Promise.resolve({ data: null, error: null }));
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario(VALID_SIMULATE_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/vide|simulation/i);
  });

  it('handles full_accelerate result correctly (Module 8 B4 migration 00055)', async () => {
    const fullAccelResult = {
      ...SAMPLE_RPC_RESULT,
      treatment: 'full_accelerate',
      units_already_vested: 300,
      units_accelerated: 900,
      units_forfeited: 0,
      units_total_after_leave: 1200,
    };
    rpcMock.mockImplementationOnce(() => Promise.resolve({ data: fullAccelResult, error: null }));
    const { simulateLeaverScenario } = await import('../portal');
    const res = await simulateLeaverScenario({
      ...VALID_SIMULATE_INPUT,
      leaverType: 'company_sale',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.treatment).toBe('full_accelerate');
      expect(res.result.units_accelerated).toBe(900);
      expect(res.result.units_forfeited).toBe(0);
    }
  });
});
