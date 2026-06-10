'use client';

import { AlertTriangle } from 'lucide-react';
import type { TaxBreakdown } from '@/lib/tax';
import { formatEuro, formatPercent, regimeAccentColor, regimeLabel } from './format-helpers';
import { cn } from '@/lib/utils';

/**
 * Module 9 B3 — Affichage Editorial d'un TaxBreakdown.
 *
 * Composant client (utilisé dans le form d'exercice + la page tax
 * simulator). Reçoit un breakdown calculé via la lib tax/ et l'affiche
 * en sections : régime + montants bruts + impôts + net + warnings.
 */
export function TaxBreakdownDisplay({ breakdown }: { breakdown: TaxBreakdown }) {
  const accent = regimeAccentColor(breakdown.regime);
  const label = regimeLabel(breakdown.regime);

  return (
    <div className="border-paper-300 bg-paper-50 space-y-6 rounded-lg border p-6">
      {/* Régime + effective rate */}
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-overline text-brass-500">RÉGIME · FISCAL DÉTECTÉ</p>
          <h3
            className={cn(
              'text-h4 mt-1 font-medium',
              accent === 'brass' && 'text-brass-700',
              accent === 'warning' && 'text-amber-700 dark:text-amber-400',
              accent === 'ink' && 'text-ink-900',
            )}
          >
            {label}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-overline text-ink-500">TAUX · EFFECTIF</p>
          <p className="text-ink-900 mt-1 font-mono text-2xl tabular-nums">
            {formatPercent(breakdown.effectiveTaxRate)}
          </p>
        </div>
      </header>

      {/* Détail des montants — grille en 3 colonnes */}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BreakdownRow label="Gain brut" value={breakdown.grossGainAmount} accent="ink" />
        <BreakdownRow label="Total impôts" value={breakdown.totalTaxAmount} accent="warning" />
        <BreakdownRow label="Gain net" value={breakdown.netGainAmount} accent="brass" />
      </dl>

      {/* Sous-décomposition acquisition + cession */}
      {(breakdown.acquisitionTaxableBase > 0 || breakdown.cessionTaxableBase > 0) && (
        <div className="border-paper-300 grid grid-cols-1 gap-4 border-t pt-6 sm:grid-cols-2">
          {breakdown.acquisitionTaxableBase > 0 && (
            <SubBreakdownSection
              title="Plus-value d'acquisition"
              base={breakdown.acquisitionTaxableBase}
              ir={breakdown.acquisitionIncomeTax}
              social={breakdown.acquisitionSocialContributions}
            />
          )}
          {breakdown.cessionTaxableBase > 0 && (
            <SubBreakdownSection
              title="Plus-value de cession"
              base={breakdown.cessionTaxableBase}
              ir={breakdown.cessionIncomeTax}
              social={breakdown.cessionSocialContributions}
            />
          )}
        </div>
      )}

      {/* Warnings */}
      {breakdown.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4" strokeWidth={2} />
            <p className="text-sm font-medium">Points de vigilance</p>
          </div>
          <ul className="space-y-2 text-sm text-amber-900 dark:text-amber-100">
            {breakdown.warnings.map((w, idx) => (
              <li key={idx} className="leading-relaxed">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources */}
      <footer className="border-paper-300 border-t pt-4">
        <p className="text-overline text-ink-500 mb-2">SOURCES · OFFICIELLES</p>
        <ul className="space-y-1 text-xs">
          {breakdown.sources.map((s, idx) => (
            <li key={idx}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brass-600 hover:text-brass-700 underline"
              >
                {s.regime}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'ink' | 'brass' | 'warning';
}) {
  return (
    <div>
      <dt className="text-overline text-ink-500">{label.toUpperCase()}</dt>
      <dd
        className={cn(
          'mt-1 font-mono text-xl tabular-nums',
          accent === 'brass' && 'text-brass-700 font-semibold',
          accent === 'warning' && 'text-amber-700 dark:text-amber-400',
          accent === 'ink' && 'text-ink-900',
        )}
      >
        {formatEuro(value)}
      </dd>
    </div>
  );
}

function SubBreakdownSection({
  title,
  base,
  ir,
  social,
}: {
  title: string;
  base: number;
  ir: number;
  social: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-overline text-ink-500">{title.toUpperCase()}</p>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-500">Base imposable</dt>
          <dd className="text-ink-900 font-mono tabular-nums">{formatEuro(base)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Impôt sur le revenu</dt>
          <dd className="text-ink-900 font-mono tabular-nums">{formatEuro(ir)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Cotisations sociales</dt>
          <dd className="text-ink-900 font-mono tabular-nums">{formatEuro(social)}</dd>
        </div>
      </dl>
    </div>
  );
}
