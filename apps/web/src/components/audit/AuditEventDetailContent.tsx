import { verbalizeEvent } from '@/lib/audit/format';
import { shortHash } from '@/lib/audit/hash';
import { getAuditEventById } from '@/server/queries/audit-detail';
import { HashVerificationBlock } from './HashVerificationBlock';
import { JsonDiffView } from './JsonDiffView';
import { MetadataView } from './MetadataView';
import { ResourceLink } from './ResourceLink';

/**
 * PR #41 B5 — Contenu RSC du drawer détail event.
 *
 * Server component : fetch l'event via `getAuditEventById` (RLS scope auto),
 * verbalize, et rend les 5 sections définies dans le brief :
 * 1. Header — verbalize en italic Fraunces + meta (timestamp Paris + email)
 * 2. DÉTAILS — event_type, resource, IP, request_id (key-value)
 * 3. CHANGEMENTS (si has diff) | MÉTADONNÉES (sinon) | empty state (rare)
 * 4. EMPREINTE — hash SHA-256 full + ✓ vérifiée + bouton Copier
 * 5. RESSOURCE — Link dynamique vers /dashboard/{plans|awards|...}/{id}
 *
 * Si event introuvable (RLS deny ou id invalide) : empty state propre,
 * pas de throw.
 */

const PARIS_TZ = 'Europe/Paris';
const FULL_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: PARIS_TZ,
});

function formatFullTimestamp(iso: string): string {
  const raw = FULL_TIMESTAMP_FORMATTER.format(new Date(iso));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export type AuditEventDetailContentProps = {
  eventId: string;
};

export async function AuditEventDetailContent({ eventId }: AuditEventDetailContentProps) {
  const event = await getAuditEventById(eventId);

  if (!event) {
    return (
      <div className="cw-audit-drawer-body" data-testid="audit-drawer-not-found">
        <header className="cw-audit-drawer-header">
          <div>
            <p id="audit-drawer-title" className="cw-audit-drawer-title">
              Événement introuvable
            </p>
          </div>
        </header>
        <p className="cw-audit-empty-detail">
          Cet événement est introuvable ou supprimé. Il a peut-être été enregistré sur une autre
          organisation, ou votre session ne dispose plus de la permission de consultation.
        </p>
      </div>
    );
  }

  const verbalization = verbalizeEvent(event);
  const hasDiff = event.before_state !== null || event.after_state !== null;
  const hasMetadata = Object.keys(event.metadata).length > 0;
  const actor = event.user_email ?? 'Système';

  return (
    <>
      <header className="cw-audit-drawer-header">
        <div className="min-w-0">
          {event.resource_type ? (
            <p className="cw-audit-drawer-overline">{event.resource_type.toUpperCase()}</p>
          ) : null}
          <h2 id="audit-drawer-title" className="cw-audit-drawer-title">
            {verbalization.verb}
            {verbalization.object ? (
              <>
                {' '}
                <span className="cw-audit-object">{verbalization.object}</span>
              </>
            ) : null}
            {verbalization.context ? (
              <span className="cw-audit-context">{verbalization.context}</span>
            ) : null}
          </h2>
          <p className="cw-audit-drawer-meta">
            {formatFullTimestamp(event.occurred_at)} · Heure de Paris
            <br />
            {actor}
          </p>
        </div>
      </header>

      <div className="cw-audit-drawer-body">
        {/* Section 2 — DÉTAILS */}
        <section data-testid="audit-drawer-section-details">
          <h3 className="cw-audit-section-title">Détails</h3>
          <dl className="cw-audit-kv">
            <dt>type</dt>
            <dd>
              <code>{event.event_type}</code>
            </dd>
            {event.resource_type && event.resource_id ? (
              <>
                <dt>ressource</dt>
                <dd>
                  {event.resource_type} · #{shortHash(event.resource_id.replace(/-/g, ''))}
                </dd>
              </>
            ) : null}
            {event.ip_address ? (
              <>
                <dt>ip</dt>
                <dd>
                  <code>{event.ip_address}</code>
                </dd>
              </>
            ) : null}
            {event.request_id ? (
              <>
                <dt>request id</dt>
                <dd>
                  <code>{event.request_id}</code>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        {/* Section 3 — CHANGEMENTS ou MÉTADONNÉES (cas dominant 90%) */}
        {hasDiff ? (
          <section data-testid="audit-drawer-section-changes">
            <h3 className="cw-audit-section-title">Changements</h3>
            <JsonDiffView before={event.before_state} after={event.after_state} />
          </section>
        ) : hasMetadata ? (
          <section data-testid="audit-drawer-section-metadata">
            <h3 className="cw-audit-section-title">Métadonnées</h3>
            <MetadataView metadata={event.metadata} />
          </section>
        ) : (
          <section data-testid="audit-drawer-section-no-detail">
            <h3 className="cw-audit-section-title">Détails</h3>
            <p className="cw-audit-empty-detail">Aucun détail supplémentaire pour cet événement.</p>
          </section>
        )}

        {/* Section 4 — EMPREINTE */}
        <section data-testid="audit-drawer-section-hash">
          <h3 className="cw-audit-section-title">Empreinte</h3>
          <HashVerificationBlock event={event} />
        </section>

        {/* Section 5 — RESSOURCE */}
        <section data-testid="audit-drawer-section-resource">
          <h3 className="cw-audit-section-title">Ressource</h3>
          <ResourceLink
            resourceType={event.resource_type}
            resourceId={event.resource_id}
            metadata={event.metadata}
          />
        </section>
      </div>
    </>
  );
}
