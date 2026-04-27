import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type MagicLinkLoginProps = {
  actionLink: string;
  expiresInMinutes: number;
};

export function MagicLinkLogin({ actionLink, expiresInMinutes }: MagicLinkLoginProps) {
  return (
    <EmailLayout preview="Votre lien de connexion à Capiwise">
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Connexion à Capiwise
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Cliquez sur le bouton ci-dessous pour vous connecter à votre espace. Ce lien expire dans{' '}
        <strong>{expiresInMinutes} minutes</strong> et est à usage unique.
      </Text>

      <Button
        href={actionLink}
        className="mt-5 rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Se connecter
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
        <br />
        <Link href={actionLink} className="break-all text-[#3730A3]">
          {actionLink}
        </Link>
      </Text>

      <Text className="mt-6 text-xs text-slate-500">
        Vous n’avez pas demandé cette connexion ? Ignorez cet email — aucun accès n’a été accordé.
      </Text>
    </EmailLayout>
  );
}

MagicLinkLogin.subject = () => 'Votre lien de connexion · Capiwise';
