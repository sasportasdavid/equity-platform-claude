/**
 * Helpers pure pour `JsonDiffViewer` — extraits pour être testables sans
 * Vitest+JSX (qui demanderait un plugin React supplémentaire).
 */

export function stringifySnapshot(v: unknown): string {
  if (v === null || v === undefined) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * Diff naïve ligne par ligne entre deux snapshots JSON. Retourne le set
 * des index de lignes qui diffèrent. Pas de LCS — pour des to_jsonb()
 * d'une même structure (`awards.*` ROWTYPE), l'ordre des clés est stable
 * et la comparaison index-à-index suffit.
 */
export function computeLineDiff(beforeStr: string, afterStr: string): Set<number> {
  const beforeLines = beforeStr.split('\n');
  const afterLines = afterStr.split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const diff = new Set<number>();
  for (let i = 0; i < maxLen; i++) {
    if (beforeLines[i] !== afterLines[i]) diff.add(i);
  }
  return diff;
}

export function isEmptyDiff(before: unknown, after: unknown): boolean {
  return (before === null || before === undefined) && (after === null || after === undefined);
}
