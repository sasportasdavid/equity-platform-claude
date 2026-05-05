import { useId } from 'react';
import { computeSparklinePoints, sparklineDotColor } from './sparkline-helpers';

/**
 * PR #37 B1 — Sparkline pure SVG (canonique cw-chrome.jsx).
 *
 * Spec exacte (extraite de `cw-chrome.jsx`) :
 * - viewBox `0 0 width height+2`, preserveAspectRatio="none", overflow visible
 * - 1 gradient horizontal : ink-300 → color (default brass-500)
 * - Polyline fill (zone fermée) opacity 0.08
 * - Polyline stroke 1.5
 * - Anchor final OBLIGATOIRE :
 *   * Anneau : circle r=4 fill=none stroke=color strokeWidth=1.5 opacity=0.9
 *   * Plein   : circle r=2.2 fill=color
 * - dotColor = trailDown ? title-500 : color
 *
 * Adaptations V1e :
 * - ID gradient via `useId()` (déterministe SSR — vs cw-chrome `Math.random()`
 *   qui produirait un mismatch hydration en Next.js).
 * - a11y : role="img" + <title> + <desc> pour lecteur d'écran.
 *
 * Variante riche `<Sparkline2>` pour le HeroKpi (cf Sparkline2.tsx).
 */
export type SparklineProps = {
  /** Série de valeurs numériques. Au moins 2 points. */
  values: number[];
  /** Couleur principale (stroke + fill gradient + dot). Default brass-500. */
  color?: string;
  /** Largeur viewBox. Default 200. */
  width?: number;
  /** Hauteur viewBox. Default 32. */
  height?: number;
  /** Si true, le dot final passe en title-500 (signal trend baissière). */
  trailDown?: boolean;
  /** Label a11y (utilisé dans <title>). Default "Sparkline série". */
  ariaLabel?: string;
};

export function Sparkline({
  values,
  color = 'var(--brass-500)',
  width = 200,
  height = 32,
  trailDown = false,
  ariaLabel = 'Sparkline série',
}: SparklineProps) {
  const reactId = useId();
  const gradientId = `sg${reactId.replace(/[:]/g, '')}`;

  if (!values.length) return null;

  const projected = computeSparklinePoints(values, width, height);
  const lastIdx = projected.length - 1;
  const lastPoint = projected[lastIdx]!;
  const [lastX, lastY] = lastPoint;
  const pts = projected.map(([x, y]) => `${x},${y}`).join(' ');

  const dotColor = sparklineDotColor(color, trailDown);
  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const lastValue = values[lastIdx]!;

  return (
    <svg
      role="img"
      viewBox={`0 0 ${width} ${height + 2}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height, overflow: 'visible' }}
      data-testid="sparkline"
    >
      <title>{ariaLabel}</title>
      <desc>
        {`Série de ${values.length} valeurs, dernière ${fmt(lastValue)}, ${trailDown ? 'tendance baissière' : 'tendance stable ou haussière'}.`}
      </desc>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1">
          <stop offset="0" stopColor="var(--ink-300)" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <polyline
        fill={`url(#${gradientId})`}
        fillOpacity="0.08"
        stroke="none"
        points={`0,${height} ${pts} ${width},${height}`}
      />
      <polyline fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.5" points={pts} />
      <circle
        cx={lastX}
        cy={lastY}
        r="4"
        fill="none"
        stroke={dotColor}
        strokeWidth="1.5"
        opacity="0.9"
      />
      <circle cx={lastX} cy={lastY} r="2.2" fill={dotColor} />
    </svg>
  );
}
