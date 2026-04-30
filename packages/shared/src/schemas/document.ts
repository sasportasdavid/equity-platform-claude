import { z } from 'zod';

/**
 * Module 6 — Schémas Zod pour les documents.
 *
 * `roleInSignatureEnum` reflète le CHECK Module 1 sur signers.role_in_signature
 * (BENEFICIARY / COMPANY_REPRESENTATIVE / BOARD_MEMBER / WITNESS — pas
 * COMPANY_REP).
 */

export const templateCodeEnum = z.enum([
  'BSPCE_GRANT_LETTER',
  'AGA_GRANT_LETTER',
  'SO_GRANT_LETTER',
]);
export type TemplateCodeInput = z.infer<typeof templateCodeEnum>;

export const roleInSignatureEnum = z.enum([
  'BENEFICIARY',
  'COMPANY_REPRESENTATIVE',
  'BOARD_MEMBER',
  'WITNESS',
]);
export type RoleInSignature = z.infer<typeof roleInSignatureEnum>;

export const signingOrderEnum = z.enum(['SEQUENTIAL', 'PARALLEL']);
export type SigningOrderMode = z.infer<typeof signingOrderEnum>;

// ---------------------------------------------------------------------------
// generateAwardDocument
// ---------------------------------------------------------------------------

export const generateAwardDocumentSchema = z.object({
  awardId: z.string().uuid(),
  /** Optional : si non fourni, résolu depuis plan_type via resolveTemplateCodeFromPlanType. */
  templateCode: templateCodeEnum.optional(),
});
export type GenerateAwardDocumentInput = z.infer<typeof generateAwardDocumentSchema>;

// ---------------------------------------------------------------------------
// sendDocumentForSignature (B3 — schemas définis maintenant pour SIGNERS_COMPLETE_INFO compliance)
// ---------------------------------------------------------------------------

export const signerInputSchema = z.object({
  type: roleInSignatureEnum,
  userId: z.string().uuid().optional(),
  beneficiaryId: z.string().uuid().optional(),
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  signingOrder: z.number().int().positive(),
});
export type SignerInput = z.infer<typeof signerInputSchema>;

export const sendDocumentForSignatureSchema = z
  .object({
    documentId: z.string().uuid(),
    signers: z.array(signerInputSchema).min(1).max(10),
    signingOrder: signingOrderEnum.default('SEQUENTIAL'),
    expiryDays: z.number().int().min(1).max(365).default(30),
  })
  .superRefine((data, ctx) => {
    // Au moins 1 signer type=BENEFICIARY
    const hasBene = data.signers.some((s) => s.type === 'BENEFICIARY');
    if (!hasBene) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signers'],
        message: 'Au moins 1 signer doit être de type BENEFICIARY',
      });
    }
    // signingOrder unique
    const orders = data.signers.map((s) => s.signingOrder);
    if (new Set(orders).size !== orders.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signers'],
        message: 'signingOrder doit être unique pour chaque signer',
      });
    }
  });
export type SendDocumentForSignatureInput = z.infer<typeof sendDocumentForSignatureSchema>;

// ---------------------------------------------------------------------------
// cancel + void
// ---------------------------------------------------------------------------

export const cancelSignatureRequestSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});
export type CancelSignatureRequestInput = z.infer<typeof cancelSignatureRequestSchema>;

export const voidDocumentSchema = z.object({
  documentId: z.string().uuid(),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});
export type VoidDocumentInput = z.infer<typeof voidDocumentSchema>;
