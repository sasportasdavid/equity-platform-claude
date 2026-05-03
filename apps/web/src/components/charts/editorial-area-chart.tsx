'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
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
 * Editorial AreaChart wrapper — Étape 11 Design System V1.
 *
 * Pour : sparklines, courbes de valorisation IFRS 2, série temporelle
 * cumulée. Gradient subtil sous la courbe (couleur série fade vers
 * transparent).
 *
 * Pré-stylé selon les conventions :
 * - Tooltip + Legend custom Editorial
 * - Grille pointillée paper-300, horizontales seulement
 * - Animation fade-up 600ms ease-out au mount
 * - Couleurs des séries via tokens `--chart-1..5` (jamais de hex)
 *
 * @example
 * ```tsx
 * <EditorialAreaChart
 *   data={[{ month: 'Jan', valuation: 1200 }, { month: 'Fév', valuation: 1450 }]}
 *   xKey="month"
 *   series={[{ key: 'valuation', label: 'Fair Value (€)' }]}
 *   height={240}
 *   showLegend
 * />
 * ```
 */
export type EditorialAreaSeries = {
  /** Clé du field dans `data` */
  key: string;
  /** Label affiché dans la légende et le tooltip */
  label: string;
  /** Index couleur 0..4 — défaut auto-attribué dans l'ordre */
  colorIndex?: number;
  /** Unité affichée à côté de la valeur dans le tooltip (ex: "€", "%") */
  unit?: string;
};

export type EditorialAreaChartProps<T extends Record<string, unknown>> = {
  data: ReadonlyArray<T>;
  /** Clé du champ X (catégorie ou date) */
  xKey: keyof T & string;
  series: ReadonlyArray<EditorialAreaSeries>;
  /** Hauteur en px. Défaut : 240. */
  height?: number;
  /** Affiche la légende. Défaut : false (sparkline). */
  showLegend?: boolean;
  /** Affiche les axes. Défaut : true. */
  showAxes?: boolean;
  /** Affiche la grille. Défaut : true. */
  showGrid?: boolean;
  /** Override formatter du tooltip */
  tooltipFormatter?: EditorialTooltipProps['formatter'];
  /** Override formatter du label tooltip */
  tooltipLabelFormatter?: EditorialTooltipProps['labelFormatter'];
  /** Label tooltip en serif italic (ex: noms de mois) */
  italicTooltipLabel?: boolean;
  className?: string;
};

export function EditorialAreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 240,
  showLegend = false,
  showAxes = true,
  showGrid = true,
  tooltipFormatter,
  tooltipLabelFormatter,
  italicTooltipLabel = false,
  className,
}: EditorialAreaChartProps<T>) {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data as T[]} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, idx) => {
              const color = EDITORIAL_COLORS[s.colorIndex ?? idx % EDITORIAL_COLORS.length];
              return (
                <linearGradient
                  key={`grad-${s.key}`}
                  id={`editorial-area-${s.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
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
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={1.75}
                fill={`url(#editorial-area-${s.key})`}
                {...EDITORIAL_ANIMATION}
                activeDot={{
                  r: 4,
                  fill: color,
                  stroke: 'var(--color-paper-50)',
                  strokeWidth: 1.5,
                }}
                unit={s.unit}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
