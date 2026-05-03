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
 * Module 9 B5 — Template SUBSCRIPTION_BULLETIN.
 *
 * Bulletin de souscription d'actions issues de l'exercice. Document à
 * portée légale fortement marquée — sert de preuve d'acquisition pour
 * le bénéficiaire et est tenu par l'entreprise dans son registre des
 * mouvements de titres (L228-1 Code de commerce).
 *
 * Généré post-paiement (status COMPLETED) avec confirmed_at = date de
 * réception du virement par l'entreprise.
 */
export function SubscriptionBulletinTemplate({ data }: { data: DocumentContextExercise }) {
  const { exercise, award, plan, beneficiary, company, org, generation } = data;

  if (plan) assertExercisableType(plan.plan_type);

  const fullName = composeFullName(beneficiary?.first_name, beneficiary?.last_name);
  const addressLines = beneficiary ? composeAddressLines(beneficiary) : [];
  const orgDisplayName = org?.legal_name ?? org?.name ?? '—';
  const companyDisplayName = company?.legal_name ?? company?.name ?? orgDisplayName;
  const issueLocation = org?.registered_address
    ? org.registered_address.split(',').pop()?.trim() || 'Paris'
    : 'Paris';
  const subscriptionDate = exercise.confirmed_at ?? exercise.payment_received_at;

  return (
    <Document
      title={`Bulletin de souscription ${exercise.request_number ?? ''}`}
      author={orgDisplayName}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          orgName={org?.name ?? '—'}
          legalName={org?.legal_name ?? null}
          siren={org?.siren ?? null}
          registeredAddress={org?.registered_address ?? null}
        />

        <Text style={pdfStyles.title}>Bulletin de souscription d&apos;actions</Text>
        <Text style={pdfStyles.subtitle}>
          Issues de l&apos;exercice de {plan?.plan_type ?? '—'} — {plan?.name ?? '—'}
        </Text>

        <Text style={[pdfStyles.small, { textAlign: 'right', marginBottom: 12 }]}>
          Fait à {issueLocation}, le {formatDate(generation.generated_at)}
        </Text>

        <Text style={pdfStyles.sectionTitle}>1. Société émettrice</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Raison sociale</Text>
            <Text style={pdfStyles.tableCellValue}>{companyDisplayName}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>SIREN</Text>
            <Text style={pdfStyles.tableCellValue}>{company?.siren ?? org?.siren ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Siège social</Text>
            <Text style={pdfStyles.tableCellValue}>{org?.registered_address ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Capital social</Text>
            <Text style={pdfStyles.tableCellValue}>{formatCurrency(company?.share_capital)}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>2. Souscripteur (bénéficiaire)</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Nom complet</Text>
            <Text style={pdfStyles.tableCellValue}>{fullName}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Adresse</Text>
            <Text style={pdfStyles.tableCellValue}>
              {addressLines.length > 0 ? addressLines.join('\n') : '—'}
            </Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Résidence fiscale</Text>
            <Text style={pdfStyles.tableCellValue}>
              {beneficiary?.tax_residence_country ?? '—'}
            </Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>3. Souscription</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Demande d&apos;exercice</Text>
            <Text style={pdfStyles.tableCellValue}>{exercise.request_number ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Award concerné</Text>
            <Text style={pdfStyles.tableCellValue}>{award?.award_number ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Type de droits exercés</Text>
            <Text style={pdfStyles.tableCellValue}>{plan?.plan_type ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Nombre d&apos;actions souscrites</Text>
            <Text style={pdfStyles.tableCellValue}>{formatNumber(exercise.units_to_exercise)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Prix unitaire</Text>
            <Text style={pdfStyles.tableCellValue}>
              {formatCurrency(exercise.exercise_price_per_unit)}
            </Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Montant total souscrit</Text>
            <Text style={pdfStyles.tableCellValue}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                {formatCurrency(exercise.exercise_cost_total)}
              </Text>
            </Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Date de réception du paiement</Text>
            <Text style={pdfStyles.tableCellValue}>{formatDate(subscriptionDate)}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>4. Inscription au registre</Text>
        <Text style={pdfStyles.paragraph}>
          Le souscripteur est inscrit au registre des mouvements de titres de la société à la date
          du <Text style={{ fontFamily: 'Helvetica-Bold' }}>{formatDate(subscriptionDate)}</Text>,
          conformément à l&apos;article L228-1 du Code de commerce.
        </Text>

        <Text style={pdfStyles.legalNote}>{LEGAL_MENTIONS.SUBSCRIPTION_BULLETIN}</Text>

        <PdfSignatureBlock beneficiaryName={fullName} companyName={companyDisplayName} />

        <PdfFooter
          documentNumber={generation.document_number}
          generatedAt={generation.generated_at}
        />
      </Page>
    </Document>
  );
}
