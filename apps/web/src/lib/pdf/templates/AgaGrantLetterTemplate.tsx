import { Document, Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../styles';
import { PdfHeader } from '../components/PdfHeader';
import { PdfFooter } from '../components/PdfFooter';
import { PdfSignatureBlock } from '../components/PdfSignatureBlock';
import { formatDate, formatNumber } from '../formatters';
import type { DocumentContext } from '../types';

/**
 * Module 6 B2 — Template AGA_GRANT_LETTER.
 *
 * Lettre d'attribution d'Actions Gratuites. Mention articles
 * L. 225-197-1 et suivants du Code de commerce. Si plan AGA_PERFORMANCE :
 * note conditions de performance.
 */
export function AgaGrantLetterTemplate({ data }: { data: DocumentContext }) {
  const { award, plan, beneficiary, org, generation } = data;
  const isPerformance = plan.plan_type === 'AGA_PERFORMANCE';

  return (
    <Document
      title={`AGA Grant Letter ${award.award_number ?? ''}`}
      author={org.legal_name ?? org.name}
    >
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          orgName={org.name}
          legalName={org.legal_name}
          siren={org.siren}
          registeredAddress={org.registered_address}
        />

        <Text style={pdfStyles.title}>
          Attribution d&apos;Actions Gratuites{isPerformance ? ' (Performance)' : ''}
        </Text>
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
            <Text style={pdfStyles.tableCellLabel}>Nombre d&apos;actions gratuites</Text>
            <Text style={pdfStyles.tableCellValue}>{formatNumber(award.units_granted)}</Text>
          </View>
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellLabel}>Début période d&apos;acquisition</Text>
            <Text style={pdfStyles.tableCellValue}>{formatDate(award.vesting_start_date)}</Text>
          </View>
          <View style={pdfStyles.tableRowLast}>
            <Text style={pdfStyles.tableCellLabel}>Période de conservation</Text>
            <Text style={pdfStyles.tableCellValue}>Conformément aux dispositions du Plan</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>3. Conditions générales</Text>
        <Text style={pdfStyles.paragraph}>
          Les présentes Actions Gratuites sont attribuées conformément aux dispositions des articles
          L. 225-197-1 et suivants du Code de commerce, dans le cadre du Plan{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{plan.name}</Text> dont le bénéficiaire
          reconnaît avoir pris connaissance.
        </Text>
        <Text style={pdfStyles.paragraph}>
          L&apos;acquisition définitive (vesting) des actions est subordonnée à la présence du
          bénéficiaire au sein de la société pendant la période d&apos;acquisition, ainsi qu&apos;au
          respect des conditions définies dans le Plan.
        </Text>
        {isPerformance ? (
          <Text style={pdfStyles.paragraph}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Conditions de performance :</Text>{' '}
            l&apos;acquisition de tout ou partie de ces actions gratuites est par ailleurs soumise à
            la réalisation d&apos;objectifs de performance définis par le Plan et mesurés à la fin
            de la période d&apos;acquisition.
          </Text>
        ) : null}
        <Text style={pdfStyles.paragraph}>
          La période de conservation post-acquisition s&apos;applique conformément au Plan. Pendant
          cette période, les actions sont incessibles. À l&apos;issue de la période de conservation,
          le bénéficiaire pourra librement céder ses actions, sous réserve des obligations légales
          et des éventuelles fenêtres négatives.
        </Text>

        <Text style={pdfStyles.legalNote}>
          Document établi en application des articles L. 225-197-1 à L. 225-197-6 du Code de
          commerce et conformément aux décisions du Conseil d&apos;administration / de
          l&apos;Assemblée générale. La signature électronique vaut acceptation pleine et entière
          des conditions.
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
