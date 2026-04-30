import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Queries approvals — Module 5 B3.
 *
 * Couvre la logique d'agrégation : steps_count, active_requests_count,
 * completed_requests_count, plan attaché, exclusion plans déjà attachés.
 */

const mockState = {
  workflows: [] as Array<{
    id: string;
    name: string;
    description: string | null;
    applies_to: string;
    plan_type_filter: string[] | null;
    is_active: boolean;
    is_default: boolean;
    attach_to_plan_id: string | null;
    created_at: string;
  }>,
  steps: [] as Array<{ workflow_id: string }>,
  requests: [] as Array<{ workflow_id: string; status: string }>,
  plans: [] as Array<{ id: string; name: string; plan_type: string }>,
  attached: [] as Array<{ attach_to_plan_id: string | null }>,
};

function makeChain(table: string) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => builder;
  builder.is = () => builder;
  builder.not = () => builder;
  builder.neq = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  builder.order = () => {
    if (table === 'approval_workflows') {
      return Promise.resolve({ data: mockState.workflows, error: null });
    }
    if (table === 'plans') {
      return Promise.resolve({ data: mockState.plans, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };
  // Pour les select sans .order() : retourne thenable resolved avec data
  builder.then = (resolve: (val: { data: unknown; error: unknown }) => unknown) => {
    if (table === 'approval_workflow_steps')
      return Promise.resolve({ data: mockState.steps, error: null }).then(resolve);
    if (table === 'approval_requests')
      return Promise.resolve({ data: mockState.requests, error: null }).then(resolve);
    if (table === 'plans')
      return Promise.resolve({ data: mockState.plans, error: null }).then(resolve);
    if (table === 'approval_workflows')
      return Promise.resolve({ data: mockState.attached, error: null }).then(resolve);
    return Promise.resolve({ data: null, error: null }).then(resolve);
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => makeChain(table),
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: vi.fn(),
}));

beforeEach(() => {
  mockState.workflows = [];
  mockState.steps = [];
  mockState.requests = [];
  mockState.plans = [];
  mockState.attached = [];
});

describe('listWorkflowsForAdmin', () => {
  it('empty DB → []', async () => {
    const { listWorkflowsForAdmin } = await import('../approvals');
    const res = await listWorkflowsForAdmin();
    expect(res).toEqual([]);
  });

  it('1 workflow + 3 steps + 2 IN_PROGRESS + 1 APPROVED → counts corrects', async () => {
    mockState.workflows = [
      {
        id: 'wf-1',
        name: 'Test',
        description: null,
        applies_to: 'AWARD_GRANT',
        plan_type_filter: null,
        is_active: true,
        is_default: false,
        attach_to_plan_id: null,
        created_at: '2026-01-01',
      },
    ];
    mockState.steps = [{ workflow_id: 'wf-1' }, { workflow_id: 'wf-1' }, { workflow_id: 'wf-1' }];
    mockState.requests = [
      { workflow_id: 'wf-1', status: 'IN_PROGRESS' },
      { workflow_id: 'wf-1', status: 'IN_PROGRESS' },
      { workflow_id: 'wf-1', status: 'APPROVED' },
    ];

    const { listWorkflowsForAdmin } = await import('../approvals');
    const res = await listWorkflowsForAdmin();
    expect(res).toHaveLength(1);
    expect(res[0]?.steps_count).toBe(3);
    expect(res[0]?.active_requests_count).toBe(2);
    expect(res[0]?.completed_requests_count).toBe(1);
    expect(res[0]?.plan).toBeNull();
  });

  it('workflow attaché à un plan → plan injecté', async () => {
    mockState.workflows = [
      {
        id: 'wf-1',
        name: 'Attached',
        description: null,
        applies_to: 'AWARD_GRANT',
        plan_type_filter: null,
        is_active: true,
        is_default: false,
        attach_to_plan_id: 'plan-1',
        created_at: '2026-01-01',
      },
    ];
    mockState.plans = [{ id: 'plan-1', name: 'Plan BSPCE', plan_type: 'BSPCE' }];

    const { listWorkflowsForAdmin } = await import('../approvals');
    const res = await listWorkflowsForAdmin();
    expect(res[0]?.plan?.id).toBe('plan-1');
    expect(res[0]?.plan?.name).toBe('Plan BSPCE');
    expect(res[0]?.plan?.plan_type).toBe('BSPCE');
  });

  it('completed counts ignore CANCELLED + REJECTED + APPROVED ensemble', async () => {
    mockState.workflows = [
      {
        id: 'wf-1',
        name: 'Test',
        description: null,
        applies_to: 'AWARD_GRANT',
        plan_type_filter: null,
        is_active: true,
        is_default: false,
        attach_to_plan_id: null,
        created_at: '2026-01-01',
      },
    ];
    mockState.requests = [
      { workflow_id: 'wf-1', status: 'APPROVED' },
      { workflow_id: 'wf-1', status: 'REJECTED' },
      { workflow_id: 'wf-1', status: 'CANCELLED' },
      { workflow_id: 'wf-1', status: 'IN_PROGRESS' },
    ];

    const { listWorkflowsForAdmin } = await import('../approvals');
    const res = await listWorkflowsForAdmin();
    expect(res[0]?.active_requests_count).toBe(1);
    expect(res[0]?.completed_requests_count).toBe(3);
  });
});

describe('listPlansForWorkflowAttachment', () => {
  it('exclut les plans déjà attachés à un autre workflow', async () => {
    mockState.plans = [
      { id: 'plan-1', name: 'A', plan_type: 'BSPCE' },
      { id: 'plan-2', name: 'B', plan_type: 'AGA' },
      { id: 'plan-3', name: 'C', plan_type: 'BSPCE' },
    ];
    mockState.attached = [{ attach_to_plan_id: 'plan-1' }, { attach_to_plan_id: 'plan-3' }];

    const { listPlansForWorkflowAttachment } = await import('../approvals');
    const res = await listPlansForWorkflowAttachment();
    expect(res.map((p) => p.id)).toEqual(['plan-2']);
  });

  it('aucun plan attaché → tous les plans dispo', async () => {
    mockState.plans = [
      { id: 'plan-1', name: 'A', plan_type: 'BSPCE' },
      { id: 'plan-2', name: 'B', plan_type: 'AGA' },
    ];
    mockState.attached = [];

    const { listPlansForWorkflowAttachment } = await import('../approvals');
    const res = await listPlansForWorkflowAttachment();
    expect(res).toHaveLength(2);
  });
});
