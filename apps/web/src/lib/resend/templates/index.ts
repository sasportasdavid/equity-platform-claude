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
 * Les `code` keys ici matchent les `notification_templates.code` seedés
 * en migrations 00003 (Module 1, UPPERCASE deprecated V2) et 00045
 * (Module 7 lowercase EMAIL fr-FR).
 */

import { ApprovalApproved, type ApprovalApprovedProps } from './ApprovalApproved';
import { ApprovalPending, type ApprovalPendingProps } from './ApprovalPending';
import { ApprovalRejected, type ApprovalRejectedProps } from './ApprovalRejected';
import { AwardGranted, type AwardGrantedProps } from './AwardGranted';
import { BeneficiaryFirstInvite, type BeneficiaryFirstInviteProps } from './BeneficiaryFirstInvite';
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
  org_role_changed: OrgRoleChangedProps;
  // Module 7 B2 (new)
  approval_pending: ApprovalPendingProps;
  approval_approved: ApprovalApprovedProps;
  approval_rejected: ApprovalRejectedProps;
  award_granted: AwardGrantedProps;
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
