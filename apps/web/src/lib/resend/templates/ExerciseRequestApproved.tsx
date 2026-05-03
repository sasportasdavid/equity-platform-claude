import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ExerciseRequestApprovedProps = {
  recipientName: string;
  requestNumber: string;
  awardNumber: string;
  units: number;
  planType: string;
  strikePrice: number;
  totalCost: number;
  bankIban: string | null;
  bankBic: string | null;
  bankName: string | null;
  orgName: string;
  paymentDeadlineDays: number;
  exerciseUrl: string;
};

const fmtNum = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/\u202F/g, '\u00A0');

const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(n)
    .replace(/\u202F/g, '\u00A0');

export function ExerciseRequestApproved({
  recipientName,
  requestNumber,
  awardNumber,
  units,
  planType,
  strikePrice,
  totalCost,
  bankIban,
  bankBic,
  bankName,
  orgName,
  paymentDeadlineDays,
  exerciseUrl,
}: ExerciseRequestApprovedProps) {
  return (
    <EmailLayout
      preview={`Votre demande d'exercice ${requestNumber} est approuvée — virement requis`}
    >
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Demande approuvée 🎉
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Votre demande d’exercice <strong className="font-mono">{requestNumber}</strong> (award{' '}
        <span className="font-mono">{awardNumber}</span>) a été approuvée.
      </Text>

      <Section className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
        <Text className="my-0 text-sm leading-6 text-slate-800">
          Pour exercer ces{' '}
          <strong className="font-mono">
            {fmtNum(units)} {planType}
          </strong>
          , vous virerez <strong className="font-mono">{fmtEur(totalCost)}</strong> (coût d’exercice
          = <span className="font-mono">{fmtNum(units)}</span> ×{' '}
          <span className="font-mono">{fmtEur(strikePrice)}</span>) sur le compte bancaire de{' '}
          <strong>{orgName}</strong>. Vous deviendrez actionnaire dès réception du paiement par
          l’entreprise.
        </Text>
      </Section>

      <Section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">
          Coordonnées de paiement
        </Text>
        {bankName ? (
          <>
            <Text className="my-1 text-sm text-slate-900">
              Banque : <strong>{bankName}</strong>
            </Text>
          </>
        ) : null}
        {bankIban ? (
          <>
            <Hr className="my-2 border-slate-200" />
            <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">IBAN</Text>
            <Text className="my-1 font-mono text-sm text-slate-900">{bankIban}</Text>
          </>
        ) : null}
        {bankBic ? (
          <>
            <Hr className="my-2 border-slate-200" />
            <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">BIC</Text>
            <Text className="my-1 font-mono text-sm text-slate-900">{bankBic}</Text>
          </>
        ) : null}
        {!bankIban && !bankBic && !bankName ? (
          <Text className="my-1 text-sm text-amber-700">
            Coordonnées bancaires non renseignées par l’entreprise. Contactez votre administrateur.
          </Text>
        ) : null}
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">
          Référence à indiquer
        </Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{requestNumber}</Text>
      </Section>

      <Text className="mt-3 text-xs text-slate-500">
        Délai de paiement recommandé : {paymentDeadlineDays} jours. Au-delà, l’entreprise peut
        annuler administrativement la demande.
      </Text>

      <Text className="mt-3 text-xs text-slate-500">
        La notification d’exercice formelle (PDF) est jointe à cet email.
      </Text>

      <Button
        href={exerciseUrl}
        className="mt-5 rounded-md bg-[#16A34A] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Voir la demande
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Si le bouton ne fonctionne pas, copiez ce lien :
        <br />
        <Link href={exerciseUrl} className="break-all text-[#3730A3]">
          {exerciseUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

ExerciseRequestApproved.subject = ({ requestNumber }: ExerciseRequestApprovedProps) =>
  `Votre demande d'exercice ${requestNumber} a été approuvée`;
