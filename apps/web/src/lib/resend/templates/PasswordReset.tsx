import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type PasswordResetProps = {
  actionLink: string;
  expiresInMinutes: number;
};

export function PasswordReset({ actionLink, expiresInMinutes }: PasswordResetProps) {
  return (
    <EmailLayout preview="Réinitialisation de votre mot de passe Capiwise">
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Réinitialiser votre mot de passe
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Vous avez demandé à réinitialiser votre mot de passe Capiwise. Cliquez sur le bouton
        ci-dessous pour choisir un nouveau mot de passe. Le lien expire dans{' '}
        <strong>{expiresInMinutes} minutes</strong> et est à usage unique.
      </Text>

      <Button
        href={actionLink}
        className="mt-5 rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Réinitialiser mon mot de passe
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
        <br />
        <Link href={actionLink} className="break-all text-[#3730A3]">
          {actionLink}
        </Link>
      </Text>

      <Text className="mt-6 text-xs text-slate-500">
        Vous n’avez pas demandé cette réinitialisation ? Ignorez cet email — votre mot de passe
        actuel reste valide et aucun accès n’a été accordé.
      </Text>
    </EmailLayout>
  );
}

PasswordReset.subject = () => 'Réinitialisation de votre mot de passe · Capiwise';
