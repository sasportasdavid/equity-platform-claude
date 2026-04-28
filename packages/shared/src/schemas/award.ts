import { z } from 'zod';

/**
 * Module 3b — Schémas Zod pour le lifecycle des awards.
 *
 * Source de vérité pour le type `AwardStatus` (16 états). La state machine
 * `apps/web/src/lib/stateMachines/awardStateMachine.ts` ré-exporte ce type
 * pour éviter d'avoir 2 sources concurrentes.
 *
 * Spec : docs/MODULE_03B_AWARDS_LIFECYCLE.md §2 et §5.
 */

// ---------------------------------------------------------------------------
// AwardStatus enum + Zod schema (single source of truth)
// ---------------------------------------------------------------------------

export const AWARD_STATUS_VALUES = [
  'DRAFT',
  'PROPOSED',
  'PENDING_APPROVAL',
  'APPROVED',
  'PENDING_BOARD',
  'BOARD_APPROVED',
  'PENDING_SIGNATURE',
  'GRANTED',
  'VESTING',
  'PARTIALLY_VESTED',
  'FULLY_VESTED',
  'PARTIALLY_EXERCISED',
  'FULLY_EXERCISED',
  'EXPIRED',
  'FORFEITED',
  'CANCELLED',
] as const;

export const awardStatusSchema = z.enum(AWARD_STATUS_VALUES);
export type AwardStatus = z.infer<typeof awardStatusSchema>;

// ---------------------------------------------------------------------------
// Date regex commune (YYYY-MM-DD)
// ---------------------------------------------------------------------------
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(isoDateRegex, 'Format YYYY-MM-DD requis');
const isoDateOptional = isoDate.optional();

// ---------------------------------------------------------------------------
// createAwardSchema (§5.2) — input pour createAwardDraft + transitionAward
//   superRefine : vesting_start_date >= grant_date, expiry_date > grant_date
// ---------------------------------------------------------------------------
export const createAwardSchema = z
  .object({
    planId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    unitsGranted: z.number().int().positive().max(1_000_000_000),
    exercisePrice: z.number().nonnegative().nullable().optional(),
    grantDate: isoDate,
    vestingStartDate: isoDateOptional,
    expiryDate: isoDateOptional,
    acceptanceDeadline: isoDateOptional,
    initialStatus: z.enum(['DRAFT', 'PROPOSED']).default('DRAFT'),
  })
  .superRefine((data, ctx) => {
    if (data.vestingStartDate && data.grantDate && data.vestingStartDate < data.grantDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vestingStartDate'],
        message: "La date de début de vesting doit être ≥ date d'attribution",
      });
    }
    if (data.expiryDate && data.grantDate && data.expiryDate <= data.grantDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiryDate'],
        message: "La date d'expiration doit être > date d'attribution",
      });
    }
  });

export type CreateAwardInput = z.infer<typeof createAwardSchema>;

// updateAwardDraftSchema : partial sans initialStatus (le draft reste DRAFT)
// + sans superRefine (les checks cross-field s'appliquent au PROPOSED)
export const updateAwardDraftSchema = z
  .object({
    beneficiaryId: z.string().uuid().optional(),
    unitsGranted: z.number().int().positive().max(1_000_000_000).optional(),
    exercisePrice: z.number().nonnegative().nullable().optional(),
    grantDate: isoDateOptional,
    vestingStartDate: isoDateOptional,
    expiryDate: isoDateOptional,
    acceptanceDeadline: isoDateOptional,
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Aucun champ à mettre à jour' });

export type UpdateAwardDraftInput = z.infer<typeof updateAwardDraftSchema>;

// ---------------------------------------------------------------------------
// Bulk import (§5.3)
// ---------------------------------------------------------------------------
export const bulkAwardRowSchema = z.object({
  beneficiaryEmail: z.string().email(),
  beneficiaryFullName: z.string().min(1).max(200),
  beneficiaryType: z.enum(['employee', 'consultant', 'dirigeant', 'external']),
  unitsGranted: z.number().int().positive(),
  exercisePrice: z.number().nonnegative().optional(),
  grantDate: isoDate,
  vestingStartDate: isoDateOptional,
});

export type BulkAwardRow = z.infer<typeof bulkAwardRowSchema>;

export const bulkAwardImportSchema = z.object({
  planId: z.string().uuid(),
  rows: z.array(bulkAwardRowSchema).min(1).max(500),
});

export type BulkAwardImportInput = z.infer<typeof bulkAwardImportSchema>;

// ---------------------------------------------------------------------------
// State machine inputs
// ---------------------------------------------------------------------------
export const transitionAwardSchema = z.object({
  awardId: z.string().uuid(),
  toStatus: awardStatusSchema,
  reason: z.string().max(500).optional(),
});
export type TransitionAwardInput = z.infer<typeof transitionAwardSchema>;

export const cancelAwardSchema = z.object({
  awardId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
export type CancelAwardInput = z.infer<typeof cancelAwardSchema>;

export const forfeitAwardSchema = z.object({
  awardId: z.string().uuid(),
  leaverType: z.enum([
    'resignation',
    'termination_cause',
    'termination_no_cause',
    'death',
    'retirement',
    'company_sale',
    'mutual_agreement',
    'end_of_contract',
  ]),
  eventDate: isoDate,
  reason: z.string().max(500).optional(),
});
export type ForfeitAwardInput = z.infer<typeof forfeitAwardSchema>;

// ---------------------------------------------------------------------------
// IFRS 2.27-28 modifications
// ---------------------------------------------------------------------------
export const AWARD_MODIFICATION_TYPES = [
  'REPRICING',
  'EXTENSION',
  'ACCELERATION',
  'ADDITIONAL_GRANT',
  'CANCELLATION',
] as const;

export const createModificationSchema = z.object({
  awardId: z.string().uuid(),
  type: z.enum(AWARD_MODIFICATION_TYPES),
  changes: z.record(z.string(), z.unknown()),
  reason: z.string().min(1).max(500),
  effectiveDate: isoDate.optional(),
});
export type CreateModificationInput = z.infer<typeof createModificationSchema>;
