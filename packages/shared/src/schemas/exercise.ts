/**
 * Module 9 B3 — Schémas Zod pour les exercise_requests (portail).
 *
 * Source de vérité pour les Server Actions exposées dans
 * `apps/web/src/app/portal/exercises/*` et
 * `apps/web/src/app/portal/awards/[id]/exercise/new`.
 *
 * Référence : docs/MODULE_09_EXERCISE_WORKFLOW.md §5-6.
 */

import { z } from 'zod';

/**
 * Statuts de l'exercise_request, alignés sur le CHECK DB Module 9 B1.
 */
export const exerciseRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SIGNED',
  'CANCELLED',
  'COMPLETED',
]);

export type ExerciseRequestStatus = z.infer<typeof exerciseRequestStatusSchema>;

/**
 * Méthodes de paiement V1 (forfait, libre côté admin).
 */
export const paymentMethodSchema = z.enum(['BANK_TRANSFER', 'CHECK', 'OTHER']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

const dateLike = z
  .union([z.date(), z.string().datetime()])
  .transform((val) => (val instanceof Date ? val : new Date(val)));

/**
 * Input du form portail — création d'une demande d'exercice.
 *
 * `cessionToggle` à true active un mode "cession concomitante" qui
 * pré-remplit la simulation fiscale avec un prix de cession et une
 * date de cession explicites. Sinon la simulation considère exercice
 * seul (cessionDate = exerciseDate, FMV = strike).
 *
 * Le snapshot fiscal complet (TaxBreakdown sérialisable) est attendu
 * en `taxSnapshot`. Server Action recalcule pour vérifier cohérence.
 */
export const createExerciseRequestInputSchema = z
  .object({
    awardId: z.string().uuid(),
    unitsToExercise: z.number().int().positive(),

    cessionToggle: z.boolean(),
    cessionDate: dateLike.optional(),
    cessionPricePerUnit: z.number().nonnegative().optional(),

    paymentMethod: paymentMethodSchema.default('BANK_TRANSFER'),
    beneficiaryNotes: z.string().max(2000).optional(),

    /** Snapshot fiscal calculé côté client. Server vérifie. */
    taxSnapshot: z.unknown().optional(),
  })
  .refine(
    (data) => {
      // Si cessionToggle ON, on attend cessionDate + cessionPricePerUnit
      if (data.cessionToggle) {
        return data.cessionDate !== undefined && data.cessionPricePerUnit !== undefined;
      }
      return true;
    },
    {
      message: 'Cession concomitante : cessionDate et cessionPricePerUnit sont requis',
      path: ['cessionToggle'],
    },
  );

export type CreateExerciseRequestInput = z.input<typeof createExerciseRequestInputSchema>;
export type CreateExerciseRequestParsed = z.output<typeof createExerciseRequestInputSchema>;

/**
 * Input pour annuler sa demande (bénéficiaire propriétaire).
 */
export const cancelExerciseRequestInputSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type CancelExerciseRequestInput = z.infer<typeof cancelExerciseRequestInputSchema>;

/**
 * Représentation d'une exercise_request côté UI portail (subset des
 * colonnes DB nécessaires aux pages liste + détail).
 */
export const exerciseRequestSummarySchema = z.object({
  id: z.string().uuid(),
  request_number: z.string().nullable(),
  status: exerciseRequestStatusSchema,
  award_id: z.string().uuid(),
  units_to_exercise: z.number().int().positive(),
  exercise_price_per_unit: z.number().nonnegative(),
  total_exercise_amount: z.number().nullable(),
  fmv_per_unit_at_request: z.number().nullable(),
  payment_method: z.string().nullable(),
  requested_at: z.string(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
});

export type ExerciseRequestSummary = z.infer<typeof exerciseRequestSummarySchema>;
