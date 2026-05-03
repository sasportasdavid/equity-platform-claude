import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ExerciseRequestSubmittedProps = {
  recipientName: string;
  requestNumber: string;
  beneficiaryName: string;
  beneficiaryEmail: string;
  awardNumber: string;
  planType: string;
  units: number;
  totalCost: number;
  fmvAtRequest: number;
  taxRegime: string;
  totalTaxes: number;
  netGain: number;
  approvalUrl: string;
};

const fmtNum = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' ');

const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(n)
    .replace(/ /g, ' ');

export function ExerciseRequestSubmitted({
  recipientName,
  requestNumber,
  beneficiaryName,
  beneficiaryEmail,
  awardNumber,
  planType,
  units,
  totalCost,
  fmvAtRequest,
  taxRegime,
  totalTaxes,
  netGain,
  approvalUrl,
}: ExerciseRequestSubmittedProps) {
  return (
    <EmailLayout preview={`Nouvelle demande d'exercice ${requestNumber} — ${beneficiaryName}`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Demande d’exercice à examiner
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        <strong>{beneficiaryName}</strong> ({beneficiaryEmail}) a soumis une demande d’exercice qui
        attend votre approbation.
      </Text>

      <Section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Demande</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{requestNumber}</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Award</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">
          {awardNumber} · {planType}
        </Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">
          Unités à exercer
        </Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{fmtNum(units)} unités</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Coût d’exercice</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{fmtEur(totalCost)}</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">
          FMV à la demande
        </Text>
        <Text className="my-1 font-mono text-sm text-slate-900">
          {fmtEur(fmvAtRequest)} / unité
        </Text>
      </Section>

      <Section className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-amber-700">Snapshot fiscal</Text>
        <Text className="my-1 text-sm text-slate-900">
          Régime détecté : <strong>{taxRegime}</strong>
        </Text>
        <Text className="my-1 text-sm text-slate-900">
          Total impôts estimés : <strong className="font-mono">{fmtEur(totalTaxes)}</strong>
        </Text>
        <Text className="my-1 text-sm text-slate-900">
          Gain net estimé : <strong className="font-mono">{fmtEur(netGain)}</strong>
        </Text>
      </Section>

      <Button
        href={approvalUrl}
        className="mt-5 rounded-md bg-[#3730A3] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Voir la demande
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

ExerciseRequestSubmitted.subject = ({
  requestNumber,
  beneficiaryName,
}: ExerciseRequestSubmittedProps) =>
  `Nouvelle demande d'exercice ${requestNumber} — ${beneficiaryName}`;
