import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ExerciseRequestRejectedProps = {
  recipientName: string;
  requestNumber: string;
  awardNumber: string;
  approverName: string;
  stepName: string;
  reason: string;
  adminContactEmail: string | null;
  awardUrl: string;
};

export function ExerciseRequestRejected({
  recipientName,
  requestNumber,
  awardNumber,
  approverName,
  stepName,
  reason,
  adminContactEmail,
  awardUrl,
}: ExerciseRequestRejectedProps) {
  return (
    <EmailLayout preview={`Votre demande d'exercice ${requestNumber} a été refusée`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Demande refusée
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Votre demande d’exercice <strong className="font-mono">{requestNumber}</strong> (award{' '}
        <span className="font-mono">{awardNumber}</span>) a été refusée par{' '}
        <strong>{approverName}</strong> à l’étape <strong>« {stepName} »</strong>.
      </Text>

      <Section className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-rose-700">Raison</Text>
        <Text className="my-1 text-sm text-slate-900">{reason}</Text>
      </Section>

      <Section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Text className="my-0 text-sm leading-6 text-slate-800">
          <strong>Votre award reste GRANTED.</strong> Vous pouvez{' '}
          {adminContactEmail ? (
            <>
              contacter{' '}
              <Link href={`mailto:${adminContactEmail}`} className="text-[#3730A3]">
                {adminContactEmail}
              </Link>{' '}
              pour comprendre la décision ou
            </>
          ) : (
            'contacter votre administrateur pour comprendre la décision ou'
          )}{' '}
          soumettre une nouvelle demande.
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

ExerciseRequestRejected.subject = ({ requestNumber }: ExerciseRequestRejectedProps) =>
  `Votre demande d'exercice ${requestNumber} a été refusée`;
