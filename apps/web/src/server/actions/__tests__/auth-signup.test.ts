import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Action signupWithMagicLink (Bug #1 fix sprint 6 mai 2026 PM).
 *
 * Couvre 4 chemins :
 *   1. Nouveau user → admin.createUser + ensureUserProfile + generateLink + Resend
 *   2. Profil partiel (existe sans membership ACTIVE) → skip createUser, send magic link
 *   3. Profil ACTIVE existant → fake success (anti enumeration) + magic link login
 *   4. Resend fail → ok=false avec error structuré
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
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
  getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: 'https://www.capiwise.fr' }),
}));

vi.mock('@/lib/rate-limit/server', () => ({
  checkRateLimitForCurrentRequest: vi.fn().mockResolvedValue({ allowed: true }),
  formatRateLimitedMessage: vi.fn(() => 'Trop de tentatives. Réessayez plus tard.'),
}));

vi.mock('@/lib/auth/ensure-user-profile', () => ({
  ensureUserProfileExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/rbac', () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: 'user-uuid',
    email: 'test@example.com',
    activeOrgId: 'org-uuid',
  }),
}));

const sendEmailMock = vi.fn();
vi.mock('@/lib/resend/client', () => ({ sendEmail: sendEmailMock }));

// État du mock admin client — réinitialisé via beforeEach
type ProfileRow = { id: string } | null;

const mockAdminState = {
  profile: null as ProfileRow,
  activeMembershipsCount: 0,
  createUserResult: {
    data: {
      user: { id: 'new-user-uuid', email: 'new@example.com' } as {
        id: string;
        email: string;
      } | null,
    },
    error: null as { message: string } | null,
  },
  generateLinkResult: {
    data: { properties: { action_link: 'https://www.capiwise.fr/auth/callback?token=fake' } } as {
      properties?: { action_link?: string };
    } | null,
    error: null as { message: string } | null,
  },
  tosUpdateError: null as { message: string } | null,
};

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockAdminState.profile, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: mockAdminState.tosUpdateError }),
          }),
        };
      }
      if (table === 'memberships') {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  count: mockAdminState.activeMembershipsCount,
                  error: null,
                }),
            }),
          }),
        };
      }
      return {};
    },
    auth: {
      admin: {
        createUser: vi.fn(() => Promise.resolve(mockAdminState.createUserResult)),
        generateLink: vi.fn(() => Promise.resolve(mockAdminState.generateLinkResult)),
      },
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const validInput = {
  email: 'fresh@example.com',
  tosAccepted: true as const,
  tosVersion: '2026-01-01',
};

beforeEach(() => {
  mockAdminState.profile = null;
  mockAdminState.activeMembershipsCount = 0;
  mockAdminState.createUserResult = {
    data: { user: { id: 'new-user-uuid', email: 'fresh@example.com' } },
    error: null,
  };
  mockAdminState.generateLinkResult = {
    data: { properties: { action_link: 'https://www.capiwise.fr/auth/callback?token=fake' } },
    error: null,
  };
  mockAdminState.tosUpdateError = null;
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

describe('signupWithMagicLink (Bug #1 fix Resend serverside)', () => {
  it('chemin nouveau user : createUser + generateLink + sendEmail → ok=true isNewUser=true', async () => {
    mockAdminState.profile = null;

    const { signupWithMagicLink } = await import('../auth');
    const res = await signupWithMagicLink(validInput);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isNewUser).toBe(true);
    }
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fresh@example.com',
        template: 'magic_link_login',
        variables: expect.objectContaining({
          actionLink: expect.stringContaining('https://www.capiwise.fr/auth/callback'),
        }),
      }),
    );
  });

  it('chemin profil partiel (existe sans membership ACTIVE) : skip createUser + sendEmail → ok=true isNewUser=true', async () => {
    mockAdminState.profile = { id: 'existing-partial-uuid' };
    mockAdminState.activeMembershipsCount = 0;

    const { signupWithMagicLink } = await import('../auth');
    const res = await signupWithMagicLink(validInput);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isNewUser).toBe(true);
    }
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('chemin profil ACTIVE existant : fake success isNewUser=false + magic link login', async () => {
    mockAdminState.profile = { id: 'existing-active-uuid' };
    mockAdminState.activeMembershipsCount = 1;

    const { signupWithMagicLink } = await import('../auth');
    const res = await signupWithMagicLink(validInput);

    expect(res.ok).toBe(true);
    if (res.ok) {
      // Anti enumeration : isNewUser=false sans révéler que le compte existe
      expect(res.isNewUser).toBe(false);
    }
    // Mais on envoie quand même un magic link pour que le user puisse se reconnecter
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('Resend fail : ok=false avec error structuré (pas de fake success)', async () => {
    mockAdminState.profile = null;
    sendEmailMock.mockResolvedValue({ ok: false, error: 'Resend rate limit hit' });

    const { signupWithMagicLink } = await import('../auth');
    const res = await signupWithMagicLink(validInput);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Envoi du lien de connexion impossible/i);
    }
  });

  it('admin.generateLink fail : ok=false (pas de mensonge UI)', async () => {
    mockAdminState.profile = null;
    mockAdminState.generateLinkResult = {
      data: null,
      error: { message: 'generate link failure' },
    };

    const { signupWithMagicLink } = await import('../auth');
    const res = await signupWithMagicLink(validInput);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Envoi du lien/i);
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('admin.createUser fail : ok=false avec error remontée', async () => {
    mockAdminState.profile = null;
    mockAdminState.createUserResult = {
      data: { user: null },
      error: { message: 'duplicate email' },
    };

    const { signupWithMagicLink } = await import('../auth');
    const res = await signupWithMagicLink(validInput);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/duplicate email/i);
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('Zod fail (email invalide) : ok=false avec fieldErrors', async () => {
    const { signupWithMagicLink } = await import('../auth');
    const res = await signupWithMagicLink({
      email: 'not-an-email',
      tosAccepted: true as const,
      tosVersion: '2026-01-01',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors).toBeDefined();
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
