'use client';

import { useMemo } from 'react';
import type { AcquisitionScale } from '@equity/shared';

/**
 * MODULE_03A_PLANS Step 4.10 — preview live de l'échelle d'acquisition.
 *
 * Implémentation SVG inline custom (sans Recharts) parce que
 * `ResponsiveContainer` mesure mal son parent en SSR Next 16, ce qui
 * laisse le chart à `width(-1) height(-1)` et invisible (cf. warning
 * "The width(-1) and height(-1) of chart should be greater than 0").
 *
 * Le chart custom est minimal mais suffisant pour ce preview :
 *  - axes X et Y avec graduation
 *  - lignes de référence à 100 % (cible)
 *  - mode CURVE → polyline linéaire entre points
 *  - mode TIERS → escalier (chaque palier = ligne horizontale + saut
 *    vertical à la frontière du palier suivant)
 *  - légère info au survol via `<title>` SVG natif
 */

const VIEW_W = 600;
const VIEW_H = 200;
const PAD = { top: 12, right: 16, bottom: 28, left: 40 };

export function AcquisitionScaleChart({ scale }: { scale: AcquisitionScale }) {
  const series = useMemo(() => buildSeries(scale), [scale]);

  if (series.length === 0) return null;

  const maxX = Math.max(120, ...series.map((p) => p.threshold));
  const maxY = Math.max(120, ...series.map((p) => p.acquisition));

  const innerW = VIEW_W - PAD.left - PAD.right;
  const innerH = VIEW_H - PAD.top - PAD.bottom;

  const xScale = (x: number) => PAD.left + (x / maxX) * innerW;
  const yScale = (y: number) => PAD.top + innerH - (y / maxY) * innerH;

  const polylinePoints = series
    .map((p) => `${xScale(p.threshold)},${yScale(p.acquisition)}`)
    .join(' ');

  // Graduation : 5 ticks sur chaque axe
  const xTicks = [0, maxX / 4, maxX / 2, (3 * maxX) / 4, maxX];
  const yTicks = [0, maxY / 4, maxY / 2, (3 * maxY) / 4, maxY];

  return (
    <div
      className="bg-muted/20 rounded-md border p-3"
      data-testid="acquisition-scale-chart"
      data-mode={scale.mode}
    >
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        Aperçu de la courbe (live)
      </p>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="text-foreground h-48 w-full"
        role="img"
        aria-label={`Aperçu de l’échelle d’acquisition mode ${scale.mode}`}
      >
        {/* Grille — lignes horizontales aux ticks Y */}
        {yTicks.map((y, i) => (
          <line
            key={`gy-${i}`}
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={yScale(y)}
            y2={yScale(y)}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        ))}
        {xTicks.map((x, i) => (
          <line
            key={`gx-${i}`}
            x1={xScale(x)}
            x2={xScale(x)}
            y1={PAD.top}
            y2={VIEW_H - PAD.bottom}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        ))}

        {/* Lignes de référence à 100 % (cible) */}
        {100 <= maxX ? (
          <line
            x1={xScale(100)}
            x2={xScale(100)}
            y1={PAD.top}
            y2={VIEW_H - PAD.bottom}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeDasharray="3 3"
          />
        ) : null}
        {100 <= maxY ? (
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={yScale(100)}
            y2={yScale(100)}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeDasharray="3 3"
          />
        ) : null}

        {/* Axes */}
        <line
          x1={PAD.left}
          x2={PAD.left}
          y1={PAD.top}
          y2={VIEW_H - PAD.bottom}
          stroke="currentColor"
          strokeOpacity="0.4"
        />
        <line
          x1={PAD.left}
          x2={VIEW_W - PAD.right}
          y1={VIEW_H - PAD.bottom}
          y2={VIEW_H - PAD.bottom}
          stroke="currentColor"
          strokeOpacity="0.4"
        />

        {/* Ticks labels */}
        {xTicks.map((x, i) => (
          <text
            key={`xt-${i}`}
            x={xScale(x)}
            y={VIEW_H - PAD.bottom + 14}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.6"
          >
            {x.toFixed(0)} %
          </text>
        ))}
        {yTicks.map((y, i) => (
          <text
            key={`yt-${i}`}
            x={PAD.left - 4}
            y={yScale(y) + 3}
            fontSize="10"
            textAnchor="end"
            fill="currentColor"
            opacity="0.6"
          >
            {y.toFixed(0)} %
          </text>
        ))}

        {/* Polyline data */}
        <polyline points={polylinePoints} fill="none" stroke="rgb(79 70 229)" strokeWidth="2" />
        {/* Points */}
        {series.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={xScale(p.threshold)}
            cy={yScale(p.acquisition)}
            r="3"
            fill="rgb(79 70 229)"
          >
            <title>
              {p.threshold.toFixed(2)} % → {p.acquisition.toFixed(2)} %
            </title>
          </circle>
        ))}

        {/* Labels axes */}
        <text
          x={(VIEW_W + PAD.left) / 2}
          y={VIEW_H - 4}
          fontSize="10"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.6"
        >
          Threshold (%)
        </text>
        <text
          x={10}
          y={VIEW_H / 2}
          fontSize="10"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.6"
          transform={`rotate(-90 10 ${VIEW_H / 2})`}
        >
          Acquisition (%)
        </text>
      </svg>
    </div>
  );
}

function buildSeries(scale: AcquisitionScale) {
  if (scale.mode === 'CURVE') {
    return scale.points
      .slice()
      .sort((a, b) => a.threshold - b.threshold)
      .map((p) => ({ threshold: p.threshold, acquisition: p.acquisition }));
  }
  // TIERS : 2 points par palier (début + fin) — la polyline reliera
  // horizontalement les 2 points puis sautera verticalement vers le palier
  // suivant. Le sort par min garantit l'ordre.
  const series: Array<{ threshold: number; acquisition: number }> = [];
  scale.tiers
    .slice()
    .sort((a, b) => a.min - b.min)
    .forEach((tier) => {
      series.push({ threshold: tier.min, acquisition: tier.acquisition });
      series.push({ threshold: tier.max, acquisition: tier.acquisition });
    });
  return series;
}
