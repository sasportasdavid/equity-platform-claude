'use client';

import { useEffect, useRef } from 'react';
import type { McResult } from '@/lib/mc/types';
import type { SimulatorParams } from '@/hooks/useMcSimulator';
import { cn } from '@/lib/utils';

const NF_EUR = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Styles par catégorie (Phase 2.1 calibrage) — index = pathCategories enum.
 *  0 = forfeited (paper-50 dim, arrière-plan)
 *  1 = hit_otm  (brass medium)
 *  2 = hit_itm  (bond dominant, dessiné en dernier)
 */
const CATEGORY_STYLES = [
  { color: 'rgba(240, 234, 216, 0.08)', width: 0.6 }, // forfeited
  { color: 'rgba(212, 160, 106, 0.30)', width: 0.7 }, // hit_otm
  { color: 'rgba(79, 181, 138, 0.55)', width: 0.8 }, // hit_itm
] as const;

const COLORS = {
  meanLine: '#D4A06A',
  barrier: 'rgba(212, 160, 106, 0.85)',
  barrierLine: 'rgba(212, 160, 106, 0.55)',
  strike: 'rgba(240, 234, 216, 0.55)',
  strikeLine: 'rgba(240, 234, 216, 0.30)',
  spot: 'rgba(240, 234, 216, 0.55)',
  spotLine: 'rgba(240, 234, 216, 0.20)',
  quantile: 'rgba(212, 160, 106, 0.45)',
  text: 'rgba(240, 234, 216, 0.55)',
  textBright: 'rgba(240, 234, 216, 0.85)',
};

const PADDING = { top: 28, right: 130, bottom: 28, left: 16 };

/**
 * Canvas 2D rendant les 600 paths sub-samplés du `McResult`,
 * coloré par catégorie (forfeited / hit_otm / hit_itm).
 *
 * Phase 2.1 fixes :
 *  - Tri par catégorie avant draw (forfeited en arrière-plan, ITM
 *    en dernier au-dessus)
 *  - Opacities calibrées : 0.08 / 0.30 / 0.55
 *  - Clip Y aux quantiles p1/p99 du prix terminal (cap S0×2.8)
 *  - Annotations posées en bout de ligne respective (pas empilées)
 *  - Deps useEffect renforcées avec result.inputHash + result.runtimeMs
 *    pour invalidation garantie (les Float32Array transferred sont
 *    déjà des refs neuves mais la défense ceinture+bretelles)
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
      const targetW = cssW * dpr;
      const targetH = cssH * dpr;
      // Setting canvas.width/height auto-clears le buffer ; on le fait
      // toujours pour garantir un nettoyage complet, même si dimensions
      // identiques (sécurité contre le rendu superposé).
      canvas.width = targetW;
      canvas.height = targetH;
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
    // Deps : result entier (Float32Array refs neuves à chaque run via
    // transferable Float32Array), params (S0/K/B/sigma/T).
    // result?.inputHash + result?.runtimeMs en filet pour invalidation
    // garantie même si le hash change identiquement.
  }, [result, result?.inputHash, result?.runtimeMs, params]);

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

/* === Internal drawing functions ============================== */

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

  const sample = result.pathsSample;
  const cats = result.pathCategories;
  const sampleCount = cats.length;
  const pathLen = sample.length / Math.max(1, sampleCount);
  if (pathLen < 2) return;

  // === Y range : clip via p1/p99 du terminal + cap S0×2.8 (Fix #2) ===
  const terminals: number[] = [];
  for (let p = 0; p < sampleCount; p++) {
    terminals.push(sample[p * pathLen + (pathLen - 1)]!);
  }
  terminals.sort((a, b) => a - b);
  const p1 = terminals[Math.max(0, Math.floor(sampleCount * 0.01))]!;
  const p99 = terminals[Math.min(sampleCount - 1, Math.floor(sampleCount * 0.99))]!;
  let yMax = Math.min(p99 * 1.1, params.S0 * 2.8);
  let yMin = Math.max(p1 * 0.9, params.S0 * 0.2);
  // Inclure barrière, strike, spot dans la fenêtre visible
  if (params.B !== null) yMax = Math.max(yMax, params.B * 1.05);
  yMin = Math.min(yMin, params.S0 * 0.5);
  yMax = Math.max(yMax, params.S0 * 1.4);
  if (yMax - yMin < 1) yMax = yMin + 1;

  const xOf = (t: number) => PADDING.left + (t / (pathLen - 1)) * innerW;
  const yOf = (price: number) => PADDING.top + (1 - (price - yMin) / (yMax - yMin)) * innerH;

  // === Tri par catégorie (Fix #1) ===
  // forfeited (0) drawn first → arrière-plan ; itm (2) drawn last → top.
  const order = new Uint16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) order[i] = i;
  // sort par cat ASC (stable insertion suffit pour 600 items)
  order.sort((a, b) => cats[a]! - cats[b]!);

  // === Clip rectangle pour les paths (évite débordements) ===
  ctx.save();
  ctx.beginPath();
  ctx.rect(PADDING.left, PADDING.top, innerW, innerH);
  ctx.clip();

  // Dessine en groupant par catégorie (1 path() par cat pour optim)
  let curCat = -1;
  for (let oi = 0; oi < sampleCount; oi++) {
    const p = order[oi]!;
    const c = cats[p]!;
    if (c !== curCat) {
      if (curCat !== -1) ctx.stroke();
      const style = CATEGORY_STYLES[c] ?? CATEGORY_STYLES[0];
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      ctx.beginPath();
      curCat = c;
    }
    const base = p * pathLen;
    ctx.moveTo(xOf(0), yOf(sample[base]!));
    for (let t = 1; t < pathLen; t++) {
      ctx.lineTo(xOf(t), yOf(sample[base + t]!));
    }
  }
  if (curCat !== -1) ctx.stroke();

  ctx.restore();

  // === Quantiles p5 / p50 / p95 ===
  const quantiles = computeQuantiles(sample, sampleCount, pathLen, [0.05, 0.5, 0.95]);
  if (quantiles) {
    drawQuantile(ctx, quantiles.p50, xOf, yOf, COLORS.meanLine, 1.6, false);
    drawQuantile(ctx, quantiles.p95, xOf, yOf, COLORS.quantile, 1.2, true);
    drawQuantile(ctx, quantiles.p5, xOf, yOf, COLORS.quantile, 1.2, true);
  }

  // === Lignes horizontales et annotations en bout de ligne (Fix #5) ===
  const labelX = w - PADDING.right + 6;
  ctx.font = '10.5px ui-monospace, "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  type Label = { y: number; text: string; color: string };
  const labels: Label[] = [];

  if (params.B !== null) {
    const yB = yOf(params.B);
    drawHorizontalLine(ctx, yB, w - PADDING.right, COLORS.barrierLine, [6, 4]);
    labels.push({ y: yB, text: `BARRIÈRE · ${NF_EUR.format(params.B)} €`, color: COLORS.barrier });
  }
  // Strike + Spot fusion si égaux (cas presets vanille K=S0)
  const yK = yOf(params.K);
  const yS0 = yOf(params.S0);
  if (Math.abs(yK - yS0) < 8 && params.K === params.S0) {
    drawHorizontalLine(ctx, yK, w - PADDING.right, COLORS.spotLine, [2, 3]);
    labels.push({
      y: yK,
      text: `S₀ · STRIKE · ${NF_EUR.format(params.K)} €`,
      color: COLORS.strike,
    });
  } else {
    if (params.K > 0) {
      drawHorizontalLine(ctx, yK, w - PADDING.right, COLORS.strikeLine, [2, 3]);
      labels.push({ y: yK, text: `STRIKE · ${NF_EUR.format(params.K)} €`, color: COLORS.strike });
    }
    drawHorizontalLine(ctx, yS0, w - PADDING.right, COLORS.spotLine, [2, 3]);
    labels.push({ y: yS0, text: `S₀ · ${NF_EUR.format(params.S0)} €`, color: COLORS.spot });
  }
  if (quantiles) {
    const lastP95 = quantiles.p95[pathLen - 1]!;
    const lastP50 = quantiles.p50[pathLen - 1]!;
    const lastP5 = quantiles.p5[pathLen - 1]!;
    labels.push({ y: yOf(lastP95), text: `p95 · ${NF_EUR.format(lastP95)} €`, color: COLORS.text });
    labels.push({ y: yOf(lastP50), text: `p50 · ${NF_EUR.format(lastP50)} €`, color: COLORS.text });
    labels.push({ y: yOf(lastP5), text: `p5 · ${NF_EUR.format(lastP5)} €`, color: COLORS.text });
  }

  // Anti-overlap : décale les labels qui sont à moins de 14 px les uns des autres.
  labels.sort((a, b) => a.y - b.y);
  const MIN_GAP = 13;
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1]!;
    const cur = labels[i]!;
    if (cur.y - prev.y < MIN_GAP) cur.y = prev.y + MIN_GAP;
  }
  // Clip dans la fenêtre canvas
  for (const l of labels) {
    l.y = Math.max(PADDING.top + 8, Math.min(h - PADDING.bottom - 8, l.y));
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, labelX, l.y);
  }

  // Axes labels bas
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.fillText('t = 0', PADDING.left, h - 8);
  ctx.textAlign = 'right';
  ctx.fillText(`T = ${formatT(params.T)} ans`, w - PADDING.right, h - 8);
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
