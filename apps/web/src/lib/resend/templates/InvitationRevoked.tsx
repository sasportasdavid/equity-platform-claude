import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type InvitationRevokedProps = {
  orgName: string;
  inviterEmail: string;
};

export function InvitationRevoked({ orgName, inviterEmail }: InvitationRevokedProps) {
  return (
    <EmailLayout preview={`Votre invitation à ${orgName} a été annulée`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Invitation annulée
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        L’invitation à rejoindre <strong>{orgName}</strong> sur Capiwise a été annulée par{' '}
        <strong>{inviterEmail}</strong>.
      </Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Si vous pensez qu’il s’agit d’une erreur, contactez directement{' '}
        <strong>{inviterEmail}</strong>.
      </Text>
    </EmailLayout>
  );
}

InvitationRevoked.subject = ({ orgName }: InvitationRevokedProps) =>
  `Invitation annulée · ${orgName}`;
