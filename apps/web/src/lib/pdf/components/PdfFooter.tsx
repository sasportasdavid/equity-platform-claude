import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors } from '../styles';
import { formatDateShort } from '../formatters';

const footerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    fontSize: 9,
    color: colors.muted,
  },
  left: { width: '40%' },
  center: { width: '20%', textAlign: 'center' },
  right: { width: '40%', textAlign: 'right' },
});

/**
 * Module 6 B2 — Footer PDF : doc_number + date génération + numéro de page.
 */
export function PdfFooter({
  documentNumber,
  generatedAt,
}: {
  documentNumber: string;
  generatedAt: string;
}) {
  return (
    <View style={footerStyles.container} fixed>
      <Text style={footerStyles.left}>Document N° {documentNumber}</Text>
      <Text
        style={footerStyles.center}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
      />
      <Text style={footerStyles.right}>Généré le {formatDateShort(generatedAt)}</Text>
    </View>
  );
}
