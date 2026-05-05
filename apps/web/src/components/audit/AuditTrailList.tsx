import { verbalizeEvent } from '@/lib/audit/format';
import { computeAuditEventHash, shortHash } from '@/lib/audit/hash';
import type { AuditEventRow } from '@/server/queries/audit';
import { AuditEventRowClient } from './AuditEventRowClient';

/**
 * PR #39 B4 — Liste chronologique des audit_events groupée par jour.
 *
 * Server component. Reçoit les events triés DESC (cf `getAuditEvents`),
 * les groupe par jour (locale `fr-FR`, timezone Europe/Paris), et rend
 * chaque event en format éditorial via `verbalizeEvent`.
 *
 * Le hash SHA-256 est calculé à la volée côté server (`computeAuditEventHash`)
 * et tronqué à 8 chars (`shortHash`) pour l'affichage UI.
 *
 * a11y : `<ol role="list">` avec un `<li>` par jour ; chaque event est un
 * `<article role="listitem">` à l'intérieur.
 */

const PARIS_TZ = 'Europe/Paris';
const DAY_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: PARIS_TZ,
});
const TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: PARIS_TZ,
});
const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: PARIS_TZ,
});

function dayKey(iso: string): string {
  return DAY_KEY_FORMATTER.format(new Date(iso));
}
function dayLabel(iso: string): string {
  // "lundi 5 mai 2026" — capitalise le 1er char
  const raw = DAY_FORMATTER.format(new Date(iso));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
function timeLabel(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
}

export type AuditTrailListProps = {
  events: ReadonlyArray<AuditEventRow>;
};

export function AuditTrailList({ events }: AuditTrailListProps) {
  if (events.length === 0) {
    return (
      <p
        className="serif-italic text-ink-500 text-sm"
        role="status"
        data-testid="audit-trail-empty"
      >
        Aucun événement enregistré sur cette période.
      </p>
    );
  }

  // Group by day (ISO YYYY-MM-DD Paris)
  const groups = new Map<string, AuditEventRow[]>();
  for (const ev of events) {
    const key = dayKey(ev.occurred_at);
    const list = groups.get(key);
    if (list) list.push(ev);
    else groups.set(key, [ev]);
  }

  const orderedKeys = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <ol className="cw-audit-list" data-testid="audit-trail-list" aria-label="Journal chronologique">
      {orderedKeys.map((key) => {
        const dayEvents = groups.get(key)!;
        const firstIso = dayEvents[0]!.occurred_at;
        return (
          <li key={key}>
            <header className="cw-audit-day">
              <h2 className="cw-audit-day-title">{dayLabel(firstIso)}</h2>
              <span className="cw-audit-day-count">
                {dayEvents.length} {dayEvents.length > 1 ? 'événements' : 'événement'}
              </span>
            </header>
            {dayEvents.map((ev) => (
              <AuditEventRowView key={ev.id} event={ev} />
            ))}
          </li>
        );
      })}
    </ol>
  );
}

function AuditEventRowView({ event }: { event: AuditEventRow }) {
  const verbalization = verbalizeEvent(event);
  const hash = shortHash(computeAuditEventHash(event));
  const actor = event.user_email ?? 'Système';
  // a11y label complet pour le bouton click — verbalize + actor lisible
  // par screen reader avant l'ouverture du drawer.
  const ariaLabel = `Voir le détail de l'événement : ${verbalization.verb}${
    verbalization.object ? ' ' + verbalization.object : ''
  } — ${actor}`;

  return (
    <AuditEventRowClient eventId={event.id} ariaLabel={ariaLabel}>
      <article className="cw-audit-event" role="listitem" data-testid="audit-trail-event">
        <time className="cw-audit-time" dateTime={event.occurred_at}>
          {timeLabel(event.occurred_at)}
        </time>
        <div className="cw-audit-body">
          <span className="cw-audit-actor" title={actor}>
            {actor}
          </span>
          <p className="cw-audit-verb">
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
          </p>
        </div>
        <code
          className="cw-audit-hash"
          aria-label={`Empreinte cryptographique de l'événement (tronquée) : ${hash}`}
        >
          #{hash}
        </code>
      </article>
    </AuditEventRowClient>
  );
}
