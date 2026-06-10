'use client';

/**
 * Module 11 B3 — `ConvergenceChart.tsx`.
 *
 * Recharts LineChart en échelle log X. Vérifie visuellement la convergence
 * du calcul Monte Carlo : la courbe doit s'asymptoter vers `finalFV` à
 * mesure que N augmente.
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.5.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type ConvergencePoint = { n: number; fv: number };

export type ConvergenceChartProps = {
  /** ~50 points en log-scale [{ n: 100, fv: 12.1 }, ...] */
  curve: ConvergencePoint[];
  /** Valeur finale (asymptote target) */
  finalFV: number;
  /** Hauteur du chart (default 240) */
  height?: number;
};

const intFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNAxis(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function ConvergenceChart({ curve, finalFV, height = 240 }: ConvergenceChartProps) {
  if (!curve || curve.length === 0) {
    return (
      <div
        className="border-paper-300 bg-paper-50 text-ink-500 flex items-center justify-center rounded-md border border-dashed text-sm"
        style={{ height }}
        data-testid="convergence-empty"
      >
        Aucune donnée de convergence — relancer la simulation pour générer la courbe.
      </div>
    );
  }

  return (
    <div
      className="border-paper-300 bg-paper-50 rounded-md border p-3"
      data-testid="convergence-chart"
    >
      <h3 className="text-ink-700 mb-2 font-mono text-xs uppercase tracking-wider">
        Convergence Monte Carlo
      </h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 8, right: 16, left: 4, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="n"
              scale="log"
              domain={['dataMin', 'dataMax']}
              type="number"
              tickFormatter={formatNAxis}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              label={{
                value: 'N paths simulés (log)',
                position: 'insideBottom',
                offset: -8,
                fontSize: 11,
                fill: 'var(--muted-foreground)',
              }}
            />
            <YAxis
              tickFormatter={(v: number) => eurFormatter.format(v)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--popover)',
                color: 'var(--popover-foreground)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '11px',
              }}
              labelFormatter={(label) => `N = ${intFormatter.format(Number(label ?? 0))}`}
              formatter={(value) => eurFormatter.format(Number(value ?? 0))}
            />
            <Line
              type="monotone"
              dataKey="fv"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              isAnimationActive
              animationDuration={1500}
              animationEasing="ease-out"
            />
            <ReferenceLine
              y={finalFV}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: `FV finale : ${eurFormatter.format(finalFV)}`,
                position: 'right',
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
