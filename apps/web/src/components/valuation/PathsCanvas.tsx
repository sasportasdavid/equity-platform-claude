'use client';

/**
 * Module 11 B3 — `PathsCanvas.tsx`.
 *
 * Canvas 2D HTML5 dessinant les trajectoires Monte Carlo color-coded selon
 * les `paths_metadata` (achieved_vesting × final_itm). Décision archi
 * (cf MODULE_11 §0.2) : Canvas 2D plutôt que WebGL — suffisant pour 3000
 * paths, plus simple à coder, plus stable cross-browser.
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.4.
 *
 * Props :
 *  - `enableReplay=true` → animation cinématique 5s ease-out cubic au mount
 *  - `enableReplay=false` → render statique direct
 *
 * La couche replay cinématique sera raffinée en B4 (extraction d'un hook
 * `useMonteCarloReplay` réutilisable). En B3 : implémentation inline simple.
 */

import { useEffect, useRef } from 'react';
import type { PathSampleMetadata } from '@equity/shared';
import { PATH_COLORS, colorForPath, computeBounds, easeOutCubic } from './helpers';

export type PathsCanvasProps = {
  /** Tableaux 2D des trajectoires : paths[i][step] = price */
  paths: number[][];
  /** Métadonnées alignées 1:1 avec `paths` */
  metadata: PathSampleMetadata[];
  /** Spot price S₀ pour le label de gauche */
  S0: number;
  /** Barrière de marché (rouge dashed) si présente */
  barrier?: number;
  /** Nombre de steps de simulation */
  numSteps: number;
  /** Horizon en années (label en bas-droite) */
  simT: number;
  /** Active l'animation cinématique progressive au mount */
  enableReplay?: boolean;
  /** Devise pour les labels (default EUR) */
  currency?: string;
};

const REPLAY_DURATION_MS = 5000;

const LABEL_COLOR = '#44403c';

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function PathsCanvas({
  paths,
  metadata,
  S0,
  barrier,
  numSteps,
  simT,
  enableReplay = false,
  currency = 'EUR',
}: PathsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (paths.length === 0) {
      // Clear canvas si pas de paths
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Bounds calculées sur le full set pour stabilité pendant l'animation
    const { yMin, yMax } = computeBounds(paths);

    // High-DPI scaling
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const xToCanvas = (t: number) => (t / simT) * cssWidth;
    const yToCanvas = (s: number) => cssHeight - ((s - yMin) / (yMax - yMin)) * cssHeight;

    /** Render une frame avec un sous-ensemble de paths (pour animation). */
    const draw = (visibleCount: number) => {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // 1. Trajectoires color-coded
      ctx.lineWidth = 0.5;
      const limit = Math.min(visibleCount, paths.length);
      for (let i = 0; i < limit; i++) {
        const path = paths[i];
        if (!path || path.length === 0) continue;
        ctx.strokeStyle = colorForPath(metadata[i]);
        ctx.beginPath();
        for (let t = 0; t < path.length; t++) {
          const dt = (t / Math.max(numSteps, 1)) * simT;
          const x = xToCanvas(dt);
          const y = yToCanvas(path[t] as number);
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 2. Barrière (rouge dashed) si présente
      if (barrier !== undefined && barrier >= yMin && barrier <= yMax) {
        ctx.strokeStyle = PATH_COLORS.barrier;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        const yBar = yToCanvas(barrier);
        ctx.moveTo(0, yBar);
        ctx.lineTo(cssWidth, yBar);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label "Barrière X €"
        ctx.fillStyle = PATH_COLORS.barrier;
        ctx.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Barrière ${eurFormatter.format(barrier)}`, cssWidth - 4, yBar - 4);
      }

      // 3. Labels axes (S₀ en haut-gauche, T en bas-droite)
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left';
      const s0Label = currency === 'EUR' ? eurFormatter.format(S0) : `${S0} ${currency}`;
      ctx.fillText(`S₀ = ${s0Label}`, 4, 12);

      ctx.textAlign = 'right';
      ctx.fillText(`T = ${simT}y`, cssWidth - 4, cssHeight - 4);
    };

    if (!enableReplay) {
      draw(paths.length);
      return;
    }

    // Animation cinématique 5 sec ease-out cubic
    let frameId: number;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / REPLAY_DURATION_MS, 1);
      const eased = easeOutCubic(progress);
      const visiblePathCount = Math.max(1, Math.floor(paths.length * eased));
      draw(visiblePathCount);
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [paths, metadata, S0, barrier, numSteps, simT, enableReplay, currency]);

  return (
    <div className="border-paper-300 bg-paper-50 rounded-md border p-3" data-testid="paths-canvas">
      <h3 className="text-ink-700 mb-2 font-mono text-xs uppercase tracking-wider">
        {paths.length.toLocaleString('fr-FR')} trajectoires Monte Carlo
      </h3>
      <canvas
        ref={canvasRef}
        className="block h-72 w-full sm:h-80 md:h-96"
        data-testid="paths-canvas-element"
      />

      <div className="text-ink-500 mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
        <LegendItem color={PATH_COLORS.achievedItm} label="Barrière touchée + ITM final" />
        <LegendItem color={PATH_COLORS.achievedOtm} label="Touchée mais OTM" />
        <LegendItem color={PATH_COLORS.notAchieved} label="Non touchée (forfeited)" />
        {barrier !== undefined ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4"
              style={{
                backgroundImage: `linear-gradient(to right, ${PATH_COLORS.barrier} 50%, transparent 50%)`,
                backgroundSize: '6px 100%',
              }}
            />
            Barrière {eurFormatter.format(barrier)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  // Solid color legend chips — utilise un alpha plus opaque pour la lisibilité
  // (les paths sur le canvas sont volontairement très transparents pour
  // l'effet "nuage").
  const opaque = color.replace(/[\d.]+\)$/, '0.8)');
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-0.5 w-4"
        style={{ backgroundColor: opaque }}
      />
      {label}
    </span>
  );
}
