import { computeJsonDiff, formatDiffValue } from '@/lib/audit/json-diff';

/**
 * PR #41 B5 — Affiche un diff key-level entre `before_state` et `after_state`.
 * PR #45 B3 — Ajout try/catch defensive (Bug #5 P1, race condition possible
 * sur 1er render après navigate).
 *
 * Server component pure. Si les 2 sont null → ne rend rien (parent affiche
 * `MetadataView` à la place). Si les 2 sont définis mais identiques (cas
 * théorique) → liste vide affichée comme "(aucun changement détecté)".
 *
 * Layout vertical : pour chaque entry, label mono + before strikethrough +
 * after avec flèche → en couleur signature.
 *
 * Fallback : si computeJsonDiff ou formatDiffValue throw (cas edge non prévu),
 * on rend un message gracieux au lieu de crash le drawer entier. La parent
 * `AuditDrawerErrorBoundary` est le filet ultime.
 */

export type JsonDiffViewProps = {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export function JsonDiffView({ before, after }: JsonDiffViewProps) {
  let entries;
  try {
    entries = computeJsonDiff(before, after);
  } catch (err) {
    console.error('[JsonDiffView] computeJsonDiff failed', { err, before, after });
    return (
      <p className="cw-audit-empty-detail" data-testid="audit-drawer-diff-error">
        Diff non disponible — structure de données inattendue.
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="cw-audit-empty-detail" data-testid="audit-drawer-diff-empty">
        Aucun changement détecté entre l&apos;avant et l&apos;après.
      </p>
    );
  }

  return (
    <ul className="cw-audit-diff" data-testid="audit-drawer-diff">
      {entries.map((entry) => {
        let beforeStr: string;
        let afterStr: string;
        try {
          beforeStr = formatDiffValue(entry.before);
          afterStr = formatDiffValue(entry.after);
        } catch (err) {
          console.error('[JsonDiffView] formatDiffValue failed', { err, entry });
          beforeStr = '(rendu impossible)';
          afterStr = '(rendu impossible)';
        }

        return (
          <li key={entry.key} className="cw-audit-diff-entry" data-diff-type={entry.type}>
            <div className="cw-audit-diff-key">{entry.key}</div>
            {entry.type === 'added' ? (
              <div className="cw-audit-diff-after">{afterStr}</div>
            ) : entry.type === 'removed' ? (
              <div className="cw-audit-diff-before">{beforeStr}</div>
            ) : (
              <>
                <div className="cw-audit-diff-before">{beforeStr}</div>
                <div className="cw-audit-diff-after">{afterStr}</div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
