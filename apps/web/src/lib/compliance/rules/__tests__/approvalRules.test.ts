import { describe, expect, it } from 'vitest';
import {
  NO_SELF_APPROVAL,
  WORKFLOW_HAS_VALID_STEPS,
  WORKFLOW_REQUIRED_FOR_AGA,
} from '../approvalRules';
import type {
  ApprovalAwardCheckContext,
  ApprovalDecisionCheckContext,
  ApprovalWorkflowCheckContext,
} from '../../types';

// ---------------------------------------------------------------------------
// WORKFLOW_REQUIRED_FOR_AGA
// ---------------------------------------------------------------------------

/**
 * Module 12.5 B4 — `WORKFLOW_REQUIRED_FOR_AGA` promote `enforcement: 'soft' →
 * 'hard'` (résout drift #111). Severity dynamique via `effectiveSeverityByRule`.
 * V1.X = ERROR par défaut (loi française stricte, branche dans transitionAward).
 * Admin peut downgrade à 'warning' via Module 12 settings.
 */
describe('WORKFLOW_REQUIRED_FOR_AGA', () => {
  function ctx(overrides: Partial<ApprovalAwardCheckContext>): ApprovalAwardCheckContext {
    return { plan: null, workflowAttached: false, ...overrides };
  }

  it('AGA sans workflow → ERROR (V1.X hard block, dette #14 résolue)', async () => {
    const issue = await WORKFLOW_REQUIRED_FOR_AGA.check(
      { awardId: 'a', planId: 'p' },
      ctx({ plan: { id: 'p', plan_type: 'AGA' }, workflowAttached: false }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('WORKFLOW_REQUIRED_FOR_AGA');
  });

  it('AGA avec workflow attaché → null', async () => {
    const issue = await WORKFLOW_REQUIRED_FOR_AGA.check(
      { awardId: 'a', planId: 'p' },
      ctx({ plan: { id: 'p', plan_type: 'AGA' }, workflowAttached: true }),
    );
    expect(issue).toBeNull();
  });

  it('BSPCE sans workflow → null (rule ne s’applique pas)', async () => {
    const issue = await WORKFLOW_REQUIRED_FOR_AGA.check(
      { awardId: 'a', planId: 'p' },
      ctx({ plan: { id: 'p', plan_type: 'BSPCE' }, workflowAttached: false }),
    );
    expect(issue).toBeNull();
  });

  it('plan absent → null (pas de check possible)', async () => {
    const issue = await WORKFLOW_REQUIRED_FOR_AGA.check(
      { awardId: 'a', planId: 'p' },
      ctx({ plan: null, workflowAttached: false }),
    );
    expect(issue).toBeNull();
  });

  // Module 12.5 B4 — Severity dynamique
  it('respecte severity DB warning (admin downgrade) — AGA sans workflow → WARNING', async () => {
    const issue = await WORKFLOW_REQUIRED_FOR_AGA.check(
      { awardId: 'a', planId: 'p' },
      ctx({
        plan: { id: 'p', plan_type: 'AGA' },
        workflowAttached: false,
        effectiveSeverityByRule: { WORKFLOW_REQUIRED_FOR_AGA: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('WORKFLOW_REQUIRED_FOR_AGA');
  });

  it('enforcement = hard (Module 12.5 B4 promotion)', () => {
    expect(WORKFLOW_REQUIRED_FOR_AGA.enforcement).toBe('hard');
  });
});

// ---------------------------------------------------------------------------
// NO_SELF_APPROVAL
// ---------------------------------------------------------------------------

describe('NO_SELF_APPROVAL', () => {
  it('approver = creator → ERROR', async () => {
    const issue = await NO_SELF_APPROVAL.check({ decisionId: 'd', approverUserId: 'user-1' }, {
      relatedAward: { id: 'a', created_by: 'user-1' },
    } satisfies ApprovalDecisionCheckContext);
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('NO_SELF_APPROVAL');
  });

  it('approver != creator → null', async () => {
    const issue = await NO_SELF_APPROVAL.check({ decisionId: 'd', approverUserId: 'user-2' }, {
      relatedAward: { id: 'a', created_by: 'user-1' },
    } satisfies ApprovalDecisionCheckContext);
    expect(issue).toBeNull();
  });

  it('award sans created_by → null (pas de check possible)', async () => {
    const issue = await NO_SELF_APPROVAL.check({ decisionId: 'd', approverUserId: 'user-1' }, {
      relatedAward: { id: 'a', created_by: null },
    } satisfies ApprovalDecisionCheckContext);
    expect(issue).toBeNull();
  });

  it('relatedAward null → null (subject non-AWARD)', async () => {
    const issue = await NO_SELF_APPROVAL.check({ decisionId: 'd', approverUserId: 'user-1' }, {
      relatedAward: null,
    } satisfies ApprovalDecisionCheckContext);
    expect(issue).toBeNull();
  });

  it('respecte severity DB warning (Module 12.5 B4)', async () => {
    const issue = await NO_SELF_APPROVAL.check({ decisionId: 'd', approverUserId: 'user-1' }, {
      relatedAward: { id: 'a', created_by: 'user-1' },
      effectiveSeverityByRule: { NO_SELF_APPROVAL: 'warning' },
    } satisfies ApprovalDecisionCheckContext);
    expect(issue?.severity).toBe('WARNING');
  });
});

// ---------------------------------------------------------------------------
// WORKFLOW_HAS_VALID_STEPS
// ---------------------------------------------------------------------------

describe('WORKFLOW_HAS_VALID_STEPS', () => {
  function ctx(
    overrides: Partial<ApprovalWorkflowCheckContext> = {},
  ): ApprovalWorkflowCheckContext {
    return {
      userExistsMap: new Map(),
      roleUserCountMap: new Map(),
      ...overrides,
    };
  }

  it('USER step avec user actif → null', async () => {
    const issue = await WORKFLOW_HAS_VALID_STEPS.check(
      {
        steps: [
          {
            stepOrder: 1,
            approverType: 'USER',
            approverUserId: 'user-1',
            requiredApprovals: 1,
          },
        ],
      },
      ctx({ userExistsMap: new Map([['user-1', true]]) }),
    );
    expect(issue).toBeNull();
  });

  it('USER step avec user inexistant → ERROR', async () => {
    const issue = await WORKFLOW_HAS_VALID_STEPS.check(
      {
        steps: [
          {
            stepOrder: 1,
            approverType: 'USER',
            approverUserId: 'user-1',
            requiredApprovals: 1,
          },
        ],
      },
      ctx({ userExistsMap: new Map([['user-1', false]]) }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('WORKFLOW_HAS_VALID_STEPS');
    expect(issue?.message).toMatch(/user-1/);
  });

  it('ROLE step avec ≥1 user → null', async () => {
    const issue = await WORKFLOW_HAS_VALID_STEPS.check(
      {
        steps: [
          {
            stepOrder: 1,
            approverType: 'ROLE',
            approverRole: 'APPROVER',
            requiredApprovals: 1,
          },
        ],
      },
      ctx({ roleUserCountMap: new Map([['APPROVER', 3]]) }),
    );
    expect(issue).toBeNull();
  });

  it('ROLE step avec 0 user → ERROR', async () => {
    const issue = await WORKFLOW_HAS_VALID_STEPS.check(
      {
        steps: [
          {
            stepOrder: 1,
            approverType: 'ROLE',
            approverRole: 'APPROVER',
            requiredApprovals: 1,
          },
        ],
      },
      ctx({ roleUserCountMap: new Map([['APPROVER', 0]]) }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/aucun user actif avec le rôle APPROVER/);
  });

  it('ROLE step avec users < requiredApprovals → ERROR', async () => {
    const issue = await WORKFLOW_HAS_VALID_STEPS.check(
      {
        steps: [
          {
            stepOrder: 2,
            approverType: 'ROLE',
            approverRole: 'BOARD',
            requiredApprovals: 5,
          },
        ],
      },
      ctx({ roleUserCountMap: new Map([['BOARD', 2]]) }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/2 user.*5 approbations/);
  });

  it('multi-steps, 1er invalid → return l’ERROR du 1er', async () => {
    const issue = await WORKFLOW_HAS_VALID_STEPS.check(
      {
        steps: [
          {
            stepOrder: 1,
            approverType: 'ROLE',
            approverRole: 'NONEXISTENT',
            requiredApprovals: 1,
          },
          {
            stepOrder: 2,
            approverType: 'ROLE',
            approverRole: 'APPROVER',
            requiredApprovals: 1,
          },
        ],
      },
      ctx({ roleUserCountMap: new Map([['APPROVER', 3]]) }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/Step 1/);
  });

  it('respecte severity DB warning (Module 12.5 B4)', async () => {
    const issue = await WORKFLOW_HAS_VALID_STEPS.check(
      {
        steps: [
          {
            stepOrder: 1,
            approverType: 'ROLE',
            approverRole: 'NONEXISTENT',
            requiredApprovals: 1,
          },
        ],
      },
      ctx({
        roleUserCountMap: new Map([['APPROVER', 3]]),
        effectiveSeverityByRule: { WORKFLOW_HAS_VALID_STEPS: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
  });
});
