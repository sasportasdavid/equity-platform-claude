/**
 * Engine Monte Carlo IFRS 2 — single-pass GBM avec accumulation streaming.
 *
 * Méthodologie :
 *  - Underlying GBM risk-neutral : S(t+dt) = S(t) · exp((r - q - σ²/2)·dt + σ·√dt·Z)
 *  - Discrétisation : `steps` pas uniformes sur [0, T], dt = T/steps
 *  - Payoff par défaut : max(S_T - K, 0). Pour les options barrière
 *    up-and-in, le payoff vaut 0 si max_t S(t) < B.
 *  - Discount continu : payoff_actualisé = exp(-r·T) · payoff
 *  - FV = E[payoff_actualisé] estimée par la moyenne empirique
 *  - Std error = σ_payoffs / √N (Welford online variance)
 *  - IC95 = FV ± 1.96 · stdError
 *
 * Greeks par différences finies centrées avec même seed que le run de
 * référence (CRN — Common Random Numbers — pour réduire la variance) :
 *  - Δ (delta) : (FV(S0·1.01) - FV(S0·0.99)) / (0.02·S0)
 *  - ν (vega) : (FV(σ+0.01) - FV(σ-0.01)) / 0.02
 *  - ϱ (rho)  : (FV(r+0.0001) - FV(r-0.0001)) / 0.0002
 *  Bumps : S0 ± 1 % · S0 / σ ± 0.01 / r ± 0.0001 (selon spec).
 *  Runs greeks à N/2 paths pour limiter le coût (3 runs × N/2 ≈ 1.5·N
 *  vs run principal à N).
 *
 * TSR peer V1 (preset = `tsr_peer`) :
 *  Un 2e GBM "peer" corrélé à l'underlying via Cholesky 2D.
 *  Paramètres : S0_peer = S0, σ_peer = σ, q_peer = q, ρ = 0.5.
 *  Payoff = max(S_T - K, 0) si S_T > peer_T, sinon 0.
 *  Cette simplification 1-peer sera étendue V2 à un panier complet.
 *
 * Perf : Float32Array partout, pas d'allocation dans les boucles
 * internes, pré-cache des bins d'histogrammes.
 */

import { createGaussian } from './gaussian';
import { createPcg32 } from './prng';
import type { McInput, McResult } from './types';

export const ENGINE_VERSION = 'capiwise-mc-js-1.0.0';

const SAMPLE_PATHS = 600;
const CONVERGENCE_JALONS = 50;
const HIST_BINS = 30;

/**
 * Run principal — réutilisable pour les bumps greeks et les
 * sensibilités. Retourne le minimum nécessaire pour calculer la FV
 * (pas les histogrammes / paths sample qui ne sont produits qu'une
 * fois côté caller).
 */
type LightRun = { fv: number };

function runCore(input: McInput): LightRun {
  const { S0, K, B, sigma, r, q, T, N, steps, seed, preset } = input;
  const dt = T / steps;
  const drift = (r - q - 0.5 * sigma * sigma) * dt;
  const volStep = sigma * Math.sqrt(dt);
  const discount = Math.exp(-r * T);

  const prng = createPcg32(seed);
  const gauss = createGaussian(prng);

  // TSR peer correlation (Cholesky 2D)
  const isTsr = preset === 'tsr_peer';
  const rho = 0.5;
  const peerVolFactor = Math.sqrt(1 - rho * rho);

  let sumPayoff = 0;
  for (let n = 0; n < N; n++) {
    let s = S0;
    let sPeer = isTsr ? S0 : 0;
    let touched = !B; // si pas de barrière, payoff inconditionnel
    for (let t = 0; t < steps; t++) {
      const z = gauss();
      s = s * Math.exp(drift + volStep * z);
      if (B && !touched && s >= B) touched = true;
      if (isTsr) {
        const z2 = gauss();
        const zPeer = rho * z + peerVolFactor * z2;
        sPeer = sPeer * Math.exp(drift + volStep * zPeer);
      }
    }
    let payoff = touched ? Math.max(s - K, 0) : 0;
    if (isTsr && payoff > 0 && sPeer >= s) payoff = 0;
    sumPayoff += discount * payoff;
  }

  return { fv: sumPayoff / N };
}

/**
 * Sérialisation canonique de l'input pour hash SHA-256.
 * Clés sortées, B null normalisé en `null`.
 */
async function computeInputHash(input: McInput): Promise<string> {
  const ordered = {
    B: input.B,
    K: input.K,
    N: input.N,
    S0: input.S0,
    T: input.T,
    preset: input.preset,
    q: input.q,
    r: input.r,
    seed: input.seed,
    sigma: input.sigma,
    steps: input.steps,
  };
  const canonical = JSON.stringify(ordered);
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    // Fallback déterministe (FNV-1a 32-bit) pour environnements de test
    // sans Web Crypto. Pas cryptographiquement robuste, mais suffisant
    // pour un identifiant stable de simulation.
    let h = 0x811c9dc5;
    for (let i = 0; i < canonical.length; i++) {
      h ^= canonical.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0').slice(0, 8);
  }
  const buf = new TextEncoder().encode(canonical);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 8);
}

/**
 * Lance la simulation complète et retourne le résultat structuré pour
 * la visualisation. 100 % synchrone côté CPU (le `Promise` existe
 * uniquement pour `crypto.subtle.digest`).
 */
export async function runMonteCarlo(input: McInput): Promise<McResult> {
  const tStart = performance.now();
  const { S0, K, B, sigma, r, q, T, N, steps, seed, preset } = input;
  const dt = T / steps;
  const drift = (r - q - 0.5 * sigma * sigma) * dt;
  const volStep = sigma * Math.sqrt(dt);
  const discount = Math.exp(-r * T);

  // Bins pré-calculés pour les histogrammes
  const sampleStride = Math.max(1, Math.floor(N / SAMPLE_PATHS));
  const sampleCount = Math.min(SAMPLE_PATHS, Math.floor(N / sampleStride));
  const pathLen = steps + 1;
  const pathsSample = new Float32Array(sampleCount * pathLen);
  const pathCategories = new Uint8Array(sampleCount);

  // Convergence : jalons espacés en log(N) entre 100 et N
  const jalons = computeConvergenceJalons(N);
  const convergenceCurve: Array<{ n: number; fv: number; ic: number }> = [];
  let nextJalonIdx = 0;

  // Welford streaming variance pour FV
  let mean = 0;
  let m2 = 0;
  let count = 0;

  // Histograms — bornes empiriques (premier passage : on collecte d'abord
  // les valeurs, puis on bin une fois). Pour limiter mémoire, on stocke
  // dans des Float32Array de taille N.
  const payoffs = new Float32Array(N);
  const terminals = new Float32Array(N);
  const hitTimes: number[] = []; // sparse — uniquement les paths qui touchent

  let touchedCount = 0;
  let itmCount = 0;

  const prng = createPcg32(seed);
  const gauss = createGaussian(prng);

  const isTsr = preset === 'tsr_peer';
  const rho = 0.5;
  const peerVolFactor = Math.sqrt(1 - rho * rho);

  for (let n = 0; n < N; n++) {
    let s = S0;
    let sPeer = isTsr ? S0 : 0;
    let touched = !B;
    let firstHitT = -1;
    const isSampled = sampleStride === 1 || n % sampleStride === 0;
    const sampleIdx = isSampled ? Math.floor(n / sampleStride) : -1;

    if (sampleIdx >= 0 && sampleIdx < sampleCount) {
      pathsSample[sampleIdx * pathLen] = s;
    }

    for (let t = 0; t < steps; t++) {
      const z = gauss();
      s = s * Math.exp(drift + volStep * z);
      if (B && !touched && s >= B) {
        touched = true;
        firstHitT = (t + 1) * dt;
      }
      if (isTsr) {
        const z2 = gauss();
        const zPeer = rho * z + peerVolFactor * z2;
        sPeer = sPeer * Math.exp(drift + volStep * zPeer);
      }
      if (sampleIdx >= 0 && sampleIdx < sampleCount) {
        pathsSample[sampleIdx * pathLen + t + 1] = s;
      }
    }

    let payoff = touched ? Math.max(s - K, 0) : 0;
    if (isTsr && payoff > 0 && sPeer >= s) payoff = 0;
    const discPayoff = discount * payoff;

    payoffs[n] = discPayoff;
    terminals[n] = s;
    if (touched && B) hitTimes.push(firstHitT);
    if (touched) touchedCount++;
    if (payoff > 0) itmCount++;

    // Welford
    count++;
    const delta = discPayoff - mean;
    mean += delta / count;
    m2 += delta * (discPayoff - mean);

    // Jalon convergence
    if (nextJalonIdx < jalons.length && count === jalons[nextJalonIdx]) {
      const variance = count > 1 ? m2 / (count - 1) : 0;
      const stdErr = Math.sqrt(variance / count);
      convergenceCurve.push({ n: count, fv: mean, ic: 1.96 * stdErr });
      nextJalonIdx++;
    }

    // Catégorie du path échantillonné
    if (sampleIdx >= 0 && sampleIdx < sampleCount) {
      let cat: 0 | 1 | 2 = 0;
      if (touched && payoff > 0) cat = 2;
      else if (touched && payoff === 0) cat = 1;
      pathCategories[sampleIdx] = cat;
    }
  }

  const variance = count > 1 ? m2 / (count - 1) : 0;
  const stdError = Math.sqrt(variance / count);
  const fairValue = mean;
  const ic95: [number, number] = [fairValue - 1.96 * stdError, fairValue + 1.96 * stdError];

  // Si on n'a pas encore poussé le dernier jalon (count exact)
  if (convergenceCurve.length === 0 || convergenceCurve[convergenceCurve.length - 1]!.n !== count) {
    convergenceCurve.push({ n: count, fv: fairValue, ic: 1.96 * stdError });
  }

  // Histograms
  const payoffHistogram = buildHistogram(payoffs, HIST_BINS, 0);
  const terminalHistogram = buildHistogramTerminal(terminals, HIST_BINS);

  let hitTimeHistogram: McResult['hitTimeHistogram'];
  if (B && hitTimes.length > 0) {
    const ht = Float32Array.from(hitTimes);
    const meanHit = hitTimes.reduce((a, b) => a + b, 0) / hitTimes.length;
    const hist = buildHistogramRange(ht, HIST_BINS, 0, T);
    hitTimeHistogram = { bins: hist.bins, counts: hist.counts, mean: meanHit };
  } else {
    hitTimeHistogram = { bins: [], counts: [], mean: 0 };
  }

  const pathsAtZero = countAtZero(payoffs);

  // Greeks par différences finies centrées (CRN avec même seed)
  const greeksN = Math.max(2000, Math.floor(N / 2));
  const baseLight = { N: greeksN };
  const sBumpUp = runCore({ ...input, ...baseLight, S0: S0 * 1.01 });
  const sBumpDn = runCore({ ...input, ...baseLight, S0: S0 * 0.99 });
  const delta = (sBumpUp.fv - sBumpDn.fv) / (0.02 * S0);

  const sigmaUp = runCore({ ...input, ...baseLight, sigma: sigma + 0.01 });
  const sigmaDn = runCore({ ...input, ...baseLight, sigma: sigma - 0.01 });
  const vega = (sigmaUp.fv - sigmaDn.fv) / 0.02;

  const rUp = runCore({ ...input, ...baseLight, r: r + 0.0001 });
  const rDn = runCore({ ...input, ...baseLight, r: r - 0.0001 });
  const rho_g = (rUp.fv - rDn.fv) / 0.0002;

  const inputHash = await computeInputHash(input);
  const runtimeMs = performance.now() - tStart;

  return {
    fairValue,
    stdError,
    ic95,
    hitRateBarrier: B ? touchedCount / N : 0,
    forfeitedRate: (N - itmCount) / N,
    itmFinalRate: itmCount / N,
    delta,
    vega,
    rho: rho_g,
    pathsSample,
    pathCategories,
    convergenceCurve,
    payoffHistogram: {
      bins: payoffHistogram.bins,
      counts: payoffHistogram.counts,
      pathsAtZero,
    },
    terminalHistogram,
    hitTimeHistogram,
    inputHash,
    runtimeMs,
    engineVersion: ENGINE_VERSION,
  };
}

function computeConvergenceJalons(N: number): number[] {
  const jalons: number[] = [];
  const start = Math.min(100, N);
  const end = N;
  if (end <= start) return [end];
  const logStart = Math.log(start);
  const logEnd = Math.log(end);
  const step = (logEnd - logStart) / (CONVERGENCE_JALONS - 1);
  const seen = new Set<number>();
  for (let i = 0; i < CONVERGENCE_JALONS; i++) {
    const v = Math.round(Math.exp(logStart + i * step));
    if (!seen.has(v) && v <= N) {
      seen.add(v);
      jalons.push(v);
    }
  }
  if (jalons[jalons.length - 1] !== N) jalons.push(N);
  jalons.sort((a, b) => a - b);
  return jalons;
}

function buildHistogram(
  values: Float32Array,
  bins: number,
  min: number,
): { bins: number[]; counts: number[] } {
  let max = min;
  for (let i = 0; i < values.length; i++) {
    if (values[i]! > max) max = values[i]!;
  }
  if (max === min) max = min + 1;
  return buildHistogramRange(values, bins, min, max);
}

function buildHistogramTerminal(
  values: Float32Array,
  bins: number,
): { bins: number[]; counts: number[]; median: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) max = min + 1;
  const hist = buildHistogramRange(values, bins, min, max);
  // Médiane par tri partiel d'une copie
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return { ...hist, median };
}

function buildHistogramRange(
  values: Float32Array,
  bins: number,
  min: number,
  max: number,
): { bins: number[]; counts: number[] } {
  const width = (max - min) / bins;
  const binEdges: number[] = [];
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i <= bins; i++) binEdges.push(min + i * width);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    let idx = Math.floor((v - min) / width);
    if (idx < 0) idx = 0;
    else if (idx >= bins) idx = bins - 1;
    counts[idx]!++;
  }
  return { bins: binEdges, counts };
}

function countAtZero(values: Float32Array): number {
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === 0) c++;
  }
  return c;
}
