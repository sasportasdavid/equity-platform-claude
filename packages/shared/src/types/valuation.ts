/**
 * Module 11 B1 — Types Zod pour valuation Monte Carlo + visualisation.
 *
 * Schémas synchronisés avec l'OpenAPI du moteur Python Fly.io v2.5.0+ :
 *   https://equity-gem-quant-tonnom.fly.dev/openapi.json
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §3.1.
 *
 * Couvre :
 *  - PathSampleMetadata : métadonnées par trajectoire échantillonnée
 *  - VisualizationPayload : bloc viz (paths, convergence, histogram)
 *  - PyMonteCarloResponse : réponse complète du moteur
 *  - RequestValuationRunInput : input Server Action `requestValuationRun`
 *  - ReplayValuationRunInput : input Server Action `replayValuationRun`
 *
 * ⚠️ Le flag `include_visualization` est au TOP-LEVEL de la requête envoyée
 * au moteur (pas dans `config.*`) — vérifié en B0 avec David. Confer la
 * shape `ValuationRequest` côté Pydantic.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. PathSampleMetadata
// ---------------------------------------------------------------------------

/**
 * Métadonnées d'une trajectoire échantillonnée Monte Carlo.
 *
 * `sim_id` est l'index de la simulation dans le batch total ; `paths_sample`
 * (visualisation) ne contient qu'un sous-échantillon mais chaque path échantillonné
 * a son `PathSampleMetadata` avec ces statistiques.
 */
export const pathSampleMetadataSchema = z.object({
  sim_id: z.number().int(),
  final_value: z.number(),
  max_value: z.number(),
  min_value: z.number(),
  final_itm: z.boolean(),
  achieved_vesting: z.boolean(),
  payoff_discounted: z.number(),
});
export type PathSampleMetadata = z.infer<typeof pathSampleMetadataSchema>;

// ---------------------------------------------------------------------------
// 2. VisualizationPayload
// ---------------------------------------------------------------------------

/**
 * Bloc visualisation rempli par le moteur Python quand
 * `include_visualization=true` ET au moins une condition de marché présente
 * (TSR_REL_INDEX, TSR_REL_PEERS).
 *
 * - `paths_sample` : tableau 2D de prix sous-échantillonnés (typiquement
 *   3000 paths × N steps).
 * - `paths_metadata` : métadonnées alignées 1:1 avec `paths_sample`.
 * - `convergence_curve` : ~50 points en log-scale [{ n, fv }] pour vérifier
 *   la convergence du calcul Monte Carlo.
 * - `payoff_histogram` : `{ bins: number[], counts: number[] }` distribution
 *   des payoffs discounted.
 *
 * Côté Capiwise V1, on reste permissif sur la shape exacte de
 * `convergence_curve` et `payoff_histogram` (`z.unknown()` pour les sous-records)
 * car la spec OpenAPI n'est pas figée — tests downstream font le typage strict
 * dans les composants UI (B3+).
 */
export const visualizationPayloadSchema = z.object({
  paths_sample: z.array(z.array(z.number())),
  paths_metadata: z.array(pathSampleMetadataSchema),
  convergence_curve: z.array(z.record(z.string(), z.number())),
  payoff_histogram: z.record(z.string(), z.unknown()),
  sample_size: z.number().int(),
  total_paths: z.number().int(),
  num_steps: z.number().int(),
  sim_T: z.number(),
});
export type VisualizationPayload = z.infer<typeof visualizationPayloadSchema>;

// ---------------------------------------------------------------------------
// 3. PyMonteCarloResponse — réponse complète du moteur
// ---------------------------------------------------------------------------

/**
 * Réponse complète de `POST /compute/multi-tranche`.
 *
 * Champs requis : `fair_value`, `fair_value_per_unit`, `engine_version`,
 * `input_hash`, `execution_time_ms`. Tous les autres champs sont optionnels
 * (selon le mode de pricing : MC vs BS, conditions présentes, flag viz, etc).
 *
 * `visualization` est `optional` (champ absent côté Python si pas demandé) ET
 * `nullable` (le moteur peut renvoyer `null` explicit dans certains cas, ex.
 * fast-path FV=0 — cf dette Python #94 mentionnée dans le briefing B0).
 */
export const pyMonteCarloResponseSchema = z.object({
  fair_value: z.number(),
  fair_value_per_unit: z.number(),
  fair_value_market_only: z.number().optional(),
  std_error: z.number().optional(),
  vesting_probability: z.number().optional(),
  vesting_probability_real: z.number().optional(),
  avg_market_multiplier: z.number().optional(),
  greeks: z.record(z.string(), z.number()).optional(),
  engine_version: z.string(),
  input_hash: z.string(),
  execution_time_ms: z.number(),
  audit_trail: z.unknown().optional(),
  condition_breakdown: z.unknown().optional(),
  tranche_details: z.array(z.unknown()).optional(),
  debug_paths: z.array(z.unknown()).optional(),
  visualization: visualizationPayloadSchema.nullable().optional(),
});
export type PyMonteCarloResponse = z.infer<typeof pyMonteCarloResponseSchema>;

// ---------------------------------------------------------------------------
// 4. Inputs Server Actions (côté Capiwise)
// ---------------------------------------------------------------------------

/**
 * Input pour `requestValuationRun(input)` — déclenche un nouveau calcul.
 *
 * - `includeVisualization` par défaut `true` en V1 (B5+ activera selon
 *   la présence de conditions de marché — pour l'instant flag direct user).
 * - `numPaths` borné à [1_000, 100_000] (cap dur perf moteur).
 * - `numTimeSteps` borné à [12, 365] (mensuel à journalier).
 * - `seed` optionnel : si non fourni, le moteur en génère un (audit reproducible
 *   via `valuation_runs.seed_used`).
 */
export const requestValuationRunSchema = z.object({
  planId: z.string().uuid(),
  includeVisualization: z.boolean().default(true),
  numPaths: z.number().int().min(1000).max(100000).default(100000),
  numTimeSteps: z.number().int().min(12).max(365).default(36),
  seed: z.number().int().optional(),
});
export type RequestValuationRunInput = z.input<typeof requestValuationRunSchema>;

/**
 * Input pour `replayValuationRun(input)` — re-exécute un run existant avec
 * les mêmes paramètres (audit + viz régénérée si manquante).
 */
export const replayValuationRunSchema = z.object({
  runId: z.string().uuid(),
});
export type ReplayValuationRunInput = z.input<typeof replayValuationRunSchema>;

/**
 * Module 11 B2 — Input pour `computeIncrementalFairValue` (résolution dette #11).
 *
 * Calcule le delta de fair value entre un état pre-modification et post-modification
 * d'un award (IFRS 2.27-28). En V1, le caller fournit les 2 `valuation_run_id`
 * déjà calculés (DONE) — la SA orchestre la lecture des résultats + UPDATE des
 * colonnes audit sur `award_modifications`. En V1.5/B5+, une variante de cette
 * SA pourra builder les payloads et appeler le moteur Python directement.
 */
export const computeIncrementalFairValueSchema = z.object({
  modificationId: z.string().uuid(),
  valuationRunIdPre: z.string().uuid(),
  valuationRunIdPost: z.string().uuid(),
});
export type ComputeIncrementalFairValueInput = z.input<typeof computeIncrementalFairValueSchema>;

/**
 * Module 11 B5 — Input pour `listValuationRuns`.
 *
 * Filtres optionnels (multi-critères) + pagination par offset (V1 simple,
 * keyset cursor pour V2 si besoin de gros volumes).
 */
export const listValuationRunsSchema = z.object({
  planId: z.string().uuid().optional(),
  status: z.enum(['QUEUED', 'RUNNING', 'DONE', 'ERROR']).optional(),
  runType: z
    .enum(['MANUAL', 'CRON_MONTHLY', 'CRON_STALE_REFRESH', 'TRIGGERED_BY_MODIFICATION', 'REPLAY'])
    .optional(),
  includesVisualization: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListValuationRunsInput = z.input<typeof listValuationRunsSchema>;
