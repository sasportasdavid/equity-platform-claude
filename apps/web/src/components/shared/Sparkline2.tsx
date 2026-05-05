import { useId } from 'react';
import { computeSparkline2Points, hollowPointIndices } from './sparkline-helpers';

/**
 * PR #37 B1 — Sparkline2 riche pure SVG (canonique cw-chrome2.jsx).
 *
 * Variante éditoriale du `<Sparkline>` pour les HeroKpi : courbe lissée
 * avec inset 8px top + 16px bottom, 2 gradients (stroke passé→présent
 * + fill cuivre cumulé), 3 ticks baseline aux extrémités+milieu, points
 * creux intermédiaires (1 sur 3), point final cuivre rempli, et 3 labels
 * dates mono en bas.
 *
 * Spec exacte cw-chrome2.jsx (à reproduire à l'identique) :
 * - viewBox `0 0 width height`, preserveAspectRatio="none"
 * - 2 gradients :
 *   * stroke `ink-300 0.4 → ink-500 0.7 (offset 0.6) → color (offset 1)`
 *   * fill `color stopOpacity 0 → color stopOpacity 0.18`
 * - 3 ticks baseline (x=0, w/2, w) — y1=h-2 → y2=h-6 stroke ink-300 1px
 * - Polyline fill : zone fermée avec inset 8px top/bottom :
 *   `pts = values.map((v,i) => [i*stepX, h - 8 - ((v-min)/range)*(h-16)])`
 *   fermée avec `0,h-8 …pts… w,h-8`
 * - Polyline stroke 1.5 round caps/joins
 * - Hollow points : 1 sur 3 (sauf dernier) — r=1.4 fill=paper-50 stroke=ink-400
 * - Last cuivre : r=3.5 fill=color stroke=paper-50 strokeWidth=1.5 à [last[0]-2, last[1]]
 * - 3 labels ticks dates mono 9 ink-400 (start/middle/end textAnchor adapté)
 *
 * Adaptations V1e :
 * - ID gradients via `useId()` (déterministe SSR).
 * - a11y : role="img" + <title> + <desc>.
 */
export type Sparkline2Props = {
  /** Série de valeurs numériques. Au moins 2 points. */
  values: number[];
  /** Couleur principale. Default brass-500. */
  color?: string;
  /** Largeur viewBox. Default 280. */
  width?: number;
  /** Hauteur viewBox. Default 48. */
  height?: number;
  /** Affiche les ticks baseline + labels dates. Default true. */
  showTicks?: boolean;
  /** 3 labels dates start/middle/end. Default `['J-90','J-30','J-0']`. */
  ticks?: [string, string, string] | string[];
  /** Label a11y. Default "Sparkline série riche". */
  ariaLabel?: string;
};

export function Sparkline2({
  values,
  color = 'var(--brass-500)',
  width = 280,
  height = 48,
  showTicks = true,
  ticks = ['J-90', 'J-30', 'J-0'],
  ariaLabel = 'Sparkline série riche',
}: Sparkline2Props) {
  const reactId = useId();
  const strokeId = `sg-stroke${reactId.replace(/[:]/g, '')}`;
  const fillId = `sg-fill${reactId.replace(/[:]/g, '')}`;

  if (!values.length) return null;

  const pts = computeSparkline2Points(values, width, height);
  const polyline = pts.map((p) => p.join(',')).join(' ');
  const last = pts[pts.length - 1]!;
  const hollowIdx = new Set(hollowPointIndices(pts.length));

  const tickStart = ticks[0] ?? '';
  const tickMid = ticks[1] ?? '';
  const tickEnd = ticks[2] ?? '';
  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

  return (
    <svg
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height }}
      data-testid="sparkline2"
    >
      <title>{ariaLabel}</title>
      <desc>
        {`Série de ${values.length} valeurs, dernière ${fmt(values[values.length - 1]!)}.`}
      </desc>
      <defs>
        <linearGradient id={strokeId} x1="0" x2="1">
          <stop offset="0" stopColor="var(--ink-300)" stopOpacity="0.4" />
          <stop offset="0.6" stopColor="var(--ink-500)" stopOpacity="0.7" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
        <linearGradient id={fillId} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* Baseline ticks (x=0, w/2, w) */}
      {showTicks
        ? [0, width / 2, width].map((x, i) => (
            <line
              key={i}
              x1={x}
              y1={height - 2}
              x2={x}
              y2={height - 6}
              stroke="var(--ink-300)"
              strokeWidth="1"
            />
          ))
        : null}

      {/* Fill zone fermée */}
      <polyline
        fill={`url(#${fillId})`}
        stroke="none"
        points={`0,${height - 8} ${polyline} ${width},${height - 8}`}
      />

      {/* Stroke courbe */}
      <polyline
        fill="none"
        stroke={`url(#${strokeId})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
      />

      {/* Hollow points intermédiaires : 1 sur 3, sauf le dernier */}
      {pts.map(([x, y], i) =>
        hollowIdx.has(i) ? (
          <circle
            key={`hp-${i}`}
            cx={x}
            cy={y}
            r="1.4"
            fill="var(--paper-50)"
            stroke="var(--ink-400)"
            strokeWidth="1"
          />
        ) : null,
      )}

      {/* Last point cuivre rempli (offset -2 horizontal) */}
      <circle
        cx={last[0] - 2}
        cy={last[1]}
        r="3.5"
        fill={color}
        stroke="var(--paper-50)"
        strokeWidth="1.5"
      />

      {/* Labels ticks dates */}
      {showTicks ? (
        <g fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-400)" textAnchor="middle">
          <text x="2" y={height} textAnchor="start">
            {tickStart}
          </text>
          <text x={width / 2} y={height}>
            {tickMid}
          </text>
          <text x={width - 2} y={height} textAnchor="end">
            {tickEnd}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
