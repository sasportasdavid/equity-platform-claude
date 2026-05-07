/**
 * Sensibilités — courbe FV vs paramètre, allégée pour vitesse
 * (8k paths × steps=40 par point, 30 points par axe).
 *
 * Utilisée par les charts "Sensibilité Barrière" et "Sensibilité
 * Volatilité" du viewer Phase 2.
 */

import { createGaussian } from './gaussian';
import { createPcg32 } from './prng';
import type { McInput } from './types';

const SENS_N = 8_000;
const SENS_STEPS = 40;
const SENS_POINTS = 30;
const SENS_RANGES = {
  B: { min: 55, max: 120 },
  sigma: { min: 0.1, max: 0.6 },
} as const;

export type SensitivityPoint = { x: number; fv: number };

function runLightCore(input: McInput): number {
  const { S0, K, B, sigma, r, q, T, N, steps, seed, preset } = input;
  const dt = T / steps;
  const drift = (r - q - 0.5 * sigma * sigma) * dt;
  const volStep = sigma * Math.sqrt(dt);
  const discount = Math.exp(-r * T);
  const isTsr = preset === 'tsr_peer';
  const rho = 0.5;
  const peerVolFactor = Math.sqrt(1 - rho * rho);

  const prng = createPcg32(seed);
  const gauss = createGaussian(prng);
  let sum = 0;
  for (let n = 0; n < N; n++) {
    let s = S0;
    let sPeer = isTsr ? S0 : 0;
    let touched = !B;
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
