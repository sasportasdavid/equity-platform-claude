import * as React from 'react';
import { formatDiffValue, shouldRenderAsBlock } from '@/lib/audit/json-diff';

/**
 * PR #41 B5 — Affiche le `metadata` jsonb d'un audit_event en table key-value.
 * PR #45 B4 — Bug #6 P2 fix : objects/arrays nested rendus dans `<pre>` avec
 * white-space: pre-wrap (au lieu d'oneliner illisibles), empty {} → "—".
 *
 * Server component pure. Utilise `formatDiffValue` pour le rendu type-aware,
 * et `shouldRenderAsBlock` pour décider du wrapper (`<pre>` vs inline `<dd>`).
 *
 * Liste filtrée : on masque les clés dont la valeur est `null`/`undefined`/
 * empty-string (réduit le bruit V1).
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
      {entries.map(([key, value]) => {
        const formatted = formatDiffValue(value);
        const block = shouldRenderAsBlock(value);
        return (
          <React.Fragment key={key}>
            <dt>{key}</dt>
            <dd>{block ? <pre className="cw-audit-kv-block">{formatted}</pre> : formatted}</dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}
