/**
 * Module 11 B3 — Fixtures pour la sandbox `/dev/monte-carlo-replay`.
 *
 * Données synthétiques mais réalistes pour tester les composants viewer
 * sans appeler le moteur Python (auth + CORS + perfs). Les fixtures
 * suivent la shape exacte du `VisualizationPayload` (cf @equity/shared
 * types/valuation).
 *
 * 4 presets :
 *   1. PSP barrière 75 €  (TSR_REL_INDEX, barrière 75 €)
 *   2. BSPCE simple       (option vanilla, pas de condition de marché)
 *   3. AGA TSR              (action gratuite, condition TSR)
 *   4. Peer group          (TSR_REL_PEERS, multi-tickers)
 *
 * V1.5/B5 : remplacer par de vrais runs déclenchés via Server Action +
 * EF compute-valuation.
 */

import type { PathSampleMetadata, VisualizationPayload } from '@equity/shared';
import type { ParametersCardProps } from './ParametersCard';

/**
 * Génère un GBM path (Geometric Brownian Motion) déterministe via une
 * mulberry32 seed-based PRNG. Reproductible et donc safe à tester.
 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMuller(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generatePath(
  S0: number,
  r: number,
  sigma: number,
  T: number,
  steps: number,
  rng: () => number,
): number[] {
  const dt = T / steps;
  const drift = (r - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);
  const path: number[] = [S0];
  let s = S0;
  for (let i = 1; i <= steps; i++) {
    const z = boxMuller(rng);
    s = s * Math.exp(drift + diffusion * z);
    path.push(s);
  }
  return path;
}

function metadataFromPath(
  simId: number,
  path: number[],
  barrier: number | undefined,
  strike: number,
): PathSampleMetadata {
  let max = -Infinity;
  let min = Infinity;
  let touched = false;
  for (const v of path) {
    if (v > max) max = v;
    if (v < min) min = v;
    if (barrier !== undefined && v >= barrier) touched = true;
  }
  const final = path[path.length - 1] ?? 0;
  const final_itm = final >= strike;
  const achieved_vesting = barrier === undefined ? final_itm : touched;
  const payoff_discounted = achieved_vesting && final_itm ? Math.max(0, final - strike) : 0;
  return {
    sim_id: simId,
    final_value: final,
    max_value: max,
    min_value: min,
    final_itm,
    achieved_vesting,
    payoff_discounted,
  };
}

export type Preset = {
  id: string;
  name: string;
  description: string;
  inputs: ParametersCardProps;
  /** Used to generate synthetic visualization */
  numStepsTotal: number;
  pathsToSample: number;
};

export const PRESETS: Preset[] = [
  {
    id: 'psp-barrier-75',
    name: 'PSP barrière 75 €',
    description: 'Performance Share Plan avec condition TSR_REL_INDEX. Barrière à 75 €, T=3,5 ans.',
    inputs: {
      S0: 50,
      K: 50,
      barrier: 75,
      sigma: 0.32,
      r: 0.032,
      T: 3.5,
      numPaths: 100_000,
      currency: 'EUR',
    },
    numStepsTotal: 36,
    pathsToSample: 600,
  },
  {
    id: 'bspce-simple',
    name: 'BSPCE simple',
    description: 'Option vanilla European. K=18 €, T=4 ans, σ=28 %. Pas de condition de marché.',
    inputs: {
      S0: 18,
      K: 18,
      sigma: 0.28,
      r: 0.025,
      T: 4,
      numPaths: 50_000,
      currency: 'EUR',
    },
    numStepsTotal: 48,
    pathsToSample: 500,
  },
  {
    id: 'aga-tsr',
    name: 'AGA TSR rel CAC 40',
    description: 'Action gratuite avec condition TSR. T=2,5 ans, σ=24 %, barrière 110.',
    inputs: {
      S0: 100,
      K: 0, // AGA = action gratuite, pas de strike
      barrier: 110,
      sigma: 0.24,
      r: 0.03,
      T: 2.5,
      numPaths: 100_000,
      currency: 'EUR',
    },
    numStepsTotal: 30,
    pathsToSample: 700,
  },
  {
    id: 'peer-group',
    name: 'Peer group TSR (5 tickers)',
    description: 'TSR_REL_PEERS multi-tickers. Médiane peers comme barrière. σ=30 %.',
    inputs: {
      S0: 65,
      K: 65,
      barrier: 90,
      sigma: 0.3,
      r: 0.035,
      T: 3,
      numPaths: 100_000,
      currency: 'EUR',
    },
    numStepsTotal: 36,
    pathsToSample: 800,
  },
];

/**
 * Génère un VisualizationPayload synthétique pour un preset donné.
 * Tous les paths suivent un GBM seed-based pour reproducibilité.
 */
export function generateFixture(preset: Preset): {
  visualization: VisualizationPayload;
  fairValuePerUnit: number;
  stdError: number;
  greeks: Record<string, number>;
  inputHash: string;
  engineVersion: string;
  executionTimeMs: number;
  seed: number;
} {
  const seed = 42;
  const rng = mulberry32(seed);
  const { S0, sigma, r, T, K, barrier } = preset.inputs;
  const steps = preset.numStepsTotal;

  const paths: number[][] = [];
  const metadata: PathSampleMetadata[] = [];
  let payoffSum = 0;
  let payoffSqSum = 0;

  for (let i = 0; i < preset.pathsToSample; i++) {
    const path = generatePath(S0, r, sigma, T, steps, rng);
    paths.push(path);
    const meta = metadataFromPath(i, path, barrier, K);
    metadata.push(meta);
    payoffSum += meta.payoff_discounted;
    payoffSqSum += meta.payoff_discounted * meta.payoff_discounted;
  }

  const n = paths.length;
  const meanPayoff = payoffSum / n;
  const variance = Math.max(0, payoffSqSum / n - meanPayoff * meanPayoff);
  const fairValuePerUnit = meanPayoff * Math.exp(-r * T);
  const stdError = Math.sqrt(variance / n);

  // Convergence curve : ~30 points en log-scale
  const convergence_curve: Array<Record<string, number>> = [];
  const minN = Math.max(50, Math.floor(n / 100));
  const ratio = Math.pow(n / minN, 1 / 30);
  for (let nn = minN; nn <= n; nn = Math.ceil(nn * ratio)) {
    const cum = metadata.slice(0, nn).reduce((sum, m) => sum + m.payoff_discounted, 0);
    convergence_curve.push({ n: nn, fv: (cum / nn) * Math.exp(-r * T) });
  }

  // Payoff histogram : 30 bins de 0 à max payoff
  const payoffs = metadata.map((m) => m.payoff_discounted);
  const maxPayoff = Math.max(...payoffs, 1);
  const numBins = 30;
  const binSize = maxPayoff / numBins;
  const counts = new Array<number>(numBins).fill(0);
  const bins: number[] = [];
  for (let i = 0; i <= numBins; i++) bins.push(i * binSize);
  for (const p of payoffs) {
    const idx = Math.min(numBins - 1, Math.floor(p / binSize));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }

  const visualization: VisualizationPayload = {
    paths_sample: paths,
    paths_metadata: metadata,
    convergence_curve,
    payoff_histogram: { bins, counts },
    sample_size: paths.length,
    total_paths: preset.inputs.numPaths,
    num_steps: steps,
    sim_T: T,
  };

  return {
    visualization,
    fairValuePerUnit,
    stdError,
    greeks: {
      delta: 0.4231,
      gamma: 0.0123,
      vega: 19.5,
      theta: -2.1,
      rho: 8.7,
    },
    inputHash: `0x${preset.id.replace(/-/g, '').slice(0, 12)}fixture`,
    engineVersion: '2.5.0-fixture',
    executionTimeMs: 1234 + Math.floor(rng() * 1000),
    seed,
  };
}
