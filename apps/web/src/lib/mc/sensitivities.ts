/**
 * Sensibilités — courbe FV vs paramètre, allégée pour vitesse
 * (8k paths × steps=40 par point, 30 points par axe).
 *
 * Utilisée par les charts "Sensibilité Barrière" et "Sensibilité
 * Volatilité" du viewer Phase 2.
 */

import { createPcg32, type Pcg32 } from './prng';
import type { McInput } from './types';

const SENS_N = 8_000;
const SENS_STEPS = 40;
const SENS_POINTS = 30;
const SENS_RANGES = {
  B: { min: 55, max: 120 },
  sigma: { min: 0.1, max: 0.6 },
} as const;

export type SensitivityPoint = { x: number; fv: number };

/** Box-Muller polaire inliné — partagé avec engine.ts via copy. */
function gaussInline(prng: Pcg32, cache: { v: number | null }): number {
  if (cache.v !== null) {
    const out = cache.v;
    cache.v = null;
    return out;
  }
  let u1: number;
  let u2: number;
  let s: number;
  do {
    u1 = prng.nextFloat01() * 2 - 1;
    u2 = prng.nextFloat01() * 2 - 1;
    s = u1 * u1 + u2 * u2;
  } while (s >= 1 || s === 0);
  const factor = Math.sqrt((-2 * Math.log(s)) / s);
  cache.v = u2 * factor;
  return u1 * factor;
}

function runLightCore(input: McInput): number {
  const { S0, K, B, sigma, r, q, T, N, steps, seed, preset } = input;
  const dt = T / steps;
  const drift = (r - q - 0.5 * sigma * sigma) * dt;
  const volStep = sigma * Math.sqrt(dt);
  const discount = Math.exp(-r * T);
  const hasBarrier = B !== null;
  const logBarrier = hasBarrier ? Math.log(B / S0) : 0;
  const isTsr = preset === 'tsr_peer';
  const rho = 0.5;
  const peerVolFactor = Math.sqrt(1 - rho * rho);

  const prng = createPcg32(seed);
  const cache = { v: null as number | null };
  let sum = 0;
  for (let n = 0; n < N; n++) {
    let cumLog = 0;
    let cumLogPeer = 0;
    let touched = !hasBarrier;
    for (let t = 0; t < steps; t++) {
      const z = gaussInline(prng, cache);
      cumLog += drift + volStep * z;
      if (hasBarrier && !touched && cumLog >= logBarrier) touched = true;
      if (isTsr) {
        const z2 = gaussInline(prng, cache);
        const zPeer = rho * z + peerVolFactor * z2;
        cumLogPeer += drift + volStep * zPeer;
      }
    }
    const s = S0 * Math.exp(cumLog);
    let payoff = touched ? Math.max(s - K, 0) : 0;
    if (isTsr && payoff > 0) {
      const sPeer = S0 * Math.exp(cumLogPeer);
      if (sPeer >= s) payoff = 0;
    }
    sum += discount * payoff;
  }
  return sum / N;
}

/**
 * Renvoie 30 points (x, fv) pour visualiser la sensibilité de la FV à
 * l'axe choisi. Si `axis === 'B'` mais l'input n'a pas de barrière
 * (B === null), retourne `[]`.
 */
export function runSensitivities(baseInput: McInput, axis: 'B' | 'sigma'): SensitivityPoint[] {
  if (axis === 'B' && baseInput.B === null) return [];
  const range = SENS_RANGES[axis];
  const lightInput: McInput = {
    ...baseInput,
    N: SENS_N,
    steps: SENS_STEPS,
  };
  const points: SensitivityPoint[] = [];
  for (let i = 0; i < SENS_POINTS; i++) {
    const x = range.min + (i * (range.max - range.min)) / (SENS_POINTS - 1);
    const bumped: McInput = axis === 'B' ? { ...lightInput, B: x } : { ...lightInput, sigma: x };
    points.push({ x, fv: runLightCore(bumped) });
  }
  return points;
}
