import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Actions — Module 7 B5 hooks.
 *
 * Couvre :
 *  - notifyApproversOfPendingApproval : happy path + 0 approvers + missing award
 *  - notifyCreatorOfApprovalDecision : APPROVED + REJECTED + no creator
 *  - renderPendingNotificationsBatch : happy path + counts filled/failed
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
  html: '<p>html</p>',
  text: 'text',
});
vi.mock('@/lib/resend/render', () => ({
  renderEmailTemplate: (code: string, vars: unknown) => renderEmailTemplateMock(code, vars),
}));

type State = {
  award: unknown;
  plan: unknown;
  creator: unknown;
  decisions: unknown[];
  users: Record<string, unknown>;
  insertResult: { data: unknown; error: unknown };
  updateResult: { error: unknown };
  notifSelectResult: { data: unknown[]; error: unknown };
  notifLookupResult: { data: unknown; error: unknown };
};

const state: State = {
  award: null,
  plan: null,
  creator: null,
  decisions: [],
  users: {},
  insertResult: { data: { id: 'new-notif' }, error: null },
  updateResult: { error: null },
  notifSelectResult: { data: [], error: null },
  notifLookupResult: { data: null, error: null },
};

function tableBuilder(table: string) {
  const handlers: Record<string, () => unknown> = {
    awards: () => state.award,
    plans: () => state.plan,
    user_profiles: () => state.creator,
    approval_decisions: () => state.decisions,
    notifications: () => state.notifSelectResult.data,
  };
  const get = handlers[table] ?? (() => null);

  const b: Record<string, unknown> = {};
  let pendingArrayMode = table === 'approval_decisions';

  b.select = (cols: string) => {
    void cols;
    if (table === 'notifications' && cols.includes('subject')) {
      pendingArrayMode = true;
    }
    return b;
  };
  b.eq = () => b;
  b.is = () => b;
  b.limit = () =>
    Promise.resolve({ data: state.notifSelectResult.data, error: state.notifSelectResult.error });
  b.maybeSingle = () => {
    if (table === 'notifications') {
      return Promise.resolve(state.notifLookupResult);
    }
    return Promise.resolve({ data: get(), error: null });
  };
  b.single = () => Promise.resolve(state.insertResult);
  b.then = (cb: (val: unknown) => unknown) => {
    if (pendingArrayMode) {
      return Promise.resolve({ data: get(), error: null }).then(cb);
    }
    return Promise.resolve({ data: get(), error: null }).then(cb);
  };
  b.insert = () => ({
    select: () => ({ single: () => Promise.resolve(state.insertResult) }),
  });
  b.update = () => ({ eq: () => Promise.resolve(state.updateResult) });
  return b;
}

const getUserByIdMock = vi.fn(async (userId: string) => {
  const u = state.users[userId];
  return { data: u ? { user: u } : { user: null } };
});

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => tableBuilder(table),
    auth: { admin: { getUserById: (uid: string) => getUserByIdMock(uid) } },
    functions: { invoke: vi.fn() },
  }),
}));

beforeEach(() => {
  state.award = null;
  state.plan = null;
  state.creator = null;
  state.decisions = [];
  state.users = {};
  state.insertResult = { data: { id: 'new-notif' }, error: null };
  state.updateResult = { error: null };
  state.notifSelectResult = { data: [], error: null };
  state.notifLookupResult = { data: null, error: null };
  renderEmailTemplateMock.mockClear();
  getUserByIdMock.mockClear();
});

const UUID_AWARD = '00000000-0000-4000-8000-000000000a01';
const UUID_PLAN = '00000000-0000-4000-8000-000000000b01';
const UUID_REQ = '00000000-0000-4000-8000-000000000c01';
const UUID_CREATOR = '00000000-0000-4000-8000-000000000d01';
const UUID_APP1 = '00000000-0000-4000-8000-000000000e01';
const UUID_APP2 = '00000000-0000-4000-8000-000000000e02';
const UUID_APPROVER = '00000000-0000-4000-8000-000000000f01';

describe('notifyApproversOfPendingApproval', () => {
  it('happy path → insère 1 notif EMAIL par approver PENDING', async () => {
    state.award = {
      id: UUID_AWARD,
      award_number: 'AWD-001',
      units_granted: 500,
      org_id: TEST_ORG_ID,
      plan_id: UUID_PLAN,
      created_by: UUID_CREATOR,
    };
    state.plan = { plan_type: 'BSPCE' };
    state.creator = { id: UUID_CREATOR, full_name: 'Marie Créatrice' };
    state.decisions = [{ approver_user_id: UUID_APP1 }, { approver_user_id: UUID_APP2 }];
    state.users = {
      [UUID_APP1]: { id: UUID_APP1, email: 'app1@x.fr', user_metadata: { full_name: 'App One' } },
      [UUID_APP2]: { id: UUID_APP2, email: 'app2@x.fr', user_metadata: { full_name: 'App Two' } },
    };

    const { notifyApproversOfPendingApproval } = await import('../notifications');
    const res = await notifyApproversOfPendingApproval({
      requestId: UUID_REQ,
      awardId: UUID_AWARD,
      appUrl: 'http://localhost:3000',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(2);
    expect(renderEmailTemplateMock).toHaveBeenCalledTimes(2);
    expect(renderEmailTemplateMock).toHaveBeenCalledWith(
      'approval_pending',
      expect.objectContaining({
        recipientName: 'App One',
        awardNumber: 'AWD-001',
        awardUnits: 500,
        awardPlanType: 'BSPCE',
        creatorName: 'Marie Créatrice',
      }),
    );
  });

  it('zéro approver PENDING → ok + created=0 sans render', async () => {
    state.award = {
      id: UUID_AWARD,
      award_number: 'AWD-002',
      units_granted: 100,
      org_id: TEST_ORG_ID,
      plan_id: UUID_PLAN,
      created_by: UUID_CREATOR,
    };
    state.plan = { plan_type: 'AGA' };
    state.creator = { id: UUID_CREATOR, full_name: 'Admin' };
    state.decisions = [];

    const { notifyApproversOfPendingApproval } = await import('../notifications');
    const res = await notifyApproversOfPendingApproval({
      requestId: UUID_REQ,
      awardId: UUID_AWARD,
      appUrl: 'http://localhost:3000',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(0);
    expect(renderEmailTemplateMock).not.toHaveBeenCalled();
  });

  it('award introuvable → error', async () => {
    state.award = null;
    const { notifyApproversOfPendingApproval } = await import('../notifications');
    const res = await notifyApproversOfPendingApproval({
      requestId: UUID_REQ,
      awardId: UUID_AWARD,
      appUrl: 'http://localhost:3000',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Award introuvable');
  });
});

describe('notifyCreatorOfApprovalDecision', () => {
  it('APPROVED → render template approval_approved + insert', async () => {
    state.award = {
      id: UUID_AWARD,
      award_number: 'AWD-100',
      org_id: TEST_ORG_ID,
      created_by: UUID_CREATOR,
    };
    state.users = {
      [UUID_CREATOR]: {
        email: 'creator@x.fr',
        user_metadata: { full_name: 'Marie Créatrice' },
      },
      [UUID_APPROVER]: {
        email: 'approver@x.fr',
        user_metadata: { full_name: 'Bob Approver' },
      },
    };

    const { notifyCreatorOfApprovalDecision } = await import('../notifications');
    const res = await notifyCreatorOfApprovalDecision({
      awardId: UUID_AWARD,
      decision: 'APPROVED',
      approverUserId: UUID_APPROVER,
      reason: null,
      appUrl: 'http://localhost:3000',
    });
    expect(res.ok).toBe(true);
    expect(renderEmailTemplateMock).toHaveBeenCalledWith(
      'approval_approved',
      expect.objectContaining({
        recipientName: 'Marie Créatrice',
        approverName: 'Bob Approver',
        awardNumber: 'AWD-100',
      }),
    );
  });

  it('REJECTED → render approval_rejected + variables.reason', async () => {
    state.award = {
      id: UUID_AWARD,
      award_number: 'AWD-101',
      org_id: TEST_ORG_ID,
      created_by: UUID_CREATOR,
    };
    state.users = {
      [UUID_CREATOR]: { email: 'creator@x.fr', user_metadata: { full_name: 'Marie' } },
      [UUID_APPROVER]: { email: 'approver@x.fr', user_metadata: { full_name: 'Bob' } },
    };

    const { notifyCreatorOfApprovalDecision } = await import('../notifications');
    const res = await notifyCreatorOfApprovalDecision({
      awardId: UUID_AWARD,
      decision: 'REJECTED',
      approverUserId: UUID_APPROVER,
      reason: 'Insuffisant',
      appUrl: 'http://localhost:3000',
    });
    expect(res.ok).toBe(true);
    expect(renderEmailTemplateMock).toHaveBeenCalledWith(
      'approval_rejected',
      expect.objectContaining({ reason: 'Insuffisant' }),
    );
  });

  it('award sans creator → silent skip ok', async () => {
    state.award = {
      id: UUID_AWARD,
      award_number: 'AWD-x',
      org_id: TEST_ORG_ID,
      created_by: null,
    };

    const { notifyCreatorOfApprovalDecision } = await import('../notifications');
    const res = await notifyCreatorOfApprovalDecision({
      awardId: UUID_AWARD,
      decision: 'APPROVED',
      approverUserId: UUID_APPROVER,
      reason: null,
      appUrl: 'http://localhost:3000',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notificationId).toBeNull();
    expect(renderEmailTemplateMock).not.toHaveBeenCalled();
  });
});

describe('renderPendingNotificationsBatch', () => {
  it('happy path → fill chaque orphan + retourne counts', async () => {
    const orphan1 = '00000000-0000-4000-8000-000000000aa1';
    const orphan2 = '00000000-0000-4000-8000-000000000aa2';
    state.notifSelectResult = {
      data: [{ id: orphan1 }, { id: orphan2 }],
      error: null,
    };
    state.notifLookupResult = {
      data: {
        id: orphan1,
        template_code: 'approval_pending',
        channel: 'EMAIL',
        status: 'PENDING',
        variables_used: {
          recipientName: 'X',
          awardNumber: 'A',
          awardUnits: 1,
          awardPlanType: 'BSPCE',
          creatorName: 'C',
          appUrl: 'http://x',
          approvalUrl: 'http://x/a',
        },
      },
      error: null,
    };

    const { renderPendingNotificationsBatch } = await import('../notifications');
    const res = await renderPendingNotificationsBatch({ batchSize: 50 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.filled).toBe(2);
      expect(res.failed).toBe(0);
    }
  });

  it('aucun orphan → filled=0 failed=0', async () => {
    state.notifSelectResult = { data: [], error: null };
    const { renderPendingNotificationsBatch } = await import('../notifications');
    const res = await renderPendingNotificationsBatch({ batchSize: 20 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.filled).toBe(0);
      expect(res.failed).toBe(0);
    }
  });
});
