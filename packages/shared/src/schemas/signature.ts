import { z } from 'zod';

/**
 * Module Signature (V1.X) — Schemas Zod pour les settings et workflows
 * de signature.
 *
 * Layer A : signature_settings (1 row par org)
 * Layer C : signature_workflows + signature_workflow_signers (multiple par org)
 *
 * Cf docs/MODULE_06_DOCUMENT_ENGINE.md (à étendre V1.X).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const signatureSigningOrderEnum = z.enum(['SEQUENTIAL', 'PARALLEL']);
export type SignatureSigningOrder = z.infer<typeof signatureSigningOrderEnum>;

export const signatureSignerTypeEnum = z.enum(['BENEFICIARY', 'ROLE', 'USER']);
export type SignatureSignerType = z.infer<typeof signatureSignerTypeEnum>;

// ---------------------------------------------------------------------------
// Layer A — signature_settings
// ---------------------------------------------------------------------------

export const updateSignatureSettingsSchema = z.object({
  defaultExpiryDays: z.number().int().min(1).max(90).optional(),
  defaultSigningOrder: signatureSigningOrderEnum.optional(),
  requireOwnerCosigner: z.boolean().optional(),
  reminderDays: z.number().int().min(0).max(30).optional(),
});
export type UpdateSignatureSettingsInput = z.infer<typeof updateSignatureSettingsSchema>;

// ---------------------------------------------------------------------------
// Layer C — signature_workflows
// ---------------------------------------------------------------------------

export const signatureWorkflowSignerSchema = z
  .object({
    signerOrder: z.number().int().positive(),
    signerType: signatureSignerTypeEnum,
    signerRole: z.string().max(50).optional(),
    signerUserId: z.string().uuid().optional(),
    isRequired: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.signerType === 'BENEFICIARY' && (data.signerRole || data.signerUserId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'BENEFICIARY ne doit pas avoir signerRole ni signerUserId',
      });
    }
    if (data.signerType === 'ROLE' && !data.signerRole) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signerRole'],
        message: 'signerRole requis quand signerType=ROLE',
      });
    }
    if (data.signerType === 'USER' && !data.signerUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signerUserId'],
        message: 'signerUserId requis quand signerType=USER',
      });
    }
  });
export type SignatureWorkflowSignerInput = z.infer<typeof signatureWorkflowSignerSchema>;

export const createSignatureWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  appliesPlanTypes: z.array(z.string()).default([]),
  appliesTemplateCodes: z.array(z.string()).default([]),
  expiryDays: z.number().int().min(1).max(90).default(14),
  signingOrder: signatureSigningOrderEnum.default('SEQUENTIAL'),
  reminderDays: z.number().int().min(0).max(30).default(3),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  signers: z.array(signatureWorkflowSignerSchema).min(1).max(10),
});
export type CreateSignatureWorkflowInput = z.infer<typeof createSignatureWorkflowSchema>;

export const updateSignatureWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  patch: createSignatureWorkflowSchema.partial(),
});
export type UpdateSignatureWorkflowInput = z.infer<typeof updateSignatureWorkflowSchema>;

export const deleteSignatureWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
});
export type DeleteSignatureWorkflowInput = z.infer<typeof deleteSignatureWorkflowSchema>;
