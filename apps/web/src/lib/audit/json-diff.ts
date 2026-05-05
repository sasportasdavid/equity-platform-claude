/**
 * PR #41 B2 — Diff key-level entre `before_state` et `after_state` d'un
 * audit_event, pour l'affichage structuré du drawer V1.5.
 *
 * Différent du `json-diff-helpers.ts` (Module 3b modifications) qui fait du
 * diff ligne-par-ligne sur stringify : ici on retourne des triples
 * `{key, type, before, after}` rendus par `JsonDiffView` en lignes éditoriales
 * type "Statut · PROPOSED → GRANTED".
 *
 * V1.5 : diff peu profond (Object.keys union + deep equality JSON sur les
 * valeurs). Les audit events ont des shapes plates (`{status, granted_at,
 * units}`) — pas de récursion. Si un objet nested change, il sort comme
 * 'modified' avec before/after = l'objet entier (rendu pretty-printed côté UI).
 *
 * Lib pure (pas d'I/O), Node + browser compatible.
 */

export type DiffType = 'added' | 'removed' | 'modified';

export type DiffEntry = {
  key: string;
  type: DiffType;
  before: unknown;
  after: unknown;
};

/**
 * Comparaison "deep equality" via JSON.stringify. Suffit pour les valeurs
 * stockées dans `before_state` / `after_state` (jsonb plats). Si un audit
 * event V2 a des cycles, JSON.stringify throw — la fn catch et fallback
 * sur `===` (les cycles sont des bugs côté write side, pas attendu V1).
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function computeJsonDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): DiffEntry[] {
  const beforeObj = before ?? {};
  const afterObj = after ?? {};
  const allKeys = new Set<string>([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  const entries: DiffEntry[] = [];
  for (const key of allKeys) {
    const inBefore = key in beforeObj;
    const inAfter = key in afterObj;
    const beforeVal = beforeObj[key];
    const afterVal = afterObj[key];

    if (!inBefore && inAfter) {
      entries.push({ key, type: 'added', before: undefined, after: afterVal });
    } else if (inBefore && !inAfter) {
      entries.push({ key, type: 'removed', before: beforeVal, after: undefined });
    } else if (!valuesEqual(beforeVal, afterVal)) {
      entries.push({ key, type: 'modified', before: beforeVal, after: afterVal });
    }
    // Identical values are filtered out.
  }
  return entries;
}

// ---------------------------------------------------------------------------
// formatDiffValue — type-aware formatter pour l'affichage UI
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR');
const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});
const DATETIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

function isIsoDateString(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const parsed = Date.parse(s);
  return !Number.isNaN(parsed);
}

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Formate une valeur pour l'affichage dans le drawer (diff ou metadata).
 *
 * Conventions :
 * - null / undefined → "(vide)"
 * - boolean → "Oui" / "Non"
 * - number → fr-FR locale ("1 200")
 * - string ISO date → "5 mai 2026" ou "5 mai 2026, 13:44"
 * - string UUID → "abc12345…12345678" (8 chars début + 8 fin)
 * - other string → as-is
 * - object / array → JSON pretty 2-space indent
 */
export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return '(vide)';

  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return NUMBER_FORMATTER.format(value);
  }

  if (typeof value === 'string') {
    if (value.length === 0) return '(vide)';
    if (isUuid(value)) {
      return `${value.slice(0, 8)}…${value.slice(-8)}`;
    }
    if (isIsoDateString(value)) {
      const date = new Date(value);
      // Si la string contient une heure (T ou espace + HH:MM), formater avec heure.
      const hasTime = /[T ]\d{2}:\d{2}/.test(value);
      return hasTime ? DATETIME_FORMATTER.format(date) : DATE_FORMATTER.format(date);
    }
    return value;
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}
