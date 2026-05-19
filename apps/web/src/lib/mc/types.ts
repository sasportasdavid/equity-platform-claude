/**
 * Types partagés du moteur Monte Carlo public (PR feat/public-mc-simulator).
 *
 * 100 % client-side. Pas de dépendance Supabase, pas d'I/O. Le moteur
 * remplacera (Phase 5) les mockups statiques de la homepage et de
 * `/produit/valorisation-ifrs2` par un simulateur live et déterministe.
 */

/** Clés des 5 presets V1 supportés par l'engine. */
export type PresetKey = 'psp_barrier' | 'aga_classic' | 'bspce' | 'so_us' | 'tsr_peer';

/**
 * Inputs de simulation. Tous les paramètres sont explicites — pas de
 * valeurs par défaut côté engine (les défauts vivent dans `presets.ts`
 * pour rester transparents au caller).
 *
 * @property S0 prix sous-jacent à t=0 (€)
 * @property K strike du payoff. 0 pour les AGA classiques (action gratuite)
 * @property B niveau de barrière up-and-in (€). null = pas de barrière (vanilla)
 * @property sigma volatilité annualisée (fraction, ex 0.32 pour 32 %)
 * @property r taux sans risque continu (fraction)
 * @property q taux de dividende continu (fraction)
 * @property T maturité en années
 * @property N nombre de paths Monte Carlo
 * @property steps nombre de pas de discrétisation par path
 * @property seed graine PRNG entière (32-bit)
 */
export type McInput = {
  preset: PresetKey;
  S0: number;
  K: number;
  B: number | null;
  sigma: number;
  r: number;
  q: number;
  T: number;
  N: number;
  steps: number;
  seed: number;
};

/** Sortie complète d'une simulation. */
export type McResult = {
  /** Juste valeur estimée = E[exp(-rT) · payoff] */
  fairValue: number;
  /** Erreur standard sur la moyenne (σ / √N) */
  stdError: number;
  /** Intervalle de confiance 95 % autour de fairValue */
  ic95: [number, number];
  /** Fraction de paths ayant touché la barrière (∈ [0, 1]). 0 si pas de barrière. */
  hitRateBarrier: number;
  /** Fraction de paths sans payoff (forfeited). */
  forfeitedRate: number;
  /** Fraction de paths avec payoff > 0 (in-the-money à T). */
  itmFinalRate: number;
  /** Δ (delta) par différence finie centrée sur S0 ± 1 % */
  delta: number;
  /** ν (vega) par différence finie centrée sur σ ± 0.01 */
  vega: number;
  /** ϱ (rho) par différence finie centrée sur r ± 0.0001 */
  rho: number;
  /**
   * 600 paths sub-samplés pour la viz trajectoires.
   * Layout : Float32Array de longueur 600 × (steps+1), row-major
   * (path 0 occupe les indices [0, steps], path 1 occupe [steps+1, 2·(steps)+1], etc.)
   */
  pathsSample: Float32Array;
  /**
   * Catégorie du i-ème path échantillonné (∈ {0,1,2}) :
   *   0 = forfeited (payoff = 0)
   *   1 = hit_otm  (a touché B mais finit OTM, donc payoff = 0 — n'arrive
   *                 que pour les options barrière up-and-in où le strike
   *                 K peut être franchi puis le sous-jacent rechute)
   *   2 = hit_itm  (a touché B et finit ITM avec payoff > 0)
   * Pour les options vanilla (B = null), le code 1 n'est jamais émis.
   */
  pathCategories: Uint8Array;
  /** ~50 jalons espacés en log entre N=100 et N pour visualiser la convergence. */
  convergenceCurve: Array<{ n: number; fv: number; ic: number }>;
  /** Histogramme du payoff actualisé (€). */
  payoffHistogram: { bins: number[]; counts: number[]; pathsAtZero: number };
  /** Histogramme du prix terminal S(T) (€). */
  terminalHistogram: { bins: number[]; counts: number[]; median: number };
  /**
   * Histogramme du temps avant 1ère touche de B (en années).
   * Si l'input n'a pas de barrière (B = null), on retourne
   * `{ bins: [], counts: [], mean: 0 }`.
   */
  hitTimeHistogram: { bins: number[]; counts: number[]; mean: number };
  /** 8 premiers hex chars du SHA-256 d'une sérialisation canonique de l'input. */
  inputHash: string;
  /** Temps de calcul total (ms), incluant les 3 runs greeks. */
  runtimeMs: number;
  /** Version de l'engine (semver-ish), exposée pour audit / replay. */
  engineVersion: string;
  /** N (nombre de paths) du run. Re-exposé ici pour les KPI / audit UI. */
  N: number;
  /** Steps de discrétisation. Permet de calculer dt = T/steps côté UI. */
  steps: number;
};

/**
 * Métadonnées d'un preset (label utilisateur + valeurs par défaut sans
 * preset/seed/N/steps qui sont décidés au caller).
 */
export type PresetSpec = {
  label: string;
  shortLabel: string;
  description: string;
  defaults: Omit<McInput, 'preset' | 'seed' | 'N' | 'steps'>;
};
