import { z } from 'zod';

/**
 * Module 5 — Schémas Zod pour les approbations.
 *
 * Source de vérité pour les enums + schemas createWorkflow,
 * updateWorkflow, recordDecision, cancelRequest.
 *
 * Spec : docs/MODULE_05_APPROVAL_ENGINE.md §4.2.
 */

// ---------------------------------------------------------------------------
// Enums (source de vérité)
// ---------------------------------------------------------------------------

export const approverTypeEnum = z.enum(['ROLE', 'USER', 'ANY_OF_ROLE', 'ALL_OF_ROLE']);
export type ApproverType = z.infer<typeof approverTypeEnum>;

export const stepModeEnum = z.enum(['SEQUENTIAL', 'PARALLEL']);
export type StepMode = z.infer<typeof stepModeEnum>;

export const appliesToEnum = z.enum([
  'AWARD_GRANT',
  'AWARD_MODIFICATION',
  'EXERCISE_REQUEST',
  'PLAN_CREATION',
]);
export type AppliesTo = z.infer<typeof appliesToEnum>;

export const decisionStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'EXPIRED']);
export type DecisionStatus = z.infer<typeof decisionStatusEnum>;

export const requestStatusEnum = z.enum(['IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED']);
export type RequestStatus = z.infer<typeof requestStatusEnum>;

// ---------------------------------------------------------------------------
// workflowStepSchema
// ---------------------------------------------------------------------------

export const workflowStepSchema = z
  .object({
    stepOrder: z.number().int().positive(),
    stepName: z.string().min(1).max(100),
    approverType: approverTypeEnum,
    approverRole: z.string().min(1).max(50).optional(),
    approverUserId: z.string().uuid().optional(),
    mode: stepModeEnum.default('SEQUENTIAL'),
    requiredApprovals: z.number().int().positive().default(1),
    slaHours: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.approverType === 'USER' && !data.approverUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approverUserId'],
        message: 'approverUserId requis quand approverType=USER',
      });
    }
    if (['ROLE', 'ANY_OF_ROLE', 'ALL_OF_ROLE'].includes(data.approverType) && !data.approverRole) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approverRole'],
        message: 'approverRole requis pour ce type',
      });
    }
  });

export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;

// ---------------------------------------------------------------------------
// createWorkflowSchema
// ---------------------------------------------------------------------------

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  appliesTo: appliesToEnum,
  planTypeFilter: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  steps: z.array(workflowStepSchema).min(1).max(10),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;

// ---------------------------------------------------------------------------
// updateWorkflowSchema (partial — tous les champs optionnels)
// ---------------------------------------------------------------------------

export const updateWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  patch: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    appliesTo: appliesToEnum.optional(),
    planTypeFilter: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    steps: z.array(workflowStepSchema).min(1).max(10).optional(),
  }),
});

export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;

// ---------------------------------------------------------------------------
// recordDecisionSchema (used for approveDecision + rejectDecision)
// ---------------------------------------------------------------------------

export const approveDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  comment: z.string().max(2000).optional(),
});

export const rejectDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  comment: z.string().min(10, 'Reject comment must be at least 10 characters').max(2000),
});

export type ApproveDecisionInput = z.infer<typeof approveDecisionSchema>;
export type RejectDecisionInput = z.infer<typeof rejectDecisionSchema>;

// ---------------------------------------------------------------------------
// cancelRequestSchema
// ---------------------------------------------------------------------------

export const cancelRequestSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;

// ---------------------------------------------------------------------------
// attach / detach
// ---------------------------------------------------------------------------

export const attachWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  planId: z.string().uuid(),
});

export type AttachWorkflowInput = z.infer<typeof attachWorkflowSchema>;
