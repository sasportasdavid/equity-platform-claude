import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Action createInvitation (Bug #7 fix sprint 6 mai 2026 PM).
 *
 * Couvre 5 chemins :
 *   1. Happy path team_member → INSERT + Resend ok → success
 *   2. Happy path beneficiary → INSERT + template beneficiary_first_invite
 *   3. Resend fail → ROLLBACK DELETE + success: false explicite
 *   4. Duplicate PENDING → success: false (anti spam)
 *   5. Zod fail (email invalide) → fieldErrors
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn() }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_APP_URL: 'https://www.capiwise.fr',
    RESEND_API_KEY: 'fake-key',
    RESEND_FROM_EMAIL: 'noreply@capiwise.fr',
  }),
}));

vi.mock('@/lib/rate-limit/server', () => ({
  checkRateLimitForCurrentRequest: vi.fn().mockResolvedValue({ allowed: true }),
  formatRateLimitedMessage: vi.fn(() => 'Trop de tentatives'),
}));

vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    id: 'inviter-uuid',
    email: 'admin@capiwise.fr',
    activeOrgId: 'org-uuid',
  }),
}));

const sendEmailMock = vi.fn();
vi.mock('@/lib/resend/client', () => ({ sendEmail: sendEmailMock }));

// État du mock admin — réinitialisé via beforeEach.
const mockAdminState = {
  duplicateCheck: {
    data: null as { id: string } | null,
    error: null as { message: string } | null,
  },
  insertResult: {
    data: { id: 'invite-uuid' } as { id: string } | null,
    error: null as { message: string } | null,
  },
  organizationLookup: {
    data: { name: 'Capiwise' } as { name: string } | null,
    error: null as { message: string } | null,
  },
  deleteResult: { error: null as { message: string } | null },
};

// Spy delete pour vérifier qu'il est bien appelé sur rollback
const deleteSpy = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'invitations') {
        return {
          // duplicate check : .select('id').eq.eq.eq.maybeSingle()
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve(mockAdminState.duplicateCheck),
                }),
              }),
            }),
          }),
          // insert : .insert({...}).select('id').single()
          insert: (_payload: unknown) => ({
            select: () => ({
              single: () => Promise.resolve(mockAdminState.insertResult),
            }),
          }),
          // rollback : .delete().eq()
          delete: () => {
            deleteSpy();
            return {
              eq: () => Promise.resolve({ error: mockAdminState.deleteResult.error }),
            };
          },
        };
      }
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve(mockAdminState.organizationLookup),
              maybeSingle: () => Promise.resolve(mockAdminState.organizationLookup),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const validInputTeam = {
  email: 'newcomer@capiwise.fr',
  roles: ['ADMIN_HR'] as Array<'ADMIN_HR'>,
  message: 'Bienvenue !',
};

const validInputBeneficiary = {
  email: 'beneficiary@capiwise.fr',
  roles: ['BENEFICIARY'] as Array<'BENEFICIARY'>,
};

beforeEach(() => {
  mockAdminState.duplicateCheck = { data: null, error: null };
  mockAdminState.insertResult = { data: { id: 'invite-uuid' }, error: null };
  mockAdminState.organizationLookup = { data: { name: 'Capiwise' }, error: null };
  mockAdminState.deleteResult = { error: null };
  deleteSpy.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({
    ok: true,
    providerMessageId: 'resend-msg-id',
    notificationId: null,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createInvitation (Bug #7 fix Resend rollback)', () => {
  it('happy path team_member : INSERT + sendEmail team_member_invite → success', async () => {
    const { createInvitation } = await import('../invitations');
    const res = await createInvitation(validInputTeam);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.email).toBe(validInputTeam.email);
      expect(res.invitationId).toBe('invite-uuid');
    }
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: validInputTeam.email,
        template: 'team_member_invite',
        variables: expect.objectContaining({
          orgName: 'Capiwise',
          inviterEmail: 'admin@capiwise.fr',
          acceptUrl: expect.stringContaining('https://www.capiwise.fr/accept-invite?token='),
        }),
      }),
    );
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('happy path beneficiary : template beneficiary_first_invite (pas team)', async () => {
    const { createInvitation } = await import('../invitations');
    const res = await createInvitation(validInputBeneficiary);

    expect(res.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'beneficiary_first_invite',
        variables: expect.objectContaining({
          orgName: 'Capiwise',
          acceptUrl: expect.stringContaining('/accept-invite?token='),
        }),
      }),
    );
  });

  it('Resend fail : success=false + DELETE rollback + error explicite', async () => {
    sendEmailMock.mockResolvedValue({
      ok: false,
      error: 'RESEND_FROM_EMAIL is not configured',
    });

    const { createInvitation } = await import('../invitations');
    const res = await createInvitation(validInputTeam);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/Email d'invitation non envoyé/i);
      expect(res.error).toMatch(/RESEND_FROM_EMAIL/);
    }
    // Bug #7 fix : DELETE rollback doit être appelé
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('Resend fail + rollback DELETE fail : retourne success=false quand même', async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: 'Resend down' });
    mockAdminState.deleteResult = { error: { message: 'rollback failed' } };

    const { createInvitation } = await import('../invitations');
    const res = await createInvitation(validInputTeam);

    expect(res.success).toBe(false);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('duplicate PENDING : success=false sans appel Resend ni INSERT', async () => {
    mockAdminState.duplicateCheck = { data: { id: 'existing-uuid' }, error: null };

    const { createInvitation } = await import('../invitations');
    const res = await createInvitation(validInputTeam);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/déjà en cours/i);
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('Zod fail (email invalide) : fieldErrors retourné', async () => {
    const { createInvitation } = await import('../invitations');
    const res = await createInvitation({
      email: 'not-an-email',
      roles: ['ADMIN_HR'],
    } as never);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.fieldErrors).toBeDefined();
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
