'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EDITORIAL_ANIMATION,
  EDITORIAL_AXIS_PROPS,
  EDITORIAL_GRID_PROPS,
  EditorialTooltip,
  type EditorialTooltipProps,
  formatTabular,
} from './shared';

/**
 * Editorial Waterfall (cascade) — Étape 11 Design System V1.
 *
 * **Préparé pour Module 10** (cap table dynamique) — non branché V1.
 * Visualise l'évolution d'une grandeur entre un point de départ et un
 * point d'arrivée via une succession de delta positifs (vert) et
 * négatifs (rouge), avec totaux/sous-totaux distincts (ink-700).
 *
 * Recharts ne fournit pas de waterfall natif → on l'implémente avec
 * un BarChart où chaque barre a deux valeurs :
 *   - `base` (transparente, position de départ)
 *   - `delta` (visible, magnitude du changement)
 *
 * Pour les barres "totales" (start, subtotal, end), `base = 0` et
 * `delta = valeur cumulée`.
 *
 * @example
 * ```tsx
 * <EditorialWaterfall
 *   data={[
 *     { label: 'Cap initial', value: 1000, type: 'total' },
 *     { label: '+ Round A',   value:  300, type: 'positive' },
 *     { label: '- Pool ESOP', value: -150, type: 'negative' },
 *     { label: 'Cap final',   value: 1150, type: 'total' },
 *   ]}
 *   unit="K€"
 * />
 * ```
 *
 * @internal V1 — non branché. Sera consommé par
 * `apps/web/src/app/(dashboard)/dashboard/captable/page.tsx` au
 * Module 10. Tests E2E + intégration différés à ce moment-là.
 */
export type EditorialWaterfallDatum = {
  /** Label affiché sur l'axe X */
  label: string;
  /** Valeur du point :
   *  - `type='total'` → valeur absolue (depuis 0)
   *  - `type='positive'` → delta positif (additionné au cumul précédent)
   *  - `type='negative'` → delta négatif (soustrait du cumul précédent)
   */
  value: number;
  type: 'total' | 'positive' | 'negative';
};

export type EditorialWaterfallProps = {
  data: ReadonlyArray<EditorialWaterfallDatum>;
  height?: number;
  showAxes?: boolean;
  showGrid?: boolean;
  showValueLabels?: boolean;
  unit?: string;
  tooltipFormatter?: EditorialTooltipProps['formatter'];
  className?: string;
};

type WaterfallChartDatum = {
  label: string;
  base: number;
  delta: number;
  type: 'total' | 'positive' | 'negative';
  finalValue: number;
};

function buildWaterfallSeries(data: ReadonlyArray<EditorialWaterfallDatum>): WaterfallChartDatum[] {
  let cumulative = 0;
  return data.map((d) => {
    if (d.type === 'total') {
      cumulative = d.value;
      return {
        label: d.label,
        base: 0,
        delta: d.value,
        type: 'total',
        finalValue: d.value,
      };
    }
    if (d.type === 'positive') {
      const base = cumulative;
      cumulative += d.value;
      return {
        label: d.label,
        base,
        delta: d.value,
        type: 'positive',
        finalValue: cumulative,
      };
    }
    // negative
    const base = cumulative + d.value; // delta négatif → base inférieure
    cumulative += d.value;
    return {
      label: d.label,
      base,
      delta: -d.value, // delta positif pour la hauteur visuelle
      type: 'negative',
      finalValue: cumulative,
    };
  });
}

const COLOR_BY_TYPE: Record<EditorialWaterfallDatum['type'], string> = {
  positive: 'var(--color-bond-500)',
  negative: 'var(--color-title-500)',
  total: 'var(--color-ink-700)',
};

export function EditorialWaterfall({
  data,
  height = 280,
  showAxes = true,
  showGrid = true,
  showValueLabels = true,
  unit,
  tooltipFormatter,
  className,
}: EditorialWaterfallProps) {
  const chartData = buildWaterfallSeries(data);

  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
          {showGrid ? <CartesianGrid {...EDITORIAL_GRID_PROPS} /> : null}
          {showAxes ? (
            <>
              <XAxis dataKey="label" {...EDITORIAL_AXIS_PROPS} />
              <YAxis {...EDITORIAL_AXIS_PROPS} />
            </>
          ) : null}
          <RechartsTooltip
            cursor={{ fill: 'var(--color-brass-100)', opacity: 0.4 }}
            content={
              <EditorialTooltip
                formatter={(_value, item) => {
                  const datum = (item.payload as WaterfallChartDatum) ?? null;
                  const finalValue = datum?.finalValue ?? 0;
                  const formatted = tooltipFormatter
                    ? tooltipFormatter(finalValue, item)
                    : formatTabular(finalValue);
                  return unit ? `${formatted} ${unit}` : formatted;
                }}
              />
            }
          />
          {/* Base transparente — sert à positionner les delta en hauteur */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
          {/* Delta — barre visible */}
          <Bar dataKey="delta" stackId="waterfall" radius={[2, 2, 0, 0]} {...EDITORIAL_ANIMATION}>
            {chartData.map((d, idx) => (
              <Cell key={`cell-${idx}`} fill={COLOR_BY_TYPE[d.type]} />
            ))}
            {showValueLabels ? (
              <LabelList
                dataKey="finalValue"
                position="top"
                formatter={(value) => {
                  const num = typeof value === 'number' ? value : Number(value ?? 0);
                  const formatted = formatTabular(num);
                  return unit ? `${formatted} ${unit}` : formatted;
                }}
                style={{
                  fill: 'var(--color-ink-700)',
                  fontSize: 11,
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            ) : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
