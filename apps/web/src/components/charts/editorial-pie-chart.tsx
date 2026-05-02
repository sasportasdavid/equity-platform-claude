'use client';

import {
  Cell,
  Legend as RechartsLegend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  EDITORIAL_ANIMATION,
  EDITORIAL_COLORS,
  EditorialLegend,
  EditorialTooltip,
  type EditorialTooltipProps,
} from './shared';

/**
 * Editorial PieChart wrapper — Étape 11 Design System V1.
 *
 * Pour : donut de répartition (cap table catégories, leavers types,
 * répartition awards par bénéficiaire).
 *
 * Variante par défaut : donut (innerRadius/outerRadius). Pour un pie
 * plein, passer `innerRadius={0}`.
 *
 * @example
 * ```tsx
 * <EditorialPieChart
 *   data={[
 *     { name: 'Founders', value: 65 },
 *     { name: 'ESOP', value: 12 },
 *     { name: 'Investors', value: 23 },
 *   ]}
 *   showLegend
 * />
 * ```
 */
export type EditorialPieDatum = {
  name: string;
  value: number;
  /** Index couleur 0..4 — défaut auto-attribué */
  colorIndex?: number;
};

export type EditorialPieChartProps = {
  data: ReadonlyArray<EditorialPieDatum>;
  height?: number;
  /** Rayon intérieur (donut). Défaut : 60% du rayon extérieur. 0 = pie plein. */
  innerRadius?: number | string;
  /** Rayon extérieur. Défaut : 80% du conteneur. */
  outerRadius?: number | string;
  showLegend?: boolean;
  /** Affiche un label central au cœur du donut (ex: total) */
  centerLabel?: { primary: string; secondary?: string };
  tooltipFormatter?: EditorialTooltipProps['formatter'];
  /** Unité tooltip (ex: "%", "€", "u.") */
  unit?: string;
  className?: string;
};

export function EditorialPieChart({
  data,
  height = 280,
  innerRadius = '60%',
  outerRadius = '85%',
  showLegend = true,
  centerLabel,
  tooltipFormatter,
  unit,
  className,
}: EditorialPieChartProps) {
  return (
    <div className={className} style={{ width: '100%', height, position: 'relative' }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data as EditorialPieDatum[]}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            stroke="var(--color-paper-50)"
            strokeWidth={2}
            paddingAngle={1}
            {...EDITORIAL_ANIMATION}
          >
            {data.map((entry, idx) => {
              const color = EDITORIAL_COLORS[entry.colorIndex ?? idx % EDITORIAL_COLORS.length];
              return <Cell key={`cell-${idx}`} fill={color} />;
            })}
          </Pie>
          <RechartsTooltip
            content={
              <EditorialTooltip
                formatter={(value, item) => {
                  const formatted = tooltipFormatter
                    ? tooltipFormatter(value, item)
                    : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(
                        Number(value),
                      );
                  return unit ? `${formatted} ${unit}` : formatted;
                }}
              />
            }
          />
          {showLegend ? <RechartsLegend content={<EditorialLegend />} /> : null}
        </PieChart>
      </ResponsiveContainer>
      {centerLabel ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{
            // Compense la place de la légende en bas si présente
            paddingBottom: showLegend ? '40px' : '0',
          }}
        >
          <span className="text-numeric-lg text-ink-900 font-semibold tabular-nums">
            {centerLabel.primary}
          </span>
          {centerLabel.secondary ? (
            <span className="text-overline text-ink-500 mt-1">{centerLabel.secondary}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
