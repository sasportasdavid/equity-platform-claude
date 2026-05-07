'use client';

import { useEffect, useRef } from 'react';
import type { McResult } from '@/lib/mc/types';
import type { SimulatorParams } from '@/hooks/useMcSimulator';
import { cn } from '@/lib/utils';

const NF_EUR = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const COLORS = {
  pathForfeited: 'rgba(240, 234, 216, 0.15)',
  pathOtm: 'rgba(212, 160, 106, 0.4)',
  pathItm: 'rgba(79, 181, 138, 0.55)',
  meanLine: '#D4A06A',
  barrier: 'rgba(212, 160, 106, 0.7)',
  strike: 'rgba(240, 234, 216, 0.4)',
  spot: 'rgba(240, 234, 216, 0.3)',
  quantile: 'rgba(212, 160, 106, 0.45)',
  text: 'rgba(240, 234, 216, 0.55)',
  textBright: 'rgba(240, 234, 216, 0.85)',
};

const PADDING = { top: 28, right: 110, bottom: 28, left: 16 };

/**
 * Canvas 2D rendant les 600 paths sub-samplés du `McResult`,
 * coloré par catégorie (forfeited / hit_otm / hit_itm). Lignes
 * horizontales pour B / K / S0, percentiles p5/p50/p95 calculés
 * client-side, légende + axes.
 *
 * DPR-aware : multiplie les dimensions par devicePixelRatio et
 * scale le ctx pour rester net sur écrans hi-dpi.
 */
export function PathsCanvas({
  result,
  params,
  isComputing,
  className,
}: {
  result: McResult | null;
  params: SimulatorParams;
  isComputing: boolean;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    let raf = 0;
    const draw = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.floor(rect.width);
      const cssH = Math.floor(rect.height);
      if (canvas.width !== cssW * dpr) canvas.width = cssW * dpr;
      if (canvas.height !== cssH * dpr) canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      drawScene(ctx, cssW, cssH, result, params);
    };

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    });
    ro.observe(wrapper);
    draw();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [result, params]);

  const itm = result ? (result.itmFinalRate * 100).toFixed(1) : '0,0';
  const otmHit = result
    ? Math.max(0, (result.hitRateBarrier - result.itmFinalRate) * 100).toFixed(1)
    : '0,0';
  const forfeited = result ? (result.forfeitedRate * 100).toFixed(1) : '0,0';

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'border-white/8 relative overflow-hidden rounded-[10px] border bg-black/20',
        className,
      )}
      style={{ minHeight: 280 }}
    >
      <canvas
        ref={canvasRef}
        className={cn('block h-full w-full transition-opacity', isComputing && 'opacity-65')}
        aria-label="Trajectoires Monte Carlo"
      />
      {/* Legend overlay top-right */}
      <div className="text-mkt-mono pointer-events-none absolute right-3 top-2.5 flex flex-col items-end gap-1 text-[10.5px] tracking-wider text-[#F0EAD8]/65">
        <span className="inline-flex items-center gap-2">
          <span className="size-[3px] rounded-full" style={{ background: '#4FB58A' }} />
          Touchée + ITM ({itm.replace('.', ',')} %)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-[3px] rounded-full" style={{ background: '#D4A06A' }} />
          Touchée OTM ({otmHit.replace('.', ',')} %)
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="size-[3px] rounded-full"
            style={{ background: 'rgba(240,234,216,0.45)' }}
          />
          Forfeited ({forfeited.replace('.', ',')} %)
        </span>
      </div>
      {isComputing && (
        <div className="text-mkt-mono pointer-events-none absolute left-3 top-2.5 text-[10px] uppercase tracking-[0.16em] text-[#D4A06A]">
          ● calcul en cours
        </div>
      )}
    </div>
  );
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  result: McResult | null,
  params: SimulatorParams,
) {
  if (!result) return;
  const innerW = w - PADDING.left - PADDING.right;
  const innerH = h - PADDING.top - PADDING.bottom;
  if (innerW <= 0 || innerH <= 0) return;

  // Y range = min/max sur les paths sample (avec un peu de padding) — robuste
  // aux outliers extrêmes via percentile 1-99 si trop spread.
  const sample = result.pathsSample;
  const cats = result.pathCategories;
  const sampleCount = cats.length;
  const pathLen = sample.length / Math.max(1, sampleCount);
  if (pathLen < 2) return;

  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < sample.length; i++) {
    const v = sample[i]!;
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }
  // Inclure barrière + strike + spot dans le range
  if (params.B !== null) yMax = Math.max(yMax, params.B * 1.05);
  yMin = Math.min(yMin, params.S0 * 0.6);
  yMax = Math.max(yMax, params.S0 * 1.4);
  if (yMax - yMin < 1) yMax = yMin + 1;

  const xOf = (t: number) => PADDING.left + (t / (pathLen - 1)) * innerW;
  const yOf = (price: number) => PADDING.top + (1 - (price - yMin) / (yMax - yMin)) * innerH;

  // Ordre de dessin : forfeited (clair, beaucoup) → otm → itm (vif, dessus)
  drawPathsByCategory(ctx, sample, cats, pathLen, xOf, yOf, 0, COLORS.pathForfeited);
  drawPathsByCategory(ctx, sample, cats, pathLen, xOf, yOf, 1, COLORS.pathOtm);
  drawPathsByCategory(ctx, sample, cats, pathLen, xOf, yOf, 2, COLORS.pathItm);

  // Quantiles : p5, p50, p95 calculés sur sample (par colonne de step)
  const quantiles = computeQuantiles(sample, sampleCount, pathLen, [0.05, 0.5, 0.95]);
  if (quantiles) {
    drawQuantile(ctx, quantiles.p50, xOf, yOf, COLORS.meanLine, 1.6, false);
    drawQuantile(ctx, quantiles.p95, xOf, yOf, COLORS.quantile, 1.2, true);
    drawQuantile(ctx, quantiles.p5, xOf, yOf, COLORS.quantile, 1.2, true);
  }

  // Lignes horizontales : barrière, strike, spot
  ctx.font = '10.5px ui-monospace, "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  if (params.B !== null) {
    drawHorizontalLine(ctx, yOf(params.B), w - PADDING.right, COLORS.barrier, [6, 4]);
    drawLabel(
      ctx,
      `BARRIÈRE · ${NF_EUR.format(params.B)} €`,
      w - PADDING.right + 6,
      yOf(params.B),
      COLORS.barrier,
    );
  }
  drawHorizontalLine(ctx, yOf(params.K), w - PADDING.right, COLORS.strike, [2, 3]);
  drawLabel(
    ctx,
    `STRIKE · ${NF_EUR.format(params.K)} €`,
    w - PADDING.right + 6,
    yOf(params.K),
    COLORS.strike,
  );
  drawHorizontalLine(ctx, yOf(params.S0), w - PADDING.right, COLORS.spot, [2, 3]);
  drawLabel(
    ctx,
    `S₀ · ${NF_EUR.format(params.S0)} €`,
    w - PADDING.right + 6,
    yOf(params.S0) - 12,
    COLORS.spot,
  );

  // Quantile labels droite
  if (quantiles) {
    const lastP95 = quantiles.p95[pathLen - 1]!;
    const lastP50 = quantiles.p50[pathLen - 1]!;
    const lastP5 = quantiles.p5[pathLen - 1]!;
    drawLabel(
      ctx,
      `p95 · ${NF_EUR.format(lastP95)} €`,
      w - PADDING.right + 6,
      yOf(lastP95) - 12,
      COLORS.text,
    );
    drawLabel(
      ctx,
      `p50 · ${NF_EUR.format(lastP50)} €`,
      w - PADDING.right + 6,
      yOf(lastP50) + 12,
      COLORS.text,
    );
    drawLabel(
      ctx,
      `p5 · ${NF_EUR.format(lastP5)} €`,
      w - PADDING.right + 6,
      yOf(lastP5),
      COLORS.text,
    );
  }

  // Axes labels bas
  ctx.fillStyle = COLORS.text;
  ctx.font = '10.5px ui-monospace, "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('t = 0', PADDING.left, h - 8);
  ctx.textAlign = 'right';
  ctx.fillText(`T = ${formatT(params.T)} ans`, w - PADDING.right, h - 8);
}

function drawPathsByCategory(
  ctx: CanvasRenderingContext2D,
  sample: Float32Array,
  cats: Uint8Array,
  pathLen: number,
  xOf: (t: number) => number,
  yOf: (price: number) => number,
  cat: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let p = 0; p < cats.length; p++) {
    if (cats[p] !== cat) continue;
    const base = p * pathLen;
    ctx.moveTo(xOf(0), yOf(sample[base]!));
    for (let t = 1; t < pathLen; t++) {
      ctx.lineTo(xOf(t), yOf(sample[base + t]!));
    }
  }
  ctx.stroke();
}

function drawHorizontalLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  xMax: number,
  color: string,
  dash: number[],
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(PADDING.left, y);
  ctx.lineTo(xMax, y);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function drawQuantile(
  ctx: CanvasRenderingContext2D,
  series: number[],
  xOf: (t: number) => number,
  yOf: (p: number) => number,
  color: string,
  width: number,
  dashed: boolean,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [4, 4] : []);
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(series[0]!));
  for (let t = 1; t < series.length; t++) {
    ctx.lineTo(xOf(t), yOf(series[t]!));
  }
  ctx.stroke();
  ctx.restore();
}

function computeQuantiles(
  sample: Float32Array,
  pathCount: number,
  pathLen: number,
  qs: number[],
): { p5: number[]; p50: number[]; p95: number[] } | null {
  if (pathCount < 5) return null;
  const out: number[][] = qs.map(() => new Array(pathLen));
  const col = new Float64Array(pathCount);
  for (let t = 0; t < pathLen; t++) {
    for (let p = 0; p < pathCount; p++) col[p] = sample[p * pathLen + t]!;
    col.sort();
    qs.forEach((q, qi) => {
      const idx = Math.min(pathCount - 1, Math.max(0, Math.floor(q * (pathCount - 1))));
      out[qi]![t] = col[idx]!;
    });
  }
  return { p5: out[0]!, p50: out[1]!, p95: out[2]! };
}

function formatT(t: number): string {
  return Number.isInteger(t) ? String(t) : t.toFixed(1).replace('.', ',');
}
