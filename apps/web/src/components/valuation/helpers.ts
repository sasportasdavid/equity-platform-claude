/**
 * Module 11 B3 — Pure helpers du viewer Monte Carlo.
 *
 * Extraits des composants UI pour permettre les tests unitaires Vitest sans
 * jsdom (`environment: 'node'` côté apps/web vitest.config). Les composants
 * UI eux-mêmes ne sont pas testés en B3 (pattern aligné repo : seuls les
 * helpers pure ont des tests).
 */

import type { PathSampleMetadata } from '@equity/shared';

// ---------------------------------------------------------------------------
// Color encoding (PathsCanvas)
// ---------------------------------------------------------------------------

export const PATH_COLORS = {
  /** Barrière touchée + ITM final */
  achievedItm: 'rgba(20, 184, 166, 0.15)',
  /** Touchée mais OTM */
  achievedOtm: 'rgba(234, 88, 12, 0.20)',
  /** Non touchée (forfeited) */
  notAchieved: 'rgba(120, 113, 108, 0.10)',
  /** Barrière (rouge dashed) */
  barrier: 'rgba(220, 38, 38, 0.7)',
} as const;

/**
 * Détermine la couleur d'un path selon `paths_metadata`. Métadata absente →
 * traité comme `notAchieved` (gris). Aligné sur la légende footer du canvas.
 */
export function colorForPath(meta: PathSampleMetadata | undefined): string {
  if (!meta) return PATH_COLORS.notAchieved;
  if (meta.achieved_vesting && meta.final_itm) return PATH_COLORS.achievedItm;
  if (meta.achieved_vesting && !meta.final_itm) return PATH_COLORS.achievedOtm;
  return PATH_COLORS.notAchieved;
}

// ---------------------------------------------------------------------------
// Bounds (PathsCanvas yMin/yMax)
// ---------------------------------------------------------------------------

/**
 * Calcule yMin/yMax sur un sous-ensemble de paths avec marge ±10 %.
 *
 * Utilisé pour stabiliser l'échelle Y pendant l'animation cinématique
 * (sinon l'autoscale changerait à chaque frame).
 */
export function computeBounds(paths: number[][]): { yMin: number; yMax: number } {
  if (paths.length === 0) return { yMin: 0, yMax: 1 };
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const path of paths) {
    for (const v of path) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return { yMin: 0, yMax: 1 };
  }
  return { yMin: yMin * 0.9, yMax: yMax * 1.1 };
}

// ---------------------------------------------------------------------------
// Easing (PathsCanvas replay animation)
// ---------------------------------------------------------------------------

/**
 * Cubic ease-out pour effet "premium reveal" : démarre vite, ralentit en fin.
 *  - t=0 → 0
 *  - t=0.5 → 0.875
 *  - t=1 → 1
 */
export function easeOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Identité (no easing) — démarre à constant rate, finit à constant rate.
 *  - t=0 → 0
 *  - t=0.5 → 0.5
 *  - t=1 → 1
 *
 * Utilisé pour les progressions linéaires (count-up régulier) ou pour les
 * animations où on veut le contrôle direct sur le tempo.
 */
export function easeLinear(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/**
 * Quadratic ease-in-out — accélère puis décélère, courbe symétrique.
 *  - t=0 → 0
 *  - t=0.25 → 0.125
 *  - t=0.5 → 0.5
 *  - t=0.75 → 0.875
 *  - t=1 → 1
 *
 * Plus doux que `easeOutCubic` au démarrage, utile pour des transitions
 * type fade-in sans le "kick" initial.
 */
export function easeInOutQuad(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export type EasingName = 'linear' | 'easeOutCubic' | 'easeInOutQuad';

/**
 * Résout un nom d'easing vers la fonction correspondante. Permet aux callers
 * de passer une string sérialisable (props composant, fixtures de test) au
 * lieu d'une référence de fonction.
 */
export function resolveEasing(name: EasingName): (t: number) => number {
  switch (name) {
    case 'linear':
      return easeLinear;
    case 'easeInOutQuad':
      return easeInOutQuad;
    case 'easeOutCubic':
    default:
      return easeOutCubic;
  }
}

// ---------------------------------------------------------------------------
// Hit rate (MonteCarloViewer KPI)
// ---------------------------------------------------------------------------

/**
 * Calcule un hit rate "barrière touchée" approximatif depuis les
 * `paths_metadata`. V1 = `achieved_vesting` comme proxy (ne distingue pas
 * vesting time-based vs barrière). V2 moteur Python : exposer un champ
 * dédié `barrier_hit_rate`.
 */
export function computeHitRate(metadata: PathSampleMetadata[]): number | null {
  if (!metadata || metadata.length === 0) return null;
  const hits = metadata.reduce((acc, m) => acc + (m.achieved_vesting ? 1 : 0), 0);
  return hits / metadata.length;
}

// ---------------------------------------------------------------------------
// Histogram series builder (PayoffHistogram)
// ---------------------------------------------------------------------------

export type HistogramBin = {
  binLabel: string;
  binValue: number;
  count: number;
  isZero: boolean;
};

/**
 * Transforme `{ bins, counts }` en série rendable Recharts.
 *
 *  - Si `bins.length === counts.length` : bins représente le centre du bin.
 *  - Si `bins.length === counts.length + 1` : bins[i]/bins[i+1] = bornes,
 *    on calcule le mid-bin.
 *
 * `isZero` est `true` si le bin est centré sur 0 (à 0.5 € près) — utilisé
 * pour le color-coding gris des paths "non payés" dans le histogram.
 */
export function buildHistogramSeries(
  histogram: { bins: number[]; counts: number[] },
  formatLabel?: (v: number) => string,
): HistogramBin[] {
  const { bins, counts } = histogram;
  if (!bins || !counts || counts.length === 0) return [];

  const useMidBin = bins.length === counts.length + 1;
  const fmt =
    formatLabel ??
    ((v: number) =>
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(v));

  return counts.map((count, i) => {
    const binValue = useMidBin ? ((bins[i] ?? 0) + (bins[i + 1] ?? 0)) / 2 : (bins[i] ?? 0);
    return {
      binLabel: fmt(binValue),
      binValue,
      count,
      isZero: Math.abs(binValue) < 0.5,
    };
  });
}
