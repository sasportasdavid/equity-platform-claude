'use client';

import {
  CartesianGrid,
  Legend as RechartsLegend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EDITORIAL_ANIMATION,
  EDITORIAL_AXIS_PROPS,
  EDITORIAL_COLORS,
  EDITORIAL_GRID_PROPS,
  EditorialLegend,
  EditorialTooltip,
  type EditorialTooltipProps,
} from './shared';

/**
 * Editorial LineChart wrapper — Étape 11 Design System V1.
 *
 * Pour : courbes de tendance, vesting chart simple (units cumulés
 * Programmé vs Acquis), évolution KPI sur le temps.
 *
 * Pré-stylé identique aux autres charts éditoriaux.
 * Strok dash optionnel pour les séries projetées vs réalisées.
 *
 * @example
 * ```tsx
 * <EditorialLineChart
 *   data={[{ date: '2024-01', programmé: 250, acquis: 250 }, ...]}
 *   xKey="date"
 *   series={[
 *     { key: 'programmé', label: 'Programmé', dashed: true },
 *     { key: 'acquis', label: 'Acquis' },
 *   ]}
 *   showLegend
 * />
 * ```
 */
export type EditorialLineSeries = {
  key: string;
  label: string;
  /** Index couleur 0..4 — défaut auto-attribué */
  colorIndex?: number;
  /** Affiche la ligne en pointillés (ex: projection) */
  dashed?: boolean;
  /** Unité tooltip (ex: "€", "u.") */
  unit?: string;
};

export type EditorialLineChartProps<T extends Record<string, unknown>> = {
  data: ReadonlyArray<T>;
  xKey: keyof T & string;
  series: ReadonlyArray<EditorialLineSeries>;
  height?: number;
  showLegend?: boolean;
  showAxes?: boolean;
  showGrid?: boolean;
  /** Affiche les dots sur chaque point. Défaut : false (line plus propre) */
  showDots?: boolean;
  tooltipFormatter?: EditorialTooltipProps['formatter'];
  tooltipLabelFormatter?: EditorialTooltipProps['labelFormatter'];
  italicTooltipLabel?: boolean;
  className?: string;
};

export function EditorialLineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 240,
  showLegend = false,
  showAxes = true,
  showGrid = true,
  showDots = false,
  tooltipFormatter,
  tooltipLabelFormatter,
  italicTooltipLabel = false,
  className,
}: EditorialLineChartProps<T>) {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data as T[]} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          {showGrid ? <CartesianGrid {...EDITORIAL_GRID_PROPS} /> : null}
          {showAxes ? (
            <>
              <XAxis dataKey={xKey as string} {...EDITORIAL_AXIS_PROPS} />
              <YAxis {...EDITORIAL_AXIS_PROPS} />
            </>
          ) : null}
          <RechartsTooltip
            cursor={{ stroke: 'var(--color-brass-300)', strokeDasharray: '2 4', strokeWidth: 1 }}
            content={
              <EditorialTooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                italicLabel={italicTooltipLabel}
              />
            }
          />
          {showLegend ? <RechartsLegend content={<EditorialLegend />} /> : null}
          {series.map((s, idx) => {
            const color = EDITORIAL_COLORS[s.colorIndex ?? idx % EDITORIAL_COLORS.length];
            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                dot={showDots ? { r: 3, fill: color, strokeWidth: 0 } : false}
                activeDot={{
                  r: 5,
                  fill: color,
                  stroke: 'var(--color-paper-50)',
                  strokeWidth: 1.5,
                }}
                {...EDITORIAL_ANIMATION}
                unit={s.unit}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
