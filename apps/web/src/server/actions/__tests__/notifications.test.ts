import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Actions notifications — Module 7 B2 + B3.
 *
 * Couvre :
 *  - insertManualNotification : happy path, perm/orgId mismatch, template inconnu
 *  - cancelPendingNotification : happy path + edge cases
 *  - triggerNotificationConsumer : invoke EF + propage le résultat
 *
 * Le rendering React-Email réel est mocké (le testing du HTML est dans
 * lib/resend/__tests__/templates.test.ts B2).
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000000';
const TEST_USER_ID = '00000000-0000-4000-8000-000000000099';

vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    id: TEST_USER_ID,
    email: 'admin@capiwise.local',
    fullName: 'Admin User',
    activeOrgId: TEST_ORG_ID,
    orgIds: [TEST_ORG_ID],
    activeRoles: ['OWNER'],
  }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }));

const renderEmailTemplateMock = vi.fn().mockResolvedValue({
  subject: 'Test subject',
  html: '<p>Test body html</p>',
  text: 'Test body text',
});
vi.mock('@/lib/resend/render', () => ({
  renderEmailTemplate: (code: string, vars: unknown) => renderEmailTemplateMock(code, vars),
}));

const mockState = {
  insertResult: { data: { id: 'new-notif-uuid' } as unknown, error: null as unknown },
  notifLookup: { data: null as unknown, error: null as unknown },
  updateResult: { error: null as unknown },
  invokeResult: {
    data: { ok: true, processed: 1, succeeded: 1, failed: 0, duration_ms: 42 } as unknown,
    error: null as unknown,
  },
};

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const noop = () => b;
  b.select = noop;
  b.eq = noop;
  b.maybeSingle = () => Promise.resolve(mockState.notifLookup);
  b.single = () => Promise.resolve(mockState.insertResult);
  b.insert = () => ({
    select: () => ({ single: () => Promise.resolve(mockState.insertResult) }),
  });
  b.update = () => ({ eq: () => Promise.resolve(mockState.updateResult) });
  void table;
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
    functions: {
      invoke: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve({
            data: mockState.invokeResult.data,
            error: mockState.invokeResult.error,
          }),
        ),
    },
  }),
}));

beforeEach(() => {
  mockState.insertResult = { data: { id: 'new-notif-uuid' }, error: null };
  mockState.notifLookup = { data: null, error: null };
  mockState.updateResult = { error: null };
  mockState.invokeResult = {
    data: { ok: true, processed: 1, succeeded: 1, failed: 0, duration_ms: 42 },
    error: null,
  };
  renderEmailTemplateMock.mockClear();
  renderEmailTemplateMock.mockResolvedValue({
    subject: 'Test subject',
    html: '<p>Test body html</p>',
    text: 'Test body text',
  });
});

const validInput = {
  orgId: TEST_ORG_ID,
  templateCode: 'approval_pending' as const,
  channel: 'EMAIL' as const,
  recipientEmail: 'test@capiwise.local',
  userId: TEST_USER_ID,
  variables: {
    recipientName: 'Alice',
    awardNumber: 'AWD-TEST',
    awardUnits: 100,
    awardPlanType: 'BSPCE',
    creatorName: 'Bob',
    appUrl: 'http://localhost:3000',
    approvalUrl: 'http://localhost:3000/x',
  },
};

describe('insertManualNotification', () => {
  it('happy path → ok=true + notificationId', async () => {
    const { insertManualNotification } = await import('../notifications');
    const res = await insertManualNotification(validInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notificationId).toBe('new-notif-uuid');
    expect(renderEmailTemplateMock).toHaveBeenCalledWith('approval_pending', expect.any(Object));
  });

  it('reject : orgId mismatch avec org active', async () => {
    const { insertManualNotification } = await import('../notifications');
    const res = await insertManualNotification({
      ...validInput,
      orgId: '11111111-1111-4111-8111-111111111111',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('orgId mismatch');
  });

  it('reject : templateCode inconnu', async () => {
    const { insertManualNotification } = await import('../notifications');
    const res = await insertManualNotification({ ...validInput, templateCode: 'bogus_template' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.validationIssues).toBeGreaterThan(0);
  });

  it('reject : recipientEmail invalide', async () => {
    const { insertManualNotification } = await import('../notifications');
    const res = await insertManualNotification({ ...validInput, recipientEmail: 'not-an-email' });
    expect(res.ok).toBe(false);
  });

  it('propage erreur insert DB', async () => {
    mockState.insertResult = { data: null, error: { message: 'unique constraint' } };
    const { insertManualNotification } = await import('../notifications');
    const res = await insertManualNotification(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('unique constraint');
  });

  it('propage erreur render', async () => {
    renderEmailTemplateMock.mockRejectedValueOnce(new Error('render KO'));
    const { insertManualNotification } = await import('../notifications');
    const res = await insertManualNotification(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Render template échoué');
  });
});

describe('cancelPendingNotification', () => {
  it('happy path → ok=true', async () => {
    mockState.notifLookup = {
      data: { id: 'n1', status: 'PENDING', org_id: TEST_ORG_ID },
      error: null,
    };
    const { cancelPendingNotification } = await import('../notifications');
    const res = await cancelPendingNotification({
      notificationId: '00000000-0000-4000-8000-000000000001',
    });
    expect(res.ok).toBe(true);
  });

  it('reject : notification introuvable', async () => {
    mockState.notifLookup = { data: null, error: null };
    const { cancelPendingNotification } = await import('../notifications');
    const res = await cancelPendingNotification({
      notificationId: '00000000-0000-4000-8000-000000000001',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('introuvable');
  });

  it('reject : statut autre que PENDING', async () => {
    mockState.notifLookup = {
      data: { id: 'n1', status: 'SENT', org_id: TEST_ORG_ID },
      error: null,
    };
    const { cancelPendingNotification } = await import('../notifications');
    const res = await cancelPendingNotification({
      notificationId: '00000000-0000-4000-8000-000000000001',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('seul PENDING annulable');
  });

  it('reject : org mismatch', async () => {
    mockState.notifLookup = {
      data: { id: 'n1', status: 'PENDING', org_id: 'autre-org' },
      error: null,
    };
    const { cancelPendingNotification } = await import('../notifications');
    const res = await cancelPendingNotification({
      notificationId: '00000000-0000-4000-8000-000000000001',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('autre org');
  });
});

describe('triggerNotificationConsumer', () => {
  it('happy path → propage le résultat de l’EF', async () => {
    const { triggerNotificationConsumer } = await import('../notifications');
    const res = await triggerNotificationConsumer();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.processed).toBe(1);
      expect(res.result.succeeded).toBe(1);
    }
  });

  it('reject : EF invoke error', async () => {
    mockState.invokeResult = { data: null, error: { message: 'EF crashed' } };
    const { triggerNotificationConsumer } = await import('../notifications');
    const res = await triggerNotificationConsumer();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('EF crashed');
  });
});
