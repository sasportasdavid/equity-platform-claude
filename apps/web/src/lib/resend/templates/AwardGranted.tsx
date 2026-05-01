import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type AwardGrantedProps = {
  beneficiaryName: string;
  orgName: string;
  awardNumber: string;
  planType: string;
  units: number;
  exercisePrice: number | null;
  grantDate: string; // YYYY-MM-DD
  portalUrl: string;
};

/**
 * Module 7 — `award_granted` template.
 *
 * Notifie le bénéficiaire que son attribution est désormais active
 * (post-signature). Ton chaleureux "félicitations", récapitulatif
 * complet du contrat.
 */
export function AwardGranted({
  beneficiaryName,
  orgName,
  awardNumber,
  planType,
  units,
  exercisePrice,
  grantDate,
  portalUrl,
}: AwardGrantedProps) {
  // U+00A0 NO-BREAK SPACE pour les milliers (cf. PR #9 Bug #36)
  const formattedUnits = new Intl.NumberFormat('fr-FR').format(units).replace(/\u202F/g, '\u00A0');
  const formattedPrice =
    exercisePrice != null
      ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
          .format(exercisePrice)
          .replace(/\u202F/g, '\u00A0')
      : null;
  const formattedDate = (() => {
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date(grantDate));
    } catch {
      return grantDate;
    }
  })();

  return (
    <EmailLayout
      preview={`Félicitations : votre attribution ${planType} chez ${orgName} est active`}
    >
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Félicitations 🎉
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour {beneficiaryName},</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Votre attribution <strong>{planType}</strong> chez <strong>{orgName}</strong> est désormais
        active. Vous pouvez consulter le détail et suivre votre vesting depuis votre portail
        bénéficiaire.
      </Text>

      <Section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Référence</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{awardNumber}</Text>
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">Volume</Text>
        <Text className="my-1 font-mono text-sm text-slate-900">{formattedUnits} instruments</Text>
        {formattedPrice ? (
          <>
            <Hr className="my-2 border-slate-200" />
            <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">
              Prix d’exercice
            </Text>
            <Text className="my-1 font-mono text-sm text-slate-900">{formattedPrice} / unité</Text>
          </>
        ) : null}
        <Hr className="my-2 border-slate-200" />
        <Text className="my-0 text-xs uppercase tracking-wide text-slate-500">
          Date d’attribution
        </Text>
        <Text className="my-1 text-sm text-slate-900">{formattedDate}</Text>
      </Section>

      <Button
        href={portalUrl}
        className="mt-5 rounded-md bg-[#16A34A] px-5 py-3 text-center text-sm font-medium text-white"
      >
        Accéder à mon portail
      </Button>

      <Text className="mt-6 text-xs text-slate-500">
        Si le bouton ne fonctionne pas, copiez ce lien :
        <br />
        <Link href={portalUrl} className="break-all text-[#3730A3]">
          {portalUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

AwardGranted.subject = ({ orgName, planType }: AwardGrantedProps) =>
  `${orgName} : votre attribution ${planType} est active`;
