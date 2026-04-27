/**
 * Registry typé de tous les templates email V1 (Module 2 §7.2).
 *
 * Pourquoi un registry plutôt que des imports directs : le `code` de template
 * est aussi la clé enregistrée dans `notification_templates` (table seedée
 * en migration 00003), ce qui permet :
 *   - de logger `template_code` dans `notifications` côté Resend webhook
 *   - de désactiver un template à chaud via `notification_templates.is_active`
 *   - de versionner les évolutions de copy au même endroit
 */

import { BeneficiaryFirstInvite, type BeneficiaryFirstInviteProps } from './BeneficiaryFirstInvite';
import { InvitationRevoked, type InvitationRevokedProps } from './InvitationRevoked';
import { MagicLinkLogin, type MagicLinkLoginProps } from './MagicLinkLogin';
import { OrgRoleChanged, type OrgRoleChangedProps } from './OrgRoleChanged';
import { TeamMemberInvite, type TeamMemberInviteProps } from './TeamMemberInvite';

export type TemplateMap = {
  magic_link_login: MagicLinkLoginProps;
  team_member_invite: TeamMemberInviteProps;
  beneficiary_first_invite: BeneficiaryFirstInviteProps;
  invitation_revoked: InvitationRevokedProps;
  org_role_changed: OrgRoleChangedProps;
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
};
