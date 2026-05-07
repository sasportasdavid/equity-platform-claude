/**
 * 5 presets V1 du simulateur public IFRS 2.
 *
 * Chaque preset = 1 famille de plan d'actionnariat salarié + paramètres
 * pré-calibrés (S0/K/B/σ/r/q/T) qui produisent un FV "raisonnable".
 *
 * V1 = European-only (Black-Scholes / Monte Carlo). L'arbre binomial
 * pour SO US et la corrélation multi-asset complète pour TSR sont
 * reportés V2.
 */

import type { McInput, PresetKey, PresetSpec } from './types';

export const PRESETS: Record<PresetKey, PresetSpec> = {
  psp_barrier: {
    label: 'Performance Share Plan · barrière de cours',
    shortLabel: 'PSP barrière',
    description:
      'Plan d’actions de performance avec déclenchement conditionné au franchissement d’une barrière haute (up-and-in).',
    defaults: { S0: 50, K: 50, B: 75, sigma: 0.32, r: 0.032, q: 0, T: 3.5 },
  },
  aga_classic: {
    label: 'AGA classique · sans condition de marché',
    shortLabel: 'AGA classique',
    description:
      'Attribution gratuite d’actions vesting linéaire, pas de barrière. La fair value se rapproche du spot moins dividendes actualisés.',
    defaults: { S0: 50, K: 0, B: null, sigma: 0.3, r: 0.032, q: 0.015, T: 3 },
  },
  bspce: {
    label: 'BSPCE · call vanille',
    shortLabel: 'BSPCE',
    description:
      'Bons de souscription startup. Call vanille européen sur la fair value de l’action.',
    defaults: { S0: 12, K: 12, B: null, sigma: 0.55, r: 0.032, q: 0, T: 5 },
  },
  so_us: {
    label: 'Stock Options · approximation européenne',
    shortLabel: 'Stock Options',
    description:
      'Stock options US classiques. V1 : approximation européenne (l’exercice anticipé sera ajouté en V2 via arbre binomial).',
    defaults: { S0: 100, K: 100, B: null, sigma: 0.28, r: 0.032, q: 0.012, T: 7 },
  },
  tsr_peer: {
    label: 'TSR · performance relative vs panier',
    shortLabel: 'TSR peer',
    description:
      'Total Shareholder Return relatif. Payoff conditionnel à dépasser un panier de pairs corrélé. V1 : un seul peer GBM corrélé ρ=0.5 (multi-asset complet en V2).',
    defaults: { S0: 100, K: 100, B: null, sigma: 0.3, r: 0.032, q: 0.02, T: 3 },
  },
};

/**
 * Helper : construit un `McInput` complet à partir du preset + overrides
 * (utile dans les tests et pour l'UI Phase 2).
 */
export function buildInput(
  preset: PresetKey,
  overrides: Partial<
    Pick<McInput, 'S0' | 'K' | 'B' | 'sigma' | 'r' | 'q' | 'T' | 'N' | 'steps' | 'seed'>
  > = {},
): McInput {
  const spec = PRESETS[preset];
  return {
    preset,
    S0: overrides.S0 ?? spec.defaults.S0,
    K: overrides.K ?? spec.defaults.K,
    B: overrides.B === undefined ? spec.defaults.B : overrides.B,
    sigma: overrides.sigma ?? spec.defaults.sigma,
    r: overrides.r ?? spec.defaults.r,
    q: overrides.q ?? spec.defaults.q,
    T: overrides.T ?? spec.defaults.T,
    N: overrides.N ?? 60_000,
    // Phase 1.5 : default abaissé de 60 à 40 (FV delta < 1 % vs 60
    // sur psp_barrier, et < 0,1 % sur les vanilles). Économise ~33 %
    // du compute. Le caller peut toujours forcer steps=60 via override
    // pour les barrières exotiques où la résolution temporelle compte.
    steps: overrides.steps ?? 40,
    seed: overrides.seed ?? 42,
  };
}
