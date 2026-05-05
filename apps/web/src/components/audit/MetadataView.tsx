import * as React from 'react';
import { formatDiffValue } from '@/lib/audit/json-diff';

/**
 * PR #41 B5 — Affiche le `metadata` jsonb d'un audit_event en table key-value
 * formatée. C'est le cas dominant (90% des events n'ont que metadata).
 *
 * Server component pure. Utilise `formatDiffValue` pour un rendu type-aware
 * cohérent avec `JsonDiffView` (number → fr-FR, bool → Oui/Non, ISO date →
 * fr-FR long, UUID → tronqué, object → JSON pretty).
 *
 * Liste filtrée : on masque les clés dont la valeur est `null`/`undefined`/
 * empty-string (réduit le bruit V1, V2 = formatter sémantique par event_type).
 */

export type MetadataViewProps = {
  metadata: Record<string, unknown>;
};

export function MetadataView({ metadata }: MetadataViewProps) {
  const entries = Object.entries(metadata).filter(([, v]) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.length === 0) return false;
    return true;
  });

  if (entries.length === 0) {
    return (
      <p className="cw-audit-empty-detail" data-testid="audit-drawer-metadata-empty">
        Aucun détail supplémentaire pour cet événement.
      </p>
    );
  }

  return (
    <dl className="cw-audit-kv" data-testid="audit-drawer-metadata">
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt>{key}</dt>
          <dd>{formatDiffValue(value)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
