import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ApprovalApprovedProps = {
  recipientName: string;
  awardNumber: string;
  approverName: string;
  awardUrl: string;
};

/**
 * Module 7 — `approval_approved` template.
 *
 * Notifie le creator d'une attribution que le workflow d'approbation
 * a abouti à APPROVED. Ton positif "bonne nouvelle".
 */
export function ApprovalApproved({
  recipientName,
  awardNumber,
  approverName,
  awardUrl,
}: ApprovalApprovedProps) {
  return (
    <EmailLayout preview={`Bonne nouvelle : attribution ${awardNumber} approuvée`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Attribution approuvée
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Bonne nouvelle : votre proposition d’attribution{' '}
        <strong className="font-mono">{awardNumber}</strong> a été approuvée par{' '}
        <strong>{approverName}</strong>.
      </Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Prochaine étape : générer le document d’attribution et l’envoyer pour signature au
        bénéficiaire.
      </Text>

      <Button
        href={awardUrl}
        className="mt-5 rounded-md bg-[#16A34A] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Voir l’attribution
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

ApprovalApproved.subject = ({ awardNumber }: ApprovalApprovedProps) =>
  `Attribution ${awardNumber} approuvée · Capiwise`;
