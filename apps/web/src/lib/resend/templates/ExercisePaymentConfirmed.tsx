import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type ExercisePaymentConfirmedProps = {
  recipientName: string;
  requestNumber: string;
  awardNumber: string;
  units: number;
  planType: string;
  totalAmount: number;
  paymentReference: string;
  confirmedAt: string; // ISO
  orgName: string;
  exerciseUrl: string;
};

const fmtNum = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/\u202F/g, '\u00A0');

const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(n)
    .replace(/\u202F/g, '\u00A0');

const fmtDateLong = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export function ExercisePaymentConfirmed({
  recipientName,
  requestNumber,
  awardNumber,
  units,
  planType,
  totalAmount,
  paymentReference,
  confirmedAt,
  orgName,
  exerciseUrl,
}: ExercisePaymentConfirmedProps) {
  return (
    <EmailLayout preview={`Paiement reçu — vos ${fmtNum(units)} ${planType} sont exercés`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Vous êtes actionnaire 🎉
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {recipientName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Le paiement de <strong className="font-mono">{fmtEur(totalAmount)}</strong> a bien été reçu
        par <strong>{orgName}</strong> le <strong>{fmtDateLong(confirmedAt)}</strong>.
      </Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Vous êtes désormais actionnaire pour <strong>{fmtNum(units)} actions</strong> issues de
        l’exercice de vos <strong>{planType}</strong>.
      </Text>

      <Section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Demande</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{requestNumber}</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Award</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{awardNumber}</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">
          Référence paiement
        </Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{paymentReference}</Text>
      </Section>

      <Text className="mt-3 text-xs text-slate-500">
        Le bulletin de souscription officiel (PDF) est joint à cet email.
      </Text>

      <Section className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs">
        <Text className="my-0 text-xs leading-5 text-slate-700">
          <strong>Cession future :</strong> en cas de revente de vos actions, la plus-value de
          cession sera imposée selon le régime fiscal applicable à votre plan ({planType}).
          Conservez ce bulletin comme justificatif d’acquisition.
        </Text>
      </Section>

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

ExercisePaymentConfirmed.subject = ({ units, planType }: ExercisePaymentConfirmedProps) =>
  `Paiement reçu — vos ${fmtNum(units)} ${planType} sont exercés`;
