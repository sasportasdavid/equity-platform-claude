import { z } from 'zod';

/**
 * Module 4 — Schémas Zod pour les bénéficiaires.
 *
 * Source de vérité pour les enums + schemas createBeneficiary,
 * updateBeneficiary, bulkBeneficiaryRow, lifecycleTransition,
 * selfUpdateBeneficiary.
 *
 * Spec : docs/MODULE_04_BENEFICIARIES_MANAGEMENT.md §4.2.
 */

// ---------------------------------------------------------------------------
// Enums (source de vérité)
// ---------------------------------------------------------------------------

/**
 * Type de bénéficiaire — aligné avec la DB (UPPERCASE) :
 * EMPLOYEE / OFFICER / CONSULTANT / ADVISOR / OTHER.
 *
 * NB : la spec §4.2 propose un enum lowercase (employee/consultant/...) mais
 * la DB cloud utilise UPPERCASE (cf. beneficiaries_beneficiary_type_check).
 * On adopte UPPERCASE pour éviter une autre migration de case + maintenir la
 * cohérence avec Module 3b.
 */
export const beneficiaryTypeEnum = z.enum([
  'EMPLOYEE',
  'OFFICER',
  'CONSULTANT',
  'ADVISOR',
  'OTHER',
]);
export type BeneficiaryTypeInput = z.infer<typeof beneficiaryTypeEnum>;

export const contractTypeEnum = z.enum([
  'CDI',
  'CDD',
  'STAGE',
  'ALTERNANCE',
  'CONSULTANT',
  'MANDATAIRE_SOCIAL',
  'AUTRE',
]);
export type ContractType = z.infer<typeof contractTypeEnum>;

/**
 * Lifecycle status — Module 4 lowercase (migré depuis ACTIVE/FORMER/ARCHIVED).
 */
export const lifecycleStatusEnum = z.enum(['active', 'on_leave', 'terminated']);
export type LifecycleStatus = z.infer<typeof lifecycleStatusEnum>;

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(isoDateRegex, 'Format YYYY-MM-DD requis');

// ---------------------------------------------------------------------------
// createBeneficiarySchema
// ---------------------------------------------------------------------------
export const createBeneficiarySchema = z.object({
  email: z.string().email().toLowerCase(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  preferredName: z.string().max(100).optional(),
  beneficiaryType: beneficiaryTypeEnum,
  contractType: contractTypeEnum.optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  managerId: z.string().uuid().nullable().optional(),

  // Adresse
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().length(2).default('FR'),

  // Fiscalité
  taxResidence: z.string().length(2).default('FR'),
  isTaxResidentFrance: z.boolean().default(true),
  taxId: z.string().max(50).optional(),

  // Contrat
  hireDate: isoDate.optional(),

  // Banking (optionnel V1)
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),
  bankName: z.string().max(100).optional(),
  bankAccountHolderName: z.string().max(200).optional(),

  // Phone & gender
  phone: z.string().max(30).optional(),
  gender: z.enum(['M', 'F', 'X']).nullable().optional(),
});
export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;

export const updateBeneficiarySchema = createBeneficiarySchema.partial();
export type UpdateBeneficiaryInput = z.infer<typeof updateBeneficiarySchema>;

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------
export const bulkBeneficiaryRowSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  beneficiaryType: beneficiaryTypeEnum,
  contractType: contractTypeEnum.optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  taxResidence: z.string().length(2).default('FR'),
  isTaxResidentFrance: z.boolean().default(true),
  hireDate: isoDate.optional(),
});
export type BulkBeneficiaryRow = z.infer<typeof bulkBeneficiaryRowSchema>;

export const bulkBeneficiaryImportSchema = z.object({
  rows: z.array(bulkBeneficiaryRowSchema).min(1).max(500),
});
export type BulkBeneficiaryImportInput = z.infer<typeof bulkBeneficiaryImportSchema>;

// ---------------------------------------------------------------------------
// Lifecycle transition
// ---------------------------------------------------------------------------
export const lifecycleTransitionSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    toStatus: lifecycleStatusEnum,
    reason: z.string().min(10).max(500),
    terminationDate: isoDate.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.toStatus === 'terminated' && !data.terminationDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['terminationDate'],
        message: "La date de termination est requise pour passer un bénéficiaire en 'terminated'",
      });
    }
  });
export type LifecycleTransitionInput = z.infer<typeof lifecycleTransitionSchema>;

// ---------------------------------------------------------------------------
// Self-service (le bénéficiaire modifie son propre profil)
// ---------------------------------------------------------------------------
export const selfUpdateBeneficiarySchema = z.object({
  phone: z.string().max(30).optional(),
  preferredName: z.string().max(100).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),
  bankName: z.string().max(100).optional(),
  bankAccountHolderName: z.string().max(200).optional(),
});
export type SelfUpdateBeneficiaryInput = z.infer<typeof selfUpdateBeneficiarySchema>;

// ---------------------------------------------------------------------------
// Archive (delete soft)
// ---------------------------------------------------------------------------
export const archiveBeneficiarySchema = z.object({
  beneficiaryId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
export type ArchiveBeneficiaryInput = z.infer<typeof archiveBeneficiarySchema>;
