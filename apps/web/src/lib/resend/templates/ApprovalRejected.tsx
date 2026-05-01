import { Button, Heading, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ApprovalRejectedProps = {
  recipientName: string;
  awardNumber: string;
  approverName: string;
  reason: string;
  awardUrl: string;
};

/**
 * Module 7 — `approval_rejected` template.
 *
 * Notifie le creator d'une attribution que le workflow d'approbation
 * a abouti à REJECTED. Ton neutre, factuel, motif explicite.
 */
export function ApprovalRejected({
  recipientName,
  awardNumber,
  approverName,
  reason,
  awardUrl,
}: ApprovalRejectedProps) {
  return (
    <EmailLayout preview={`Décision : attribution ${awardNumber} refusée`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Attribution refusée
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Votre proposition d’attribution <strong className="font-mono">{awardNumber}</strong> a été
        refusée par <strong>{approverName}</strong>.
      </Text>

      <Section className="mt-4 rounded-md border-l-4 border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Motif du refus</Text>
        <Text className="my-1 text-sm italic leading-6 text-slate-800">« {reason} »</Text>
      </Section>

      <Text className="mt-3 text-sm leading-6 text-slate-700">
        L’attribution est repassée en brouillon. Vous pouvez la modifier et la re-proposer si
        besoin.
      </Text>

      <Button
        href={awardUrl}
        className="mt-5 rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Voir le détail
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

ApprovalRejected.subject = ({ awardNumber }: ApprovalRejectedProps) =>
  `Attribution ${awardNumber} refusée · Capiwise`;
