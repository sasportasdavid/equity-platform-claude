import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type TeamMemberInviteProps = {
  orgName: string;
  inviterEmail: string;
  acceptUrl: string;
  message?: string | null;
  expiresAtHuman: string;
};

export function TeamMemberInvite({
  orgName,
  inviterEmail,
  acceptUrl,
  message,
  expiresAtHuman,
}: TeamMemberInviteProps) {
  return (
    <EmailLayout preview={`Vous êtes invité à rejoindre ${orgName} sur Capiwise`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Vous êtes invité sur Capiwise
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        <strong>{inviterEmail}</strong> vous invite à rejoindre <strong>{orgName}</strong> sur
        Capiwise, la plateforme française de gestion d’actionnariat salarié.
      </Text>

      {message ? (
        <Text className="mt-3 rounded-md border-l-4 border-slate-300 bg-slate-50 px-4 py-3 text-sm italic leading-6 text-slate-700">
          « {message} »
        </Text>
      ) : null}

      <Button
        href={acceptUrl}
        className="mt-5 rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Accepter l’invitation
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Cette invitation expire le <strong>{expiresAtHuman}</strong>.
      </Text>

      <Text className="mt-3 text-xs text-slate-500">
        Si le bouton ne fonctionne pas, copiez ce lien :
        <br />
        <Link href={acceptUrl} className="break-all text-[#3730A3]">
          {acceptUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

TeamMemberInvite.subject = ({ orgName }: TeamMemberInviteProps) =>
  `Vous êtes invité sur ${orgName} · Capiwise`;
