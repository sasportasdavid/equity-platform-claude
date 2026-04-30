import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors } from '../styles';

const headerStyles = StyleSheet.create({
  container: {
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orgName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
  },
  orgInfo: {
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
});

/**
 * Module 6 B2 — Header PDF : nom légal + SIREN + adresse de l'org.
 *
 * V1 sans logo (pas d'upload géré). V2 ajoutera plan.brand_logo_url.
 */
export function PdfHeader({
  orgName,
  legalName,
  siren,
  registeredAddress,
}: {
  orgName: string;
  legalName: string | null;
  siren: string | null;
  registeredAddress: string | null;
}) {
  return (
    <View style={headerStyles.container} fixed>
      <Text style={headerStyles.orgName}>{legalName ?? orgName}</Text>
      {siren ? <Text style={headerStyles.orgInfo}>SIREN {siren}</Text> : null}
      {registeredAddress ? <Text style={headerStyles.orgInfo}>{registeredAddress}</Text> : null}
    </View>
  );
}
