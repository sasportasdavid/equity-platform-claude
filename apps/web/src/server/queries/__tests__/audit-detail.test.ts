import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests `getAuditEventById` — Module 13 V1.5 PR #41 B4.
 *
 * Mock `createSupabaseServerClient` pour intercepter le `.maybeSingle()` et
 * vérifier que :
 *  - existing event → row complet (incl. before_state/after_state)
 *  - row absent (RLS deny ou inter-org) → null silencieux
 *  - id malformé (non UUID) → null sans round-trip
 *  - error supabase → null silencieux (UI affiche empty state propre)
 */

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

const mockState = {
  result: { data: null as unknown, error: null as unknown },
};

const fromMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => fromMock(table),
  }),
}));

beforeEach(() => {
  mockState.result = { data: null, error: null };
  fromMock.mockReset();
  fromMock.mockImplementation((table: string) => {
    if (table !== 'audit_events') {
      throw new Error(`Unexpected table: ${table}`);
    }
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(mockState.result),
    };
    return builder;
  });
});

describe('getAuditEventById (PR #41 B4)', () => {
  it('existing event → full row mappé en AuditEventDetail', async () => {
    mockState.result = {
      data: {
        id: VALID_UUID,
        org_id: 'org-1',
        user_id: 'user-1',
        user_email: 'admin@capiwise.local',
        event_type: 'award.status_changed',
        resource_type: 'AWARD',
        resource_id: 'award-uuid',
        metadata: { plan_name: 'BSPCE-2026-001' },
        before_state: { status: 'PROPOSED' },
        after_state: { status: 'GRANTED' },
        occurred_at: '2026-05-05T13:44:00Z',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        request_id: 'req_abc123',
      },
      error: null,
    };

    const { getAuditEventById } = await import('../audit-detail');
    const result = await getAuditEventById(VALID_UUID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(VALID_UUID);
    expect(result?.event_type).toBe('award.status_changed');
    expect(result?.before_state).toEqual({ status: 'PROPOSED' });
    expect(result?.after_state).toEqual({ status: 'GRANTED' });
    expect(result?.metadata).toEqual({ plan_name: 'BSPCE-2026-001' });
    expect(result?.ip_address).toBe('192.168.1.1');
    expect(result?.request_id).toBe('req_abc123');
  });

  it('row absent (data null) → null silencieux', async () => {
    mockState.result = { data: null, error: null };
    const { getAuditEventById } = await import('../audit-detail');
    expect(await getAuditEventById(VALID_UUID)).toBeNull();
  });

  it('error supabase (RLS deny ou autre) → null silencieux (pas de throw)', async () => {
    mockState.result = {
      data: null,
      error: { message: 'permission denied for table audit_events', code: '42501' },
    };
    const { getAuditEventById } = await import('../audit-detail');
    expect(await getAuditEventById(VALID_UUID)).toBeNull();
  });

  it('id malformé (non-UUID) → null sans round-trip Supabase', async () => {
    const { getAuditEventById } = await import('../audit-detail');
    expect(await getAuditEventById('foo')).toBeNull();
    expect(await getAuditEventById('')).toBeNull();
    expect(await getAuditEventById('11111111-2222-3333-4444')).toBeNull();
    // Aucun appel à fromMock car validation pré-call.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('metadata null en DB → mappé en {} (jamais null sur le DTO)', async () => {
    mockState.result = {
      data: {
        id: VALID_UUID,
        org_id: 'org-1',
        user_id: null,
        user_email: null,
        event_type: 'auth.login_success',
        resource_type: null,
        resource_id: null,
        metadata: null,
        before_state: null,
        after_state: null,
        occurred_at: '2026-05-05T13:44:00Z',
        ip_address: null,
        user_agent: null,
        request_id: null,
      },
      error: null,
    };
    const { getAuditEventById } = await import('../audit-detail');
    const result = await getAuditEventById(VALID_UUID);
    expect(result?.metadata).toEqual({});
    expect(result?.before_state).toBeNull();
    expect(result?.after_state).toBeNull();
  });
});
