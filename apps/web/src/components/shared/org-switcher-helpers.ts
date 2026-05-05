/**
 * Pure helpers extraits de `org-switcher-card.tsx` pour tester via Vitest
 * sans déclencher l'import transitif de `@/lib/supabase/client` (qui parse
 * l'env client au module-load et fail dans Node).
 */

/** 2 lettres max issues du nom de l'organisation. Fallback '?'. */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const cleaned = name.trim();
  if (cleaned.length === 0) return '?';
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 2);
  const first = words[0];
  if (!first) return '?';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const second = words[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  const a = first[0] ?? '';
  const b = second[0] ?? '';
  return (a + b).toUpperCase() || '?';
}
