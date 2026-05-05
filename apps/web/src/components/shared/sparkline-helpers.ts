/**
 * PR #37 B1 — Pure helpers extraits de `Sparkline.tsx` / `Sparkline2.tsx`
 * pour tests Vitest sans dépendre de React (rendering JSX).
 *
 * Logique vérifiable :
 * - mapping valeurs → coordonnées SVG (Sparkline simple, viewBox h+2)
 * - mapping valeurs → coordonnées SVG (Sparkline2 riche, inset 8/16)
 * - sélection des hollow points (1 sur 3 sauf dernier)
 * - couleur du dot anchor (trailDown branch)
 */

export type Point = [number, number];

const DEFAULT_TITLE_COLOR = 'var(--title-500)';

/**
 * Sparkline (basique) — projette `values` sur la viewBox `width × height`.
 * Y inversé (haut = max). Pas d'inset.
 */
export function computeSparklinePoints(values: number[], width: number, height: number): Point[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
}

/**
 * Sparkline2 (riche) — projette avec inset 8px top + 16px bottom :
 * `y = h - 8 - ((v-min)/range) × (h - 16)`. Le dernier point reste à
 * `[(n-1)*stepX, …]` ; offset visuel `-2` est appliqué au render.
 */
export function computeSparkline2Points(values: number[], width: number, height: number): Point[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => [i * stepX, height - 8 - ((v - min) / range) * (height - 16)]);
}

/**
 * Indices des hollow points (Sparkline2) : 1 sur 3, en excluant le dernier
 * (qui est rendu cuivre rempli).
 */
export function hollowPointIndices(numValues: number): number[] {
  if (numValues <= 1) return [];
  const indices: number[] = [];
  for (let i = 0; i < numValues - 1; i++) {
    if (i % 3 === 0) indices.push(i);
  }
  return indices;
}

/** dotColor du point anchor Sparkline (basique). */
export function sparklineDotColor(color: string, trailDown: boolean): string {
  return trailDown ? DEFAULT_TITLE_COLOR : color;
}
