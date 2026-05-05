/**
 * Registry typé de tous les templates email Capiwise.
 *
 * Module 2 a posé les 5 premiers templates (magic_link_login,
 * team_member_invite, beneficiary_first_invite, invitation_revoked,
 * org_role_changed).
 *
 * Module 7 B2 ajoute les 4 templates du workflow d'approbation et de
 * la signature : approval_pending, approval_approved, approval_rejected,
 * award_granted.
 *
 * Module 9 B5 ajoute les 5 templates du workflow d'exercice :
 * exercise_request_submitted/approved/rejected, exercise_payment_confirmed,
 * exercise_request_cancelled_by_admin.
 *
 * Les `code` keys ici matchent les `notification_templates.code` seedés
 * en migrations 00003 (Module 1, UPPERCASE deprecated V2), 00045
 * (Module 7 lowercase EMAIL fr-FR) et 00068 (Module 9 B5 exercises).
 */

import { ApprovalApproved, type ApprovalApprovedProps } from './ApprovalApproved';
import { ApprovalPending, type ApprovalPendingProps } from './ApprovalPending';
import { ApprovalRejected, type ApprovalRejectedProps } from './ApprovalRejected';
import { AwardGranted, type AwardGrantedProps } from './AwardGranted';
import { BeneficiaryFirstInvite, type BeneficiaryFirstInviteProps } from './BeneficiaryFirstInvite';
import {
  ExercisePaymentConfirmed,
  type ExercisePaymentConfirmedProps,
} from './ExercisePaymentConfirmed';
import {
  ExerciseRequestApproved,
  type ExerciseRequestApprovedProps,
} from './ExerciseRequestApproved';
import {
  ExerciseRequestCancelledByAdmin,
  type ExerciseRequestCancelledByAdminProps,
} from './ExerciseRequestCancelledByAdmin';
import {
  ExerciseRequestRejected,
  type ExerciseRequestRejectedProps,
} from './ExerciseRequestRejected';
import {
  ExerciseRequestSubmitted,
  type ExerciseRequestSubmittedProps,
} from './ExerciseRequestSubmitted';
import {
  InvitationExpiredRenotify,
  type InvitationExpiredRenotifyProps,
} from './InvitationExpiredRenotify';
import { InvitationRevoked, type InvitationRevokedProps } from './InvitationRevoked';
import { MagicLinkLogin, type MagicLinkLoginProps } from './MagicLinkLogin';
import { OrgRoleChanged, type OrgRoleChangedProps } from './OrgRoleChanged';
import { TeamMemberInvite, type TeamMemberInviteProps } from './TeamMemberInvite';

export type TemplateMap = {
  // Module 2 (existing)
  magic_link_login: MagicLinkLoginProps;
  team_member_invite: TeamMemberInviteProps;
  beneficiary_first_invite: BeneficiaryFirstInviteProps;
  invitation_revoked: InvitationRevokedProps;
  invitation_expired_renotify: InvitationExpiredRenotifyProps;
  org_role_changed: OrgRoleChangedProps;
  // Module 7 B2
  approval_pending: ApprovalPendingProps;
  approval_approved: ApprovalApprovedProps;
  approval_rejected: ApprovalRejectedProps;
  award_granted: AwardGrantedProps;
  // Module 9 B5 (new)
  exercise_request_submitted: ExerciseRequestSubmittedProps;
  exercise_request_approved: ExerciseRequestApprovedProps;
  exercise_request_rejected: ExerciseRequestRejectedProps;
  exercise_payment_confirmed: ExercisePaymentConfirmedProps;
  exercise_request_cancelled_by_admin: ExerciseRequestCancelledByAdminProps;
};

export type TemplateCode = keyof TemplateMap;

type TemplateEntry<K extends TemplateCode> = {
  Component: (props: TemplateMap[K]) => React.ReactElement;
  subject: (props: TemplateMap[K]) => string;
};

export const TEMPLATES: { [K in TemplateCode]: TemplateEntry<K> } = {
  magic_link_login: {
    Component: MagicLinkLogin,
    subject: MagicLinkLogin.subject,
  },
  team_member_invite: {
    Component: TeamMemberInvite,
    subject: TeamMemberInvite.subject,
  },
  beneficiary_first_invite: {
    Component: BeneficiaryFirstInvite,
    subject: BeneficiaryFirstInvite.subject,
  },
  invitation_revoked: {
    Component: InvitationRevoked,
    subject: InvitationRevoked.subject,
  },
  invitation_expired_renotify: {
    Component: InvitationExpiredRenotify,
    subject: InvitationExpiredRenotify.subject,
  },
  org_role_changed: {
    Component: OrgRoleChanged,
    subject: OrgRoleChanged.subject,
  },
  approval_pending: {
    Component: ApprovalPending,
    subject: ApprovalPending.subject,
  },
  approval_approved: {
    Component: ApprovalApproved,
    subject: ApprovalApproved.subject,
  },
  approval_rejected: {
    Component: ApprovalRejected,
    subject: ApprovalRejected.subject,
  },
  award_granted: {
    Component: AwardGranted,
    subject: AwardGranted.subject,
  },
  exercise_request_submitted: {
    Component: ExerciseRequestSubmitted,
    subject: ExerciseRequestSubmitted.subject,
  },
  exercise_request_approved: {
    Component: ExerciseRequestApproved,
    subject: ExerciseRequestApproved.subject,
  },
  exercise_request_rejected: {
    Component: ExerciseRequestRejected,
    subject: ExerciseRequestRejected.subject,
  },
  exercise_payment_confirmed: {
    Component: ExercisePaymentConfirmed,
    subject: ExercisePaymentConfirmed.subject,
  },
  exercise_request_cancelled_by_admin: {
    Component: ExerciseRequestCancelledByAdmin,
    subject: ExerciseRequestCancelledByAdmin.subject,
  },
};

/**
 * Sous-ensemble des codes templates introduits par Module 7 B2 (workflow
 * approval + signature). Pratique pour restreindre les schémas Zod ou
 * les UI sandbox aux seuls templates Module 7.
 */
export const MODULE_7_TEMPLATE_CODES = [
  'approval_pending',
  'approval_approved',
  'approval_rejected',
  'award_granted',
  'team_member_invite',
  'beneficiary_first_invite',
] as const satisfies readonly TemplateCode[];

export type Module7TemplateCode = (typeof MODULE_7_TEMPLATE_CODES)[number];

/**
 * Sous-ensemble des codes templates Module 9 B5 (workflow exercise).
 */
export const MODULE_9_TEMPLATE_CODES = [
  'exercise_request_submitted',
  'exercise_request_approved',
  'exercise_request_rejected',
  'exercise_payment_confirmed',
  'exercise_request_cancelled_by_admin',
] as const satisfies readonly TemplateCode[];

export type Module9TemplateCode = (typeof MODULE_9_TEMPLATE_CODES)[number];
