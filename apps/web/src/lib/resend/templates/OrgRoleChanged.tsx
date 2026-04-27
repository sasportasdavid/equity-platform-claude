import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type OrgRoleChangedProps = {
  orgName: string;
  newRoles: readonly string[];
};

const ROLE_LABEL_FR: Record<string, string> = {
  OWNER: 'Propriétaire',
  ADMIN_HR: 'Admin RH',
  APPROVER: 'Approbateur',
  AUDITOR: 'Auditeur',
  BENEFICIARY: 'Bénéficiaire',
};

export function OrgRoleChanged({ orgName, newRoles }: OrgRoleChangedProps) {
  const labels = newRoles.map((r) => ROLE_LABEL_FR[r] ?? r).join(', ');
  return (
    <EmailLayout preview={`Vos accès sur ${orgName} ont été mis à jour`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Vos accès ont été mis à jour
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Sur <strong>{orgName}</strong>, vos rôles ont été modifiés. Vous disposez désormais des
        accès suivants :
      </Text>
      <Text className="mt-3 rounded-md bg-slate-50 px-4 py-3 text-sm font-medium leading-6 text-slate-900">
        {labels || '— aucun rôle assigné —'}
      </Text>
      <Text className="mt-3 text-xs text-slate-500">
        Cette modification prend effet à votre prochaine connexion. Si vous êtes déjà connecté,
        déconnectez-vous puis reconnectez-vous pour rafraîchir vos droits.
      </Text>
    </EmailLayout>
  );
}

OrgRoleChanged.subject = ({ orgName }: OrgRoleChangedProps) =>
  `Vos accès sur ${orgName} ont changé · Capiwise`;
