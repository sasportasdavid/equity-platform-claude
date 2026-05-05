import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { verbalizeEvent } from './format';
import type { AuditEventForExport } from '@/server/queries/audit-export';
import type { AuditExportJsonPayload } from './export-json-builder';

/**
 * PR #42 B3 — AuditReportPdf : rapport PDF du registre d'audit.
 *
 * 3 sections logiques (autopagination par @react-pdf/renderer) :
 * 1. Cover — overline brass + titre serif italique + integrity summary +
 *    chain head hash mono
 * 2. Chronologie — events triés par chain_position ASC, format
 *    [position] [HH:mm:ss] [actor] verbalize() — hash short
 * 3. Footer (last page) — verify_endpoint_url + export_signature +
 *    legal mention "Tout événement modifié invalide la chaîne SHA-256"
 *
 * V1 stylistique : Helvetica natif (pas de Fraunces — Font.register du CDN
 * peut timeout l'EF Supabase + render local. Module 6 a fait le même choix).
 * V1.X : embed Fraunces + Inter via Buffer pré-loaded en Storage.
 *
 * @react-pdf/renderer ^4.5.1 (cf B0 confirmé).
 */

// Palette DS V1 inline (pas d'import CSS depuis le runtime PDF)
const COLORS = {
  ink: '#1B1F2A', // ink-900
  inkMuted: '#7A7F8B', // ink-500
  brass: '#B8865B', // brass-500
  brassDark: '#8C6240', // brass-700
  paper: '#FAF7F0', // paper-50
  paperBorder: '#DCD5BF', // paper-300
  bond: '#0F6B47', // bond-500
  title: '#A23131', // title-500
};

const styles = StyleSheet.create({
  // === Page commune ===
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: COLORS.ink,
    lineHeight: 1.4,
  },

  // === Cover page ===
  coverContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  coverOverline: {
    fontFamily: 'Courier-Bold',
    fontSize: 9,
    color: COLORS.brassDark,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  coverTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 26,
    color: COLORS.ink,
    lineHeight: 1.2,
    marginBottom: 6,
  },
  coverTitleAccent: {
    fontFamily: 'Helvetica-Oblique',
    color: COLORS.brassDark,
  },
  coverRule: {
    width: 64,
    height: 1.2,
    backgroundColor: COLORS.brass,
    marginTop: 8,
    marginBottom: 14,
  },
  coverSubtitle: {
    fontSize: 11,
    color: COLORS.inkMuted,
    marginBottom: 24,
    maxWidth: 360,
    lineHeight: 1.5,
  },

  // === Integrity card ===
  integrityCard: {
    backgroundColor: COLORS.paper,
    borderWidth: 1,
    borderColor: COLORS.paperBorder,
    borderRadius: 4,
    padding: 14,
    marginVertical: 18,
  },
  integrityCardLine: {
    flexDirection: 'row',
    fontSize: 10,
    marginBottom: 6,
  },
  integrityCardLabel: {
    width: 130,
    color: COLORS.inkMuted,
    fontFamily: 'Courier',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  integrityCardValue: {
    color: COLORS.ink,
    fontFamily: 'Courier',
    flex: 1,
    fontSize: 10,
  },
  integrityCardHashFull: {
    color: COLORS.ink,
    fontFamily: 'Courier',
    fontSize: 8.5,
    flex: 1,
    flexWrap: 'wrap',
  },
  integritySealOk: {
    color: COLORS.bond,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  integritySealBroken: {
    color: COLORS.title,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },

  // === Section header (chronologie / footer) ===
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.paperBorder,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: COLORS.ink,
  },
  sectionCount: {
    marginLeft: 8,
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.inkMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // === Event row ===
  eventRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.paperBorder,
  },
  eventPosition: {
    width: 32,
    fontFamily: 'Courier',
    fontSize: 8.5,
    color: COLORS.inkMuted,
  },
  eventTime: {
    width: 56,
    fontFamily: 'Courier',
    fontSize: 8.5,
    color: COLORS.inkMuted,
  },
  eventBody: {
    flex: 1,
    paddingRight: 8,
  },
  eventActor: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: COLORS.inkMuted,
    marginBottom: 2,
  },
  eventVerb: {
    fontSize: 10,
    color: COLORS.ink,
    lineHeight: 1.35,
  },
  eventObject: {
    fontFamily: 'Helvetica-Oblique',
    color: COLORS.brassDark,
  },
  eventContext: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.inkMuted,
    marginLeft: 4,
  },
  eventHash: {
    width: 56,
    fontFamily: 'Courier',
    fontSize: 8,
    color: COLORS.inkMuted,
    textAlign: 'right',
  },
  eventLegacy: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 8,
    color: COLORS.inkMuted,
  },

  // === Footer page ===
  footerLegal: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 9.5,
    color: COLORS.inkMuted,
    marginTop: 18,
    lineHeight: 1.5,
    maxWidth: 460,
  },
  footerMonoLink: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.brassDark,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  footerSignatureLabel: {
    fontFamily: 'Courier-Bold',
    fontSize: 9,
    color: COLORS.brassDark,
    letterSpacing: 1.2,
    marginTop: 18,
    marginBottom: 4,
  },

  // === Page footer (running) ===
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontFamily: 'Courier',
    fontSize: 8,
    color: COLORS.inkMuted,
  },
});

const PARIS_TZ = 'Europe/Paris';
const TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: PARIS_TZ,
});
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: PARIS_TZ,
});

function shortHash8(hash: string | null): string {
  return hash ? hash.slice(0, 8) : '—';
}

function pluralFr(n: number, singular: string, plural: string): string {
  return `${n} ${n > 1 ? plural : singular}`;
}

export type AuditReportPdfProps = {
  payload: AuditExportJsonPayload;
  events: ReadonlyArray<AuditEventForExport>;
  exportSignature: string;
};

export function AuditReportPdf({ payload, events, exportSignature }: AuditReportPdfProps) {
  const { integrity, generated_by, generated_at, range, truncated } = payload;
  const orgLabel = generated_by.org_name ?? generated_by.org_id;
  const generatedDate = new Date(generated_at);
  const generatedDateLabel = FULL_DATE_FORMATTER.format(generatedDate);

  const integritySealLabel = integrity.is_intact
    ? '✓ Chaîne intègre'
    : '⚠ Rupture détectée — chaîne potentiellement altérée';
  const integritySealStyle = integrity.is_intact
    ? styles.integritySealOk
    : styles.integritySealBroken;

  return (
    <Document
      title={`Registre d'audit · ${orgLabel} · ${generatedDateLabel}`}
      author="Capiwise"
      subject="Audit trail export — tamper-evident SHA-256 chain"
    >
      {/* === COVER PAGE === */}
      <Page size="A4" style={styles.page}>
        <View style={styles.coverContainer}>
          <Text style={styles.coverOverline}>Registre d&apos;audit · Conformité · {orgLabel}</Text>
          <Text style={styles.coverTitle}>
            Tout ce qui s&apos;est passé,{' '}
            <Text style={styles.coverTitleAccent}>scellé et daté.</Text>
          </Text>
          <View style={styles.coverRule} />
          <Text style={styles.coverSubtitle}>
            Chaque événement est horodaté, signé cryptographiquement (SHA-256) et chaîné au
            précédent. Ce registre est immuable et vérifiable hors ligne via la signature
            d&apos;export en dernière page.
          </Text>

          {/* Integrity summary card */}
          <View style={styles.integrityCard}>
            <Text style={integritySealStyle}>{integritySealLabel}</Text>

            <View style={[styles.integrityCardLine, { marginTop: 12 }]}>
              <Text style={styles.integrityCardLabel}>Algorithme</Text>
              <Text style={styles.integrityCardValue}>SHA-256</Text>
            </View>
            <View style={styles.integrityCardLine}>
              <Text style={styles.integrityCardLabel}>Genesis source</Text>
              <Text style={styles.integrityCardValue}>{integrity.genesis_source}</Text>
            </View>
            <View style={styles.integrityCardLine}>
              <Text style={styles.integrityCardLabel}>Événements</Text>
              <Text style={styles.integrityCardValue}>
                {pluralFr(events.length, 'événement', 'événements')}
                {truncated ? ' (export tronqué à 10 000)' : ''}
              </Text>
            </View>
            <View style={styles.integrityCardLine}>
              <Text style={styles.integrityCardLabel}>Chaînés</Text>
              <Text style={styles.integrityCardValue}>
                {integrity.events_signed} / {integrity.total_events} ({integrity.verified_events}{' '}
                vérifiés DB)
              </Text>
            </View>
            {integrity.chain_position_max !== null ? (
              <View style={styles.integrityCardLine}>
                <Text style={styles.integrityCardLabel}>Position max</Text>
                <Text style={styles.integrityCardValue}>#{integrity.chain_position_max}</Text>
              </View>
            ) : null}
            {integrity.chain_head_hash ? (
              <View style={styles.integrityCardLine}>
                <Text style={styles.integrityCardLabel}>Hash de tête</Text>
                <Text style={styles.integrityCardHashFull}>{integrity.chain_head_hash}</Text>
              </View>
            ) : null}
            {integrity.broken_at !== null ? (
              <View style={[styles.integrityCardLine, { marginTop: 6 }]}>
                <Text style={[styles.integrityCardLabel, { color: COLORS.title }]}>
                  Rupture position
                </Text>
                <Text style={[styles.integrityCardValue, { color: COLORS.title }]}>
                  #{integrity.broken_at}
                </Text>
              </View>
            ) : null}

            <View style={[styles.integrityCardLine, { marginTop: 14, marginBottom: 0 }]}>
              <Text style={styles.integrityCardLabel}>Période</Text>
              <Text style={styles.integrityCardValue}>
                {range.from ? `${range.from} → ${range.to ?? 'présent'}` : 'Tous les événements'}
              </Text>
            </View>
            {range.event_type_prefix ? (
              <View style={styles.integrityCardLine}>
                <Text style={styles.integrityCardLabel}>Filtre type</Text>
                <Text style={styles.integrityCardValue}>{range.event_type_prefix}.*</Text>
              </View>
            ) : null}
            <View style={styles.integrityCardLine}>
              <Text style={styles.integrityCardLabel}>Généré le</Text>
              <Text style={styles.integrityCardValue}>{generatedDateLabel}</Text>
            </View>
            <View style={[styles.integrityCardLine, { marginBottom: 0 }]}>
              <Text style={styles.integrityCardLabel}>Généré par</Text>
              <Text style={styles.integrityCardValue}>{generated_by.user_email}</Text>
            </View>
          </View>
        </View>

        <View style={styles.pageNumber} fixed>
          <Text>Capiwise · Registre d&apos;audit</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* === CHRONOLOGIE — autopagine === */}
      <Page size="A4" style={styles.page}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Chronologie</Text>
          <Text style={styles.sectionCount}>
            {pluralFr(events.length, 'événement', 'événements')}
          </Text>
        </View>

        {events.map((ev) => {
          const verb = verbalizeEvent(ev);
          const actor = ev.user_email ?? 'Système';
          const positionLabel = ev.chain_position !== null ? `#${ev.chain_position}` : '—';
          const hashLabel = ev.event_hash !== null ? shortHash8(ev.event_hash) : '—';
          return (
            <View key={ev.id} style={styles.eventRow} wrap={false}>
              <Text style={styles.eventPosition}>{positionLabel}</Text>
              <Text style={styles.eventTime}>
                {TIME_FORMATTER.format(new Date(ev.occurred_at))}
              </Text>
              <View style={styles.eventBody}>
                <Text style={styles.eventActor}>{actor}</Text>
                <Text style={styles.eventVerb}>
                  {verb.verb}
                  {verb.object ? (
                    <>
                      {' '}
                      <Text style={styles.eventObject}>{verb.object}</Text>
                    </>
                  ) : null}
                  {verb.context ? <Text style={styles.eventContext}> {verb.context}</Text> : null}
                </Text>
                {ev.chain_position === null ? (
                  <Text style={styles.eventLegacy}>(événement pré-Module 13 — non chaîné)</Text>
                ) : null}
              </View>
              <Text style={styles.eventHash}>{hashLabel}</Text>
            </View>
          );
        })}

        <View style={styles.pageNumber} fixed>
          <Text>Capiwise · Registre d&apos;audit</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* === FOOTER PAGE — verification cryptographique === */}
      <Page size="A4" style={styles.page}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Vérification cryptographique</Text>
        </View>

        <Text style={styles.footerLegal}>
          Ce registre est immutablement chaîné par hashes SHA-256 successifs : chaque événement
          calcule un hash dérivé de son contenu et du hash du précédent (genesis dérivé pour le
          premier événement). Toute modification d&apos;un événement passé invaliderait la chaîne de
          tous les événements suivants. La signature d&apos;export ci-dessous permet à un auditeur
          externe de vérifier que ce document n&apos;a pas été modifié après téléchargement.
        </Text>

        <Text style={styles.footerSignatureLabel}>HASH DE TÊTE</Text>
        <Text style={styles.footerMonoLink}>
          {integrity.chain_head_hash ?? '— (aucun événement chaîné)'}
        </Text>

        <Text style={styles.footerSignatureLabel}>SIGNATURE D&apos;EXPORT (SHA-256)</Text>
        <Text style={styles.footerMonoLink}>{exportSignature}</Text>

        <Text style={styles.footerSignatureLabel}>VÉRIFIER EN LIGNE</Text>
        <Text style={styles.footerMonoLink}>{integrity.verify_endpoint_url}</Text>

        <Text style={[styles.footerLegal, { marginTop: 28 }]}>
          Pour vérifier la signature d&apos;export hors ligne :{' '}
          <Text style={{ fontFamily: 'Courier', fontSize: 9 }}>
            sha256sum capiwise-audit-XXX.json
          </Text>{' '}
          doit retourner la signature ci-dessus, après avoir retiré le bloc
          <Text style={{ fontFamily: 'Courier', fontSize: 9 }}>
            {' '}
            &quot;export_signature&quot;
          </Text>{' '}
          du fichier JSON.
        </Text>

        <View style={styles.pageNumber} fixed>
          <Text>Capiwise · Registre d&apos;audit</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
