import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type BeneficiaryFirstInviteProps = {
  orgName: string;
  acceptUrl: string;
  expiresAtHuman: string;
};

export function BeneficiaryFirstInvite({
  orgName,
  acceptUrl,
  expiresAtHuman,
}: BeneficiaryFirstInviteProps) {
  return (
    <EmailLayout preview={`${orgName} vous invite à consulter votre attribution sur Capiwise`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Votre attribution est prête
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        <strong>{orgName}</strong> vous a attribué des instruments d’actionnariat salarié et vous
        invite à consulter le détail de votre attribution sur votre espace bénéficiaire Capiwise.
      </Text>

      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Sur votre espace, vous pourrez :
      </Text>
      <Text className="mt-1 text-sm leading-6 text-slate-700">
        • Consulter les modalités de votre attribution (vesting, conditions, etc.)
        <br />
        • Suivre l’évolution de vos droits dans le temps
        <br />
        • Exercer vos options le moment venu
        <br />• Récupérer vos documents signés
      </Text>

      <Button
        href={acceptUrl}
        className="mt-5 rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Accéder à mon espace
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Cette invitation expire le <strong>{expiresAtHuman}</strong>.
      </Text>

      <Text className="mt-3 text-xs text-slate-500">
        Si le bouton ne fonctionne pas :{' '}
        <Link href={acceptUrl} className="break-all text-[#3730A3]">
          {acceptUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

BeneficiaryFirstInvite.subject = ({ orgName }: BeneficiaryFirstInviteProps) =>
  `${orgName} vous invite sur Capiwise`;
