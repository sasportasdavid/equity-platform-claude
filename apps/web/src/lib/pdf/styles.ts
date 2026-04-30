import { StyleSheet } from '@react-pdf/renderer';

/**
 * Module 6 B2 — Styles partagés des templates PDF.
 *
 * Sobre : Helvetica natif (pas de fonts externes), 11pt body, gris/noir.
 * V2 = thème par org (couleurs custom).
 */

export const colors = {
  text: '#1a1a1a',
  muted: '#6b6b6b',
  border: '#cccccc',
  bgLight: '#f5f5f5',
  primary: '#1f3a8a', // indigo sombre — utilisé pour titres section
};

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: colors.text,
    lineHeight: 1.4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    color: colors.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 10,
    textAlign: 'center',
    color: colors.muted,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paragraph: {
    fontSize: 11,
    marginBottom: 8,
    textAlign: 'justify',
  },
  small: {
    fontSize: 9,
    color: colors.muted,
  },
  table: {
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  tableCellLabel: {
    width: '40%',
    padding: 6,
    backgroundColor: colors.bgLight,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  tableCellValue: {
    width: '60%',
    padding: 6,
    fontSize: 10,
  },
  signatureBlock: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBox: {
    width: '45%',
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingTop: 6,
  },
  signatureLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  signatureName: {
    fontSize: 10,
    marginTop: 2,
  },
  signatureRole: {
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
  legalNote: {
    fontSize: 9,
    color: colors.muted,
    fontStyle: 'italic',
    marginTop: 12,
    padding: 6,
    backgroundColor: colors.bgLight,
  },
});
