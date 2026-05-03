import { Document, Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../styles';
import { PdfHeader } from '../components/PdfHeader';
import { PdfFooter } from '../components/PdfFooter';
import { PdfSignatureBlock } from '../components/PdfSignatureBlock';
import { formatDate, formatNumber, formatCurrency } from '../formatters';
import {
  assertExercisableType,
  composeAddressLines,
  composeFullName,
  LEGAL_MENTIONS,
} from '../exercise-template-helpers';
import type { DocumentContextExercise } from '../types';

/**
 * Module 9 B5 — Template EXERCISE_NOTIFICATION.
 *
 * Notification d'exercice envoyée au bénéficiaire post-APPROVED, contenant
 * les instructions de paiement (IBAN/BIC entreprise + montant à virer +
 * référence). Pas un titre — juste une notification formelle.
 *
 * Plans concernés : BSPCE, STOCK_OPTION, BSA. AGA exclu (assertion runtime).
 */
export function ExerciseNotificationTemplate({ data }: { data: DocumentContextExercise }) {
  const { exercise, award, plan, beneficiary, company, org, generation } = data;

  if (plan) assertExercisableType(plan.plan_type);

  const fullName = composeFullName(beneficiary?.first_name, beneficiary?.last_name);
  const addressLines = beneficiary ? composeAddressLines(beneficiary) : [];
  const orgDisplayName = org?.legal_name ?? org?.name ?? '—';
  const companyDisplayName = company?.legal_name ?? company?.name ?? orgDisplayName;
  const issueLocation = org?.registered_address
    ? org.registered_address.split(',').pop()?.trim() || 'Paris'
    : 'Paris';
  const taxRegime = exercise.tax_simulation_snapshot?.regime ?? '—';
  const taxGross = exercise.tax_simulation_snapshot?.grossGainAmount ?? null;
  const taxTotal = exercise.tax_simulation_snapshot?.totalTaxAmount ?? null;
  const taxNet = exercise.tax_simulation_snapshot?.netGainAmount ?? null;

  return (
    <Document
      title={`Notification d'exercice ${exercise.request_number ?? ''}`}
      author={orgDisplayName}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          orgName={org?.name ?? '—'}
          legalName={org?.legal_name ?? null}
          siren={org?.siren ?? null}
          registeredAddress={org?.registered_address ?? null}
        />

        <Text style={pdfStyles.title}>Notification d&apos;exercice</Text>
        <Text style={pdfStyles.subtitle}>
          Demande {exercise.request_number ?? '—'} — {plan?.name ?? '—'}
        </Text>

        <Text style={[pdfStyles.small, { textAlign: 'right', marginBottom: 12 }]}>
          Fait à {issueLocation}, le {formatDate(generation.generated_at)}
        </Text>

        <Text style={pdfStyles.sectionTitle}>1. Bénéficiaire</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Nom complet</Text>
            <Text style={pdfStyles.tableCellValue}>{fullName}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Email</Text>
            <Text style={pdfStyles.tableCellValue}>{beneficiary?.email ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Adresse</Text>
            <Text style={pdfStyles.tableCellValue}>
              {addressLines.length > 0 ? addressLines.join('\n') : '—'}
            </Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Date d&apos;embauche</Text>
            <Text style={pdfStyles.tableCellValue}>{formatDate(beneficiary?.hire_date)}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>2. Award et plan</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Type de plan</Text>
            <Text style={pdfStyles.tableCellValue}>{plan?.plan_type ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Numéro award</Text>
            <Text style={pdfStyles.tableCellValue}>{award?.award_number ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Date d&apos;attribution</Text>
            <Text style={pdfStyles.tableCellValue}>{formatDate(award?.grant_date)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Prix d&apos;exercice (strike)</Text>
            <Text style={pdfStyles.tableCellValue}>{formatCurrency(award?.exercise_price)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Unités attribuées</Text>
            <Text style={pdfStyles.tableCellValue}>{formatNumber(award?.units_granted)}</Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Déjà exercées</Text>
            <Text style={pdfStyles.tableCellValue}>
              {formatNumber(award?.units_already_exercised)}
            </Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>3. Demande d&apos;exercice</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Numéro demande</Text>
            <Text style={pdfStyles.tableCellValue}>{exercise.request_number ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Unités à exercer</Text>
            <Text style={pdfStyles.tableCellValue}>{formatNumber(exercise.units_to_exercise)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Coût total</Text>
            <Text style={pdfStyles.tableCellValue}>
              {formatNumber(exercise.units_to_exercise)} ×{' '}
              {formatCurrency(exercise.exercise_price_per_unit)} ={' '}
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                {formatCurrency(exercise.exercise_cost_total)}
              </Text>
            </Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>FMV à la demande</Text>
            <Text style={pdfStyles.tableCellValue}>{formatCurrency(exercise.fmv_at_request)}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>4. Snapshot fiscal</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Régime fiscal détecté</Text>
            <Text style={pdfStyles.tableCellValue}>{taxRegime}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Gain brut estimé</Text>
            <Text style={pdfStyles.tableCellValue}>{formatCurrency(taxGross)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Total impôts estimés</Text>
            <Text style={pdfStyles.tableCellValue}>{formatCurrency(taxTotal)}</Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Gain net estimé</Text>
            <Text style={pdfStyles.tableCellValue}>{formatCurrency(taxNet)}</Text>
          </View>
        </View>
        <Text style={pdfStyles.small}>
          Cette simulation est indicative et ne constitue pas un conseil fiscal. Le bénéficiaire est
          invité à consulter son conseil pour la déclaration de revenus.
        </Text>

        <Text style={pdfStyles.sectionTitle} break>
          5. Instructions de paiement
        </Text>
        <Text style={pdfStyles.paragraph}>
          Pour exercer ces droits, le bénéficiaire doit virer la somme de{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>
            {formatCurrency(exercise.exercise_cost_total)}
          </Text>{' '}
          sur le compte bancaire de{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{orgDisplayName}</Text>.
        </Text>
        {org?.bank_iban || org?.bank_bic || org?.bank_name ? (
          <View style={pdfStyles.table}>
            {org?.bank_name ? (
              <View style={pdfStyles.tableRow}>
                <Text style={pdfStyles.tableCellLabel}>Banque</Text>
                <Text style={pdfStyles.tableCellValue}>{org.bank_name}</Text>
              </View>
            ) : null}
            {org?.bank_iban ? (
              <View style={pdfStyles.tableRow}>
                <Text style={pdfStyles.tableCellLabel}>IBAN</Text>
                <Text style={pdfStyles.tableCellValue}>{org.bank_iban}</Text>
              </View>
            ) : null}
            {org?.bank_bic ? (
              <View style={pdfStyles.tableRow}>
                <Text style={pdfStyles.tableCellLabel}>BIC</Text>
                <Text style={pdfStyles.tableCellValue}>{org.bank_bic}</Text>
              </View>
            ) : null}
            <View style={pdfStyles.tableRow}>
              <Text style={pdfStyles.tableCellLabel}>Référence virement</Text>
              <Text style={pdfStyles.tableCellValue}>{exercise.request_number ?? '—'}</Text>
            </View>
            <View style={pdfStyles.tableRowLast}>
              <Text style={pdfStyles.tableCellLabel}>Délai indicatif</Text>
              <Text style={pdfStyles.tableCellValue}>Sous 30 jours</Text>
            </View>
          </View>
        ) : (
          <Text style={pdfStyles.legalNote}>
            Coordonnées bancaires à demander à l&apos;administration de l&apos;entreprise.
          </Text>
        )}

        <Text style={pdfStyles.legalNote}>{LEGAL_MENTIONS.EXERCISE_NOTIFICATION}</Text>

        <PdfSignatureBlock beneficiaryName={fullName} companyName={companyDisplayName} />

        <PdfFooter
          documentNumber={generation.document_number}
          generatedAt={generation.generated_at}
        />
      </Page>
    </Document>
  );
}
