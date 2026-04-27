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
