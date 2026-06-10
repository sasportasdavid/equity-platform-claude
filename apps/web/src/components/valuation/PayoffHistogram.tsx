'use client';

/**
 * Module 11 B3 — `PayoffHistogram.tsx`.
 *
 * Recharts BarChart vertical de la distribution des payoffs actualisés
 * (sous-jacent du calcul fair value). La barre la plus haute à 0 est
 * typiquement la "non payés" (paths ne touchant pas la barrière ou OTM).
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.6.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildHistogramSeries } from './helpers';

export type PayoffHistogram = {
  /** Bornes des bins (longueur N+1 si counts a longueur N, ou N si bins représente le centre) */
  bins: number[];
  /** Counts par bin */
  counts: number[];
};

export type PayoffHistogramProps = {
  histogram: PayoffHistogram;
  /** Hauteur du chart (default 240) */
  height?: number;
};

const intFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function PayoffHistogram({ histogram, height = 240 }: PayoffHistogramProps) {
  const data = buildHistogramSeries(histogram);

  if (data.length === 0) {
    return (
      <div
        className="border-paper-300 bg-paper-50 text-ink-500 flex items-center justify-center rounded-md border border-dashed text-sm"
        style={{ height }}
        data-testid="payoff-empty"
      >
        Aucune donnée d&apos;histogramme — relancer la simulation pour générer la distribution.
      </div>
    );
  }

  return (
    <div
      className="border-paper-300 bg-paper-50 rounded-md border p-3"
      data-testid="payoff-histogram"
    >
      <h3 className="text-ink-700 mb-2 font-mono text-xs uppercase tracking-wider">
        Distribution des payoffs
      </h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="binLabel"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              interval="preserveStartEnd"
              label={{
                value: 'Payoff actualisé',
                position: 'insideBottom',
                offset: -8,
                fontSize: 11,
                fill: 'var(--muted-foreground)',
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              tickFormatter={(v: number) => intFormatter.format(v)}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--popover)',
                color: 'var(--popover-foreground)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '11px',
              }}
              formatter={(value) => intFormatter.format(Number(value ?? 0))}
            />
            <Bar dataKey="count" isAnimationActive animationDuration={1200}>
              {data.map((d, i) => (
                <Cell key={`cell-${i}`} fill={d.isZero ? 'var(--muted-foreground)' : '#14b8a6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
