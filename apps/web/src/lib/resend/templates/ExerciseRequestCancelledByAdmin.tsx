import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ExerciseRequestCancelledByAdminProps = {
  recipientName: string;
  requestNumber: string;
  awardNumber: string;
  adminName: string;
  reason: string;
  awardUrl: string;
};

export function ExerciseRequestCancelledByAdmin({
  recipientName,
  requestNumber,
  awardNumber,
  adminName,
  reason,
  awardUrl,
}: ExerciseRequestCancelledByAdminProps) {
  return (
    <EmailLayout preview={`Votre demande d'exercice ${requestNumber} a été annulée`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Demande annulée
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        <strong>{adminName}</strong> a annulé votre demande d’exercice{' '}
        <strong className="font-mono">{requestNumber}</strong> (award{' '}
        <span className="font-mono">{awardNumber}</span>) pour la raison suivante :
      </Text>

      <Section className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-amber-700">Raison</Text>
        <Text className="my-1 text-sm text-slate-900">{reason}</Text>
      </Section>

      <Section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Text className="my-0 text-sm leading-6 text-slate-800">
          <strong>Votre award reste GRANTED</strong>, vous pouvez soumettre une nouvelle demande à
          tout moment depuis votre portail bénéficiaire.
        </Text>
      </Section>

      <Hr className="my-6 border-slate-200" />

      <Button
        href={awardUrl}
        className="rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Voir mon award
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Si le bouton ne fonctionne pas, copiez ce lien :
        <br />
        <Link href={awardUrl} className="break-all text-[#3730A3]">
          {awardUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

ExerciseRequestCancelledByAdmin.subject = ({
  requestNumber,
}: ExerciseRequestCancelledByAdminProps) =>
  `Votre demande d'exercice ${requestNumber} a été annulée`;
