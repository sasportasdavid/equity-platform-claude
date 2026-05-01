import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ApprovalPendingProps = {
  recipientName: string;
  awardNumber: string;
  awardUnits: number;
  awardPlanType: string;
  creatorName: string;
  appUrl: string;
  approvalUrl: string;
};

/**
 * Module 7 — `approval_pending` template.
 *
 * Notifie un APPROVER qu'une attribution attend sa décision dans le
 * workflow d'approbation (Module 5). Ton sobre, action requise.
 */
export function ApprovalPending({
  recipientName,
  awardNumber,
  awardUnits,
  awardPlanType,
  creatorName,
  approvalUrl,
}: ApprovalPendingProps) {
  // U+00A0 NO-BREAK SPACE pour les milliers (cf. PR #9 Bug #36)
  const formattedUnits = new Intl.NumberFormat('fr-FR')
    .format(awardUnits)
    .replace(/\u202F/g, '\u00A0');

  return (
    <EmailLayout preview={`Action requise : approbation d'attribution ${awardNumber}`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Approbation requise
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        <strong>{creatorName}</strong> a soumis une attribution pour approbation. Votre décision est
        attendue avant qu’elle puisse être finalisée.
      </Text>

      <Section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Attribution</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{awardNumber}</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Type de plan</Text>
        <Text className="my-1 text-sm text-slate-900">{awardPlanType}</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Volume</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{formattedUnits} instruments</Text>
      </Section>

      <Button
        href={approvalUrl}
        className="mt-5 rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Examiner l’attribution
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Si le bouton ne fonctionne pas, copiez ce lien :
        <br />
        <Link href={approvalUrl} className="break-all text-[#3730A3]">
          {approvalUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

ApprovalPending.subject = ({ awardNumber }: ApprovalPendingProps) =>
  `Action requise : approbation d'attribution ${awardNumber}`;
