'use client';

/**
 * Shared primitives for the Editorial Finance chart family — Étape 11.
 *
 * Tooltip + Legend + grid + animations + color palette mutualisés entre
 * `editorial-{area,line,pie,bar,waterfall}-chart.tsx`. Tous les
 * wrappers Recharts importent depuis ce fichier pour rester cohérents
 * avec les tokens Design System V1 (jamais de hex en dur).
 *
 * **5 séries éditoriales** mappées sur les tokens `--chart-1..5`
 * définis dans globals.css :
 *   1. brass-500   (cuivre, signature)
 *   2. bond-500    (vert obligation, succès)
 *   3. saffron-500 (jaune ocre, attention)
 *   4. ink-700     (bleu nuit, neutre)
 *   5. slate-500   (gris bleu, info)
 */

import { type CSSProperties, type ReactNode } from 'react';

/**
 * Couleurs des séries — utiliser via `EDITORIAL_COLORS[i % 5]`.
 * Référence l'AST CSS, jamais de hex en dur.
 */
export const EDITORIAL_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

/**
 * Animation au mount — appliquée sur tous les charts.
 * Standard Recharts props.
 */
export const EDITORIAL_ANIMATION = {
  animationBegin: 0,
  animationDuration: 600,
  animationEasing: 'ease-out',
} as const;

/**
 * Props CartesianGrid — grille très subtile éditoriale.
 * Lignes pointillées 2px / 4px gap, paper-300, horizontales seulement.
 */
export const EDITORIAL_GRID_PROPS = {
  strokeDasharray: '2 4',
  stroke: 'var(--color-paper-300)',
  vertical: false,
} as const;

/**
 * Props Axis — labels mono ink-500 11px.
 */
export const EDITORIAL_AXIS_PROPS = {
  stroke: 'var(--color-ink-300)',
  strokeWidth: 0.5,
  tick: {
    fill: 'var(--color-ink-500)',
    fontSize: 11,
    fontFamily: 'var(--font-jetbrains-mono), monospace',
  },
  tickLine: false,
  axisLine: { stroke: 'var(--color-paper-300)', strokeWidth: 1 },
} as const;

/**
 * Format des valeurs tabular dans le tooltip.
 * Helper réutilisable.
 */
export function formatTabular(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, ...options }).format(value);
}

/**
 * Tooltip custom Editorial Finance.
 *
 * Structure visuelle :
 * - fond paper-50 + shadow-md + bordure paper-300 1px
 * - padding 12px
 * - titre serif italic optionnel (ex: nom du mois en cursive)
 * - valeurs alignées en mono tabular avec dot couleur série + label
 *
 * Compatible `RechartsTooltip content={<EditorialTooltip />}` —
 * Recharts injecte `active`, `payload`, `label`.
 */
export type EditorialTooltipPayloadItem = {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: unknown;
  unit?: string;
};

export type EditorialTooltipProps = {
  active?: boolean;
  payload?: EditorialTooltipPayloadItem[];
  label?: string | number;
  /** Format custom de la valeur. Défaut : `formatTabular`. */
  formatter?: (value: number | string, item: EditorialTooltipPayloadItem) => string;
  /** Format custom du label (titre). Défaut : valeur brute. */
  labelFormatter?: (label: string | number) => ReactNode;
  /** Affiche le label en serif italic (ex: noms de mois). */
  italicLabel?: boolean;
};

export function EditorialTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  italicLabel = false,
}: EditorialTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const tooltipStyle: CSSProperties = {
    backgroundColor: 'var(--color-paper-50)',
    border: '1px solid var(--color-paper-300)',
    boxShadow: 'var(--shadow-md)',
    padding: '12px',
    borderRadius: '4px',
    minWidth: '160px',
  };

  return (
    <div style={tooltipStyle} role="tooltip">
      {label !== undefined && label !== '' ? (
        <div
          className={
            italicLabel
              ? 'serif-italic text-brass-500 mb-2 text-sm'
              : 'text-overline text-ink-700 mb-2'
          }
        >
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      ) : null}
      <ul className="space-y-1">
        {payload.map((item, idx) => {
          const formatted =
            formatter && item.value !== undefined
              ? formatter(item.value, item)
              : typeof item.value === 'number'
                ? formatTabular(item.value)
                : String(item.value ?? '');
          return (
            <li
              key={`${item.dataKey ?? idx}-${idx}`}
              className="text-ink-900 flex items-center justify-between gap-3 text-xs"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: item.color ?? EDITORIAL_COLORS[0] }}
                />
                <span className="text-ink-500">{item.name}</span>
              </span>
              <span className="font-mono tabular-nums">
                {formatted}
                {item.unit ? <span className="text-ink-400 ml-0.5">{item.unit}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Legend custom Editorial Finance.
 *
 * Mini-carrés couleur série + label en `text-overline text-ink-700`.
 * Compatible `RechartsLegend content={<EditorialLegend />}` —
 * Recharts injecte `payload`.
 */
export type EditorialLegendPayloadItem = {
  value?: string | number;
  color?: string;
  dataKey?: string | number;
  type?: string;
};

export type EditorialLegendProps = {
  payload?: EditorialLegendPayloadItem[];
};

export function EditorialLegend({ payload }: EditorialLegendProps) {
  if (!payload || payload.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      {payload.map((item, idx) => (
        <li
          key={`${item.dataKey ?? idx}-${idx}`}
          className="text-overline text-ink-700 inline-flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className="border-paper-300 inline-block h-3 w-3 rounded-sm border"
            style={{ backgroundColor: item.color ?? EDITORIAL_COLORS[0] }}
          />
          <span>{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
