import { Document, Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../styles';
import { PdfHeader } from '../components/PdfHeader';
import { PdfFooter } from '../components/PdfFooter';
import { PdfSignatureBlock } from '../components/PdfSignatureBlock';
import { formatDate, formatNumber, formatCurrency } from '../formatters';
import type { DocumentContext } from '../types';

/**
 * Module 6 B2 — Template SO_GRANT_LETTER (Stock Options).
 *
 * V1 français uniquement (EN viendra V2). Mention article 80 bis du CGI
 * (régime fiscal stock options).
 */
export function StockOptionGrantLetterTemplate({ data }: { data: DocumentContext }) {
  const { award, plan, beneficiary, org, generation } = data;

  return (
    <Document
      title={`Stock Option Grant Letter ${award.award_number ?? ''}`}
      author={org.legal_name ?? org.name}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          orgName={org.name}
          legalName={org.legal_name}
          siren={org.siren}
          registeredAddress={org.registered_address}
        />

        <Text style={pdfStyles.title}>Attribution de Stock Options</Text>
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
            <Text style={pdfStyles.tableCellLabel}>Nombre d&apos;options</Text>
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
          Les présentes Stock Options sont attribuées dans le cadre du Plan{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{plan.name}</Text> dont le bénéficiaire
          reconnaît avoir pris connaissance. Le prix d&apos;exercice est fixé à{' '}
          {formatCurrency(award.exercise_price)} par option, déterminé selon la juste valeur de
          marché à la date d&apos;attribution.
        </Text>
        <Text style={pdfStyles.paragraph}>
          L&apos;exercice des options est subordonné aux conditions de vesting définies dans le
          Plan. En cas de cessation des fonctions, les conditions de conservation, déchéance ou
          accélération s&apos;appliquent selon les règles définies dans le Plan (cf. clauses
          leavers).
        </Text>
        <Text style={pdfStyles.paragraph}>
          Le régime fiscal applicable est celui des options de souscription ou d&apos;achat
          d&apos;actions, conformément à l&apos;article 80 bis du Code général des impôts. Les
          conséquences fiscales et sociales relèvent de la responsabilité du bénéficiaire qui est
          invité à consulter son conseil.
        </Text>

        <Text style={pdfStyles.legalNote}>
          Document établi en application des articles 80 bis et suivants du CGI et conformément aux
          décisions du Conseil d&apos;administration / de l&apos;Assemblée générale. La signature
          électronique vaut acceptation pleine et entière des conditions.
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
