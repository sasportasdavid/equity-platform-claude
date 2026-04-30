import { Document, Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../styles';
import { PdfHeader } from '../components/PdfHeader';
import { PdfFooter } from '../components/PdfFooter';
import { PdfSignatureBlock } from '../components/PdfSignatureBlock';
import { formatDate, formatNumber, formatCurrency } from '../formatters';
import type { DocumentContext } from '../types';

/**
 * Module 6 B2 — Template BSPCE_GRANT_LETTER.
 *
 * Lettre d'attribution de Bons de Souscription de Parts de Créateur
 * d'Entreprise. Mention article 163 bis G du CGI.
 */
export function BspceGrantLetterTemplate({ data }: { data: DocumentContext }) {
  const { award, plan, beneficiary, org, generation } = data;
  const beneficiaryAddress = [
    beneficiary.address_line_1,
    beneficiary.postal_code && beneficiary.city
      ? `${beneficiary.postal_code} ${beneficiary.city}`
      : beneficiary.city,
    beneficiary.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Document
      title={`BSPCE Grant Letter ${award.award_number ?? ''}`}
      author={org.legal_name ?? org.name}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          orgName={org.name}
          legalName={org.legal_name}
          siren={org.siren}
          registeredAddress={org.registered_address}
        />

        <Text style={pdfStyles.title}>Attribution de BSPCE</Text>
        <Text style={pdfStyles.subtitle}>
          Plan {plan.name} — Référence {award.award_number ?? '—'}
        </Text>

        <Text style={pdfStyles.sectionTitle}>1. Identité du bénéficiaire</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Nom complet</Text>
            <Text style={pdfStyles.tableCellValue}>{beneficiary.full_name}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Email</Text>
            <Text style={pdfStyles.tableCellValue}>{beneficiary.email}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Adresse</Text>
            <Text style={pdfStyles.tableCellValue}>{beneficiaryAddress || '—'}</Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Résidence fiscale</Text>
            <Text style={pdfStyles.tableCellValue}>{beneficiary.tax_residence ?? '—'}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>2. Conditions d&apos;attribution</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Numéro d&apos;attribution</Text>
            <Text style={pdfStyles.tableCellValue}>{award.award_number ?? '—'}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Date d&apos;attribution</Text>
            <Text style={pdfStyles.tableCellValue}>{formatDate(award.grant_date)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Nombre de BSPCE</Text>
            <Text style={pdfStyles.tableCellValue}>{formatNumber(award.units_granted)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Prix d&apos;exercice</Text>
            <Text style={pdfStyles.tableCellValue}>{formatCurrency(award.exercise_price)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Début vesting</Text>
            <Text style={pdfStyles.tableCellValue}>{formatDate(award.vesting_start_date)}</Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Date d&apos;expiration</Text>
            <Text style={pdfStyles.tableCellValue}>{formatDate(award.expiry_date)}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>3. Conditions générales</Text>
        <Text style={pdfStyles.paragraph}>
          Les présents BSPCE sont attribués gratuitement, conformément aux dispositions de
          l&apos;article 163 bis G du Code général des impôts. Le prix d&apos;exercice est fixé à{' '}
          {formatCurrency(award.exercise_price)} par bon, déterminé selon la juste valeur de marché
          à la date d&apos;attribution.
        </Text>
        <Text style={pdfStyles.paragraph}>
          L&apos;exercice de ces BSPCE est régi par les conditions du Plan{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{plan.name}</Text>, dont le bénéficiaire
          reconnaît avoir pris connaissance. En cas de cessation des fonctions au sein de la
          société, les conditions de conservation, déchéance ou accélération s&apos;appliquent selon
          les règles définies dans le Plan (cf. clauses leavers).
        </Text>
        <Text style={pdfStyles.paragraph}>
          Ces BSPCE sont incessibles. Ils ne pourront être exercés que par le bénéficiaire lui-même,
          dans les conditions et délais prévus par le Plan et la législation française applicable.
        </Text>

        <Text style={pdfStyles.legalNote}>
          Document établi en application des articles 163 bis G du CGI et conformément aux décisions
          du Conseil d&apos;administration / des associés. La signature électronique du présent
          document vaut acceptation pleine et entière des conditions.
        </Text>

        <PdfSignatureBlock
          beneficiaryName={beneficiary.full_name}
          companyName={org.legal_name ?? org.name}
        />

        <PdfFooter
          documentNumber={generation.document_number}
          generatedAt={generation.generated_at}
        />
      </Page>
    </Document>
  );
}
