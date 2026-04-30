import { View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../styles';

/**
 * Module 6 B2 — Bloc signature : 2 cadres avec lignes pour signature
 * manuscrite (bénéficiaire + représentant société).
 *
 * V1 informatif uniquement — la signature électronique Yousign B3 ajoutera
 * son propre bloc certificat en post-completion.
 */
export function PdfSignatureBlock({
  beneficiaryName,
  companyRepName,
  companyName,
}: {
  beneficiaryName: string;
  companyRepName?: string | null;
  companyName: string;
}) {
  return (
    <View style={pdfStyles.signatureBlock}>
      <View style={pdfStyles.signatureBox}>
        <Text style={pdfStyles.signatureLabel}>Bénéficiaire</Text>
        <Text style={pdfStyles.signatureName}>{beneficiaryName}</Text>
        <Text style={pdfStyles.signatureRole}>Lu et approuvé, Bon pour accord</Text>
      </View>
      <View style={pdfStyles.signatureBox}>
        <Text style={pdfStyles.signatureLabel}>Pour la société</Text>
        <Text style={pdfStyles.signatureName}>{companyRepName ?? companyName}</Text>
        <Text style={pdfStyles.signatureRole}>Représentant légal</Text>
      </View>
    </View>
  );
}
