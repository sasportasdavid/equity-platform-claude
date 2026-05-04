/**
 * Module 11 B3 — `ParametersCard.tsx`.
 *
 * Chips read-only des paramètres d'entrée d'un valuation_run. Les inputs sont
 * verrouillés post-run — pour changer un paramètre, l'admin relance un
 * nouveau run via l'UI plan detail (B5).
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.3.
 *
 * Format français pour tous les nombres :
 *   - Prix : 50,00 €
 *   - Pourcentages : 32 % / 3,2 %
 *   - Durée : 3,5 ans
 *   - Paths : 100 000 paths (séparateur U+202F)
 */

import type { ReactNode } from 'react';

export type ParametersCardProps = {
  /** Spot price S₀ (au moment du grant) */
  S0: number;
  /** Strike K (exercise price) */
  K: number;
  /** Barrière de marché si présente (TSR_REL_INDEX, etc.) */
  barrier?: number;
  /** Volatilité — fraction (0.32 = 32 %) */
  sigma: number;
  /** Risk-free rate — fraction (0.032 = 3,2 %) */
  r: number;
  /** Horizon en années (Julian, 365.25 jours) */
  T: number;
  /** Nombre de paths simulés */
  numPaths: number;
  /** Devise — défaut EUR */
  currency?: string;
};

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctFormatter1 = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const yearsFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function Chip({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="border-paper-300 bg-paper-200 text-ink-700 inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs"
    >
      {children}
    </span>
  );
}

export function ParametersCard({
  S0,
  K,
  barrier,
  sigma,
  r,
  T,
  numPaths,
  currency = 'EUR',
}: ParametersCardProps) {
  const fmtMoney = (v: number) =>
    currency === 'EUR' ? eurFormatter.format(v) : `${intFormatter.format(v)} ${currency}`;

  return (
    <div className="flex flex-wrap gap-2" data-testid="parameters-card">
      <Chip testId="param-S0">
        <span className="text-ink-500 mr-1">S₀ =</span> {fmtMoney(S0)}
      </Chip>
      <Chip testId="param-K">
        <span className="text-ink-500 mr-1">K =</span> {fmtMoney(K)}
      </Chip>
      {barrier !== undefined ? (
        <Chip testId="param-barrier">
          <span className="text-ink-500 mr-1">Barrière =</span> {fmtMoney(barrier)}
        </Chip>
      ) : null}
      <Chip testId="param-sigma">
        <span className="text-ink-500 mr-1">σ =</span> {pctFormatter1.format(sigma)}
      </Chip>
      <Chip testId="param-r">
        <span className="text-ink-500 mr-1">r =</span> {pctFormatter1.format(r)}
      </Chip>
      <Chip testId="param-T">
        <span className="text-ink-500 mr-1">T =</span> {yearsFormatter.format(T)} ans
      </Chip>
      <Chip testId="param-N">
        <span className="text-ink-500 mr-1">N =</span> {intFormatter.format(numPaths)} paths
      </Chip>
    </div>
  );
}
