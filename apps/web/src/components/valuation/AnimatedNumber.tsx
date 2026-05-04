'use client';

/**
 * Module 11 B4 — `AnimatedNumber`.
 *
 * Composant qui affiche une valeur numérique scaled par une `progress` [0..1]
 * fournie par le parent. Le parent contrôle l'animation via `useMonteCarloReplay`
 * et passe la progression eased — le composant ne fait que formatter.
 *
 * Pattern lifted state : la progression est partagée entre PathsCanvas (paths
 * animés) et les KPIs (count-up FV) via le parent `MonteCarloViewer`. Cela
 * garantit que les 2 animations restent synchronisées même si elles tournent
 * sur des refs requestAnimationFrame distinctes.
 */

import { type ReactNode } from 'react';

export type AnimatedNumberProps = {
  /** Valeur cible finale (ex: fair_value_per_unit). */
  targetValue: number;
  /** Progression [0..1] fournie par le parent (eased). À progress=1 → affiche targetValue. */
  progress: number;
  /** Formatter de la valeur affichée. Default : Intl.NumberFormat fr-FR EUR 2 décimales. */
  format?: (value: number) => string;
  /** Optional className wrapping span pour styling. */
  className?: string;
  /** Optional render prop si on veut wrapper la valeur (ex: bouton clickable). */
  children?: (formattedValue: string) => ReactNode;
};

const defaultFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Calcule la valeur intermédiaire à afficher pendant l'animation.
 * À progress=1 → exactement targetValue (pas d'arrondi inattendu).
 */
export function computeAnimatedValue(targetValue: number, progress: number): number {
  if (progress >= 1) return targetValue;
  if (progress <= 0) return 0;
  return targetValue * progress;
}

export function AnimatedNumber({
  targetValue,
  progress,
  format,
  className,
  children,
}: AnimatedNumberProps) {
  const value = computeAnimatedValue(targetValue, progress);
  const formatted = format ? format(value) : defaultFormatter.format(value);

  if (children) return <>{children(formatted)}</>;

  return <span className={className}>{formatted}</span>;
}
