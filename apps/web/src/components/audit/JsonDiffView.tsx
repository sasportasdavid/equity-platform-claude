import { computeJsonDiff, formatDiffValue } from '@/lib/audit/json-diff';

/**
 * PR #41 B5 — Affiche un diff key-level entre `before_state` et `after_state`.
 *
 * Server component pure. Si les 2 sont null → ne rend rien (parent affiche
 * `MetadataView` à la place). Si les 2 sont définis mais identiques (cas
 * théorique) → liste vide affichée comme "(aucun changement détecté)".
 *
 * Layout vertical : pour chaque entry, label mono + before strikethrough +
 * after avec flèche → en couleur signature (bond/brass/saffron selon type).
 */

export type JsonDiffViewProps = {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export function JsonDiffView({ before, after }: JsonDiffViewProps) {
  const entries = computeJsonDiff(before, after);

  if (entries.length === 0) {
    return (
      <p className="cw-audit-empty-detail" data-testid="audit-drawer-diff-empty">
        Aucun changement détecté entre l&apos;avant et l&apos;après.
      </p>
    );
  }

  return (
    <ul className="cw-audit-diff" data-testid="audit-drawer-diff">
      {entries.map((entry) => (
        <li key={entry.key} className="cw-audit-diff-entry" data-diff-type={entry.type}>
          <div className="cw-audit-diff-key">{entry.key}</div>
          {entry.type === 'added' ? (
            <div className="cw-audit-diff-after">{formatDiffValue(entry.after)}</div>
          ) : entry.type === 'removed' ? (
            <div className="cw-audit-diff-before">{formatDiffValue(entry.before)}</div>
          ) : (
            <>
              <div className="cw-audit-diff-before">{formatDiffValue(entry.before)}</div>
              <div className="cw-audit-diff-after">{formatDiffValue(entry.after)}</div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
