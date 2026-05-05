import { z } from 'zod';
import { ROLES } from '../constants/roles';
import { emailSchema, sirenSchema, uuidSchema } from './common';

/**
 * Schémas Zod pour les Server Actions du Module 2 (identity, members,
 * invitations, organizations, profile).
 */

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const createInvitationSchema = z.object({
  email: emailSchema,
  roles: z.array(z.enum(ROLES)).min(1, 'Au moins un rôle est requis'),
  message: z.string().trim().max(500).optional(),
  beneficiaryId: uuidSchema.optional(),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(128),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const revokeInvitationSchema = z.object({
  invitationId: uuidSchema,
});
export type RevokeInvitationInput = z.infer<typeof revokeInvitationSchema>;

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(200).optional(),
  legalForm: z.enum(['SAS', 'SA', 'SARL', 'SCA', 'SC', 'EURL', 'OTHER']).optional(),
  siren: sirenSchema.optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(200).optional(),
  legalForm: z.enum(['SAS', 'SA', 'SARL', 'SCA', 'SC', 'EURL', 'OTHER']).optional(),
  siren: sirenSchema.optional(),
  defaultCurrency: z.string().length(3).optional(),
  timezone: z.string().min(1).max(50).optional(),
  fiscalYearEndMonth: z.number().int().min(1).max(12).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// ---------------------------------------------------------------------------
// Members (memberships management)
// ---------------------------------------------------------------------------

export const updateMemberRolesSchema = z.object({
  membershipId: uuidSchema,
  roles: z.array(z.enum(ROLES)).min(1, 'Au moins un rôle doit rester'),
});
export type UpdateMemberRolesInput = z.infer<typeof updateMemberRolesSchema>;

export const membershipActionSchema = z.object({
  membershipId: uuidSchema,
});
export type MembershipActionInput = z.infer<typeof membershipActionSchema>;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---------------------------------------------------------------------------
// Module 14 — Signup public (magic-link flow, Option C)
// ---------------------------------------------------------------------------

/**
 * Module 14 PR #43 §B1 — Signup public via magic-link.
 *
 * - `email` : adresse RFC-5322 normalisée (trim + toLowerCase via emailSchema).
 * - `tosAccepted` : DOIT être `true` (checkbox UI). Le `z.literal(true)`
 *   bloque la soumission côté serveur si désactivée par DOM tampering.
 * - `tosVersion` : version ToS acceptée (ex `v1.0-2026-05-05`). Stockée dans
 *   `user_profiles.tos_version_accepted` pour gating re-accept V1.X.
 *
 * **Pas de password** : aligné spec MODULE_02 §1.1 (magic-link only en V1).
 * **Pas de full_name au signup** : capturé à l'étape 1 du wizard onboarding
 * (B2). Garde le formulaire signup minimal (1 input + 1 checkbox) et évite
 * le fingerprinting d'un user déjà inscrit (anti email enumeration).
 */
export const signupWithMagicLinkSchema = z.object({
  email: emailSchema,
  tosAccepted: z.literal(true, {
    message: 'Vous devez accepter les conditions d’utilisation pour continuer.',
  }),
  tosVersion: z.string().trim().min(1).max(50),
});
export type SignupWithMagicLinkInput = z.infer<typeof signupWithMagicLinkSchema>;
