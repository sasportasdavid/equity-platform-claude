'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend as RechartsLegend,
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
 * Editorial BarChart wrapper — Étape 11 Design System V1.
 *
 * Pour : comparaisons entre catégories (awards par type de plan,
 * compliance rules par sévérité, distribution par cohorte). Variante
 * empilée si `series.length > 1`, side-by-side sinon.
 *
 * @example
 * ```tsx
 * <EditorialBarChart
 *   data={[
 *     { type: 'BSPCE', granted: 40, vested: 20 },
 *     { type: 'AGA',   granted: 25, vested: 8 },
 *   ]}
 *   xKey="type"
 *   series={[
 *     { key: 'granted', label: 'Attribués' },
 *     { key: 'vested',  label: 'Acquis' },
 *   ]}
 *   showLegend
 * />
 * ```
 */
export type EditorialBarSeries = {
  key: string;
  label: string;
  /** Index couleur 0..4 — défaut auto-attribué */
  colorIndex?: number;
  /** Stack ID — séries avec le même stackId sont empilées */
  stackId?: string;
  /** Unité tooltip */
  unit?: string;
};

export type EditorialBarChartProps<T extends Record<string, unknown>> = {
  data: ReadonlyArray<T>;
  xKey: keyof T & string;
  series: ReadonlyArray<EditorialBarSeries>;
  /** Orientation 'vertical' (par défaut) ou 'horizontal' */
  layout?: 'horizontal' | 'vertical';
  height?: number;
  showLegend?: boolean;
  showAxes?: boolean;
  showGrid?: boolean;
  /** Coins arrondis pour les barres. Défaut : 2px. */
  barRadius?: number;
  tooltipFormatter?: EditorialTooltipProps['formatter'];
  tooltipLabelFormatter?: EditorialTooltipProps['labelFormatter'];
  /** Si true et 1 seule série : applique des couleurs distinctes par bar (auto-rotate dans EDITORIAL_COLORS) */
  rainbowSingleSeries?: boolean;
  className?: string;
};

export function EditorialBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  layout = 'horizontal',
  height = 240,
  showLegend = false,
  showAxes = true,
  showGrid = true,
  barRadius = 2,
  tooltipFormatter,
  tooltipLabelFormatter,
  rainbowSingleSeries = false,
  className,
}: EditorialBarChartProps<T>) {
  const useRainbow = rainbowSingleSeries && series.length === 1;

  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart
          data={data as T[]}
          layout={layout}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          barCategoryGap="22%"
        >
          {showGrid ? (
            <CartesianGrid
              {...EDITORIAL_GRID_PROPS}
              vertical={layout === 'vertical'}
              horizontal={layout === 'horizontal'}
            />
          ) : null}
          {showAxes ? (
            <>
              <XAxis
                dataKey={layout === 'horizontal' ? (xKey as string) : undefined}
                type={layout === 'horizontal' ? 'category' : 'number'}
                {...EDITORIAL_AXIS_PROPS}
              />
              <YAxis
                dataKey={layout === 'vertical' ? (xKey as string) : undefined}
                type={layout === 'vertical' ? 'category' : 'number'}
                {...EDITORIAL_AXIS_PROPS}
              />
            </>
          ) : null}
          <RechartsTooltip
            cursor={{ fill: 'var(--color-brass-100)', opacity: 0.4 }}
            content={
              <EditorialTooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
              />
            }
          />
          {showLegend ? <RechartsLegend content={<EditorialLegend />} /> : null}
          {series.map((s, idx) => {
            const color = EDITORIAL_COLORS[s.colorIndex ?? idx % EDITORIAL_COLORS.length];
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={color}
                stackId={s.stackId}
                radius={
                  layout === 'horizontal'
                    ? [barRadius, barRadius, 0, 0]
                    : [0, barRadius, barRadius, 0]
                }
                {...EDITORIAL_ANIMATION}
                unit={s.unit}
              >
                {useRainbow
                  ? data.map((_entry, cellIdx) => (
                      <Cell
                        key={`bar-cell-${cellIdx}`}
                        fill={EDITORIAL_COLORS[cellIdx % EDITORIAL_COLORS.length]}
                      />
                    ))
                  : null}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
