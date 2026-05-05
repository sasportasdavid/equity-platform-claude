/**
 * PR #37 B2 — Helper format compact € pour les KPI cards.
 *
 * Extrait de `HeroFairValueCard.tsx` (DS V1 Étape 12) pour réutilisation
 * dans les nouveaux composants HeroKpi/KpiCardEditorial.
 *
 * `formatCompactEur(eur)` retourne juste le nombre formaté (sans unité) :
 *   - >= 1 Md€  → "1,2"
 *   - >= 1 M€   → "12,4"
 *   - >= 1 k€   → "847"
 *   - sinon     → "12"
 *
 * `compactEurUnit(eur)` retourne l'unité associée :
 *   - >= 1 Md€  → "Md€"
 *   - >= 1 M€   → "M€"
 *   - >= 1 k€   → "k€"
 *   - sinon     → "€"
 *
 * Pure (pas d'I/O), tests Vitest fournis.
 */

export function formatCompactEur(eur: number): string {
  const abs = Math.abs(eur);
  if (abs >= 1_000_000_000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(eur / 1_000_000_000);
  }
  if (abs >= 1_000_000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(eur / 1_000_000);
  }
  if (abs >= 1_000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(eur / 1_000);
  }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(eur);
}

export function compactEurUnit(eur: number): 'Md€' | 'M€' | 'k€' | '€' {
  const abs = Math.abs(eur);
  if (abs >= 1_000_000_000) return 'Md€';
  if (abs >= 1_000_000) return 'M€';
  if (abs >= 1_000) return 'k€';
  return '€';
}
