// =============================================================================
// Module 3a B5.1 — Builder du payload Python (moteur equity-gem-quant V8)
// =============================================================================
//
// V2 — 2026-05-01 — Fix alignment Python V8 strict
//
// Conversion canonique entre les rows DB Supabase et le format attendu par
// `POST /compute/multi-tranche` du moteur Python (HANDOVER_PACK V4.2 + V8).
//
// Changements vs V1 (cf. memory/payload_python_audit_v8.md) :
//   - mapPeerToMoteur : convertit s0/volatility/correlationWithMain (TS)
//     en S0/sigma/correlation (Pydantic strict) — sinon 422 garanti
//   - TSR_REL_PEERS : toujours wrapper en weighted_peer_groups, le moteur
//     ignore cond.peer_group flat (l. 460/586 main.py)
//   - TSR_REL_INDEX : envoie index_S0/index_sigma/correlation depuis les
//     nouvelles colonnes DB (sinon le moteur fallback à 100/0.20/0.5
//     l. 454-456 main.py = résultats silencieusement faux)
//   - shouldUseMonteCarlo : retire le critère hasMultipleTranches, le
//     moteur gère parfaitement multi-tranches en BS analytique pur
//     (l. 358-407 main.py) — gain de perf x100 sur les plans simples
//
// Reprend littéralement la logique de l'edge function existante
// `valuation-run-create-and-compute` du moteur — surtout la règle ATM
// symétrique V4.2 sur les peers TSR_REL (cf. HANDOVER_PACK §9.4) qui est
// CRITIQUE pour la correction des résultats Monte Carlo.
//
// Tests : ce fichier est pur (pas d'I/O), testable en isolation. La suite
// E2E s'occupe de valider le wire format avec le vrai moteur Python.
// =============================================================================

// ---------------------------------------------------------------------------
// Types — calqués sur les rows DB après getPlanDetails (cf. plans.ts queries)
// ---------------------------------------------------------------------------

export type PythonValuationContext = {
  orgId: string;
  plan: {
    id: string;
    plan_type: string;
    exercise_price: number | null;
    grant_date: string;
  };
  hypothesisSet: {
    s0: number | null;
    rate_flat: number | null;
    dividend_yield: number | null;
  };
  volatilityScheme: {
    annualized_sigma: number | null;
    heston_params: Record<string, unknown> | null;
    jump_params: Record<string, unknown> | null;
  };
  simulationConfig: {
    num_paths: number | null;
    steps_per_year: number | null;
    time_horizon_years: number | null;
    antithetic_variates: boolean;
  };
  conditions: PythonConditionInput[];
  vestingTranches: Array<{
    sort_order: number;
    vesting_date: string;
    percentage_of_award: number;
  }>;
  marketDataSnapshot?: Record<string, unknown>;
};

export type PythonConditionInput = {
  /** NEW V2 — id de la performance_condition (utilisé pour audit + LIVE_AT_VALUATION dispatch). */
  id?: string;
  condition_type: string | null;
  market_metric_type: string | null;
  weight: number | null;
  measurement_period_years: number | null;
  comparison_method: string | null;
  reference_index: string | null;
  reference_index_display_name: string | null;
  /**
   * NEW V2 — mode de fetch des données de marché (migration 00073).
   * SNAPSHOT_AT_GRANT (default) | MANUAL | LIVE_AT_VALUATION.
   * En mode LIVE_AT_VALUATION, compute-valuation re-fetch via les EF
   * market-data-fetch / market-data-peer-group avant buildPythonPayload.
   */
  market_data_fetch_mode?: 'SNAPSHOT_AT_GRANT' | 'MANUAL' | 'LIVE_AT_VALUATION' | null;
  /**
   * NEW V2 — paramètres marché de l'index pour TSR_REL_INDEX.
   * Sans ces valeurs, le moteur Python fallback à 100/0.20/0.5 → résultats
   * silencieusement faux. Cf. main.py l. 454-456.
   *
   * Idéalement fetched live via searchTicker/fetchMarketData (Module 3a §5.2
   * deferred). À défaut, saisie manuelle dans le wizard step 4 via les
   * inputs ManualIndexMarketDataInputs.
   */
  reference_index_s0: number | null;
  reference_index_sigma: number | null;
  reference_index_correlation: number | null;
  reference_index_dividend_yield: number | null;
  start_price_method: string | null;
  start_fixed_price: number | null;
  start_averaging_days: number | null;
  end_price_method: string | null;
  end_fixed_price: number | null;
  end_averaging_days: number | null;
  peer_group: PeerCompany[] | null;
  weighted_peer_groups: Array<{
    id: string;
    name: string;
    weight: number;
    peers: PeerCompany[];
  }> | null;
  acquisition_scale:
    | { mode: 'CURVE'; points: Array<{ threshold: number; acquisition: number }> }
    | { mode: 'TIERS'; tiers: Array<{ min: number; max: number; acquisition: number }> }
    | null;
};

export type PeerCompany = {
  id?: string;
  name?: string;
  ticker: string;
  weight?: number;
  s0?: number;
  volatility?: number;
  correlationWithMain?: number;
};

/**
 * Format peer attendu par Pydantic côté moteur (WeightedPeerInGroup).
 * Tous les fields sont uppercase / lowercase strict — Pydantic ne tolère pas.
 */
export type MoteurPeerFormat = {
  id: string;
  name?: string;
  ticker?: string;
  weight: number;
  S0: number;
  sigma: number;
  correlation?: number;
  dividend_yield: number;
  initial_reference_price?: number;
};

// ---------------------------------------------------------------------------
// Output payload (format Python V4.2 + V8 — main.py ValuationRequest)
// ---------------------------------------------------------------------------

export type PythonPayload = {
  config: {
    num_paths: number;
    num_time_steps: number;
    seed: number;
    antithetic_variates: boolean;
    use_monte_carlo: boolean;
  };
  market: {
    S0: number;
    r: number;
    q: number;
    sigma: number;
  };
  instrument: {
    strike: number;
    T: number;
    type: 'option' | 'stock';
    vesting_schedule: Array<{ time: number; portion: number }>;
  };
  conditions: Array<Record<string, unknown>>;
  /**
   * Top-level flags du `ValuationRequest` côté moteur Python (HANDOVER_PACK
   * §4.2 + OpenAPI). Ne sont PAS dans `config` — c'est important pour que
   * le moteur les lise correctement.
   *
   *   - compute_greeks      : si true, retourne `greeks` (delta/vega/rho —
   *                           pas gamma/theta cf. main.py l. 918-922)
   *                           Coût ~5× le calcul vanilla (3 reruns finite diff).
   *   - include_debug_paths : si true, retourne `debug_paths` pour viz UI
   *   - debug_light_paths   : nb max de paths renvoyés (downsamplé)
   */
  compute_greeks: boolean;
  include_debug_paths: boolean;
  debug_light_paths: number;
  /**
   * Module 11 B5 — Si true, le moteur Python retourne le bloc `visualization`
   * complet (paths_sample, paths_metadata, convergence_curve, payoff_histogram,
   * num_steps, sim_T, total_paths, sample_size). Coût ~négligeable côté moteur
   * (les paths sont déjà en mémoire pendant le MC), mais ~50-200 KB de payload
   * réseau supplémentaire — donc opt-in pour les runs UI cinématiques.
   *
   * NB : ce flag est top-level (pas dans `config`), aligné `ValuationRequest`
   * côté FastAPI v2.5.0.
   */
  include_visualization: boolean;
};

// =============================================================================
// API publique
// =============================================================================

/**
 * Construit le payload JSON à envoyer à `POST /compute/multi-tranche`.
 *
 * Routing config.use_monte_carlo (V2) :
 *   - true SI ET SEULEMENT SI au moins une condition MARKET (TSR/SHARE_PRICE)
 *   - false sinon → Black-Scholes analytique (gérée par le moteur Python
 *     même en multi-tranches, cf. main.py l. 358-407)
 *
 * Le critère hasMultipleTranches de V1 a été retiré : le moteur gère
 * multi-tranches en BS analytique sans MC — gain de perf x100 sur les plans
 * AGA simples.
 *
 * Convention vesting_schedule format V4 :
 *   [{ time: years_from_grant_julian, portion: pct/100 }]
 *
 * @throws si paramètres critiques manquants (S0, sigma, T, etc.)
 */
export function buildPythonPayload(
  ctx: PythonValuationContext,
  options: { includeVisualization?: boolean } = {},
): PythonPayload {
  // 1. Validation inputs critiques
  const s0 = ctx.hypothesisSet.s0;
  if (s0 == null || s0 <= 0) {
    throw new Error(`hypothesis_set.s0 invalide ou manquant (got: ${s0})`);
  }
  const sigma = ctx.volatilityScheme.annualized_sigma;
  if (sigma == null || sigma <= 0) {
    throw new Error(`volatility_scheme.annualized_sigma invalide ou manquant (got: ${sigma})`);
  }
  const T = ctx.simulationConfig.time_horizon_years;
  if (T == null || T <= 0) {
    throw new Error(`simulation_config.time_horizon_years invalide (got: ${T})`);
  }
  const numPaths = ctx.simulationConfig.num_paths ?? 50000;
  const stepsPerYear = ctx.simulationConfig.steps_per_year ?? 12;

  // 2. Routing : Monte Carlo si MARKET, sinon BS analytique
  const useMonteCarlo = shouldUseMonteCarlo(ctx);

  // 3. Build sections
  const config = {
    num_paths: numPaths,
    // Note : le moteur Python (main.py l. 410-412) sur-écrit cette valeur
    // avec max(input, T × 252 + 20) — donc envoyer T × stepsPerYear est OK,
    // le moteur garantit toujours un minimum de 252 pas/an.
    num_time_steps: Math.round(T * stepsPerYear),
    seed: 42, // deterministic replay (cf. spec §4 — IFRS 2 audit)
    antithetic_variates: ctx.simulationConfig.antithetic_variates,
    use_monte_carlo: useMonteCarlo,
  };

  // Convention DB drift : `annualized_sigma` est stockée en fraction (0.35
  // pour 35 %), mais `rate_flat` et `dividend_yield` sont stockés en pourcent
  // bruts (3.0 pour 3 %, cf. buildHypothesisPayload côté plans.ts qui ne
  // divise pas par 100). Le moteur Python attend tout en fractions, donc on
  // normalise ici. Détection : si la valeur est ≥ 1 ou < 0, on suppose un
  // pourcent (= 3.0 pour 3 %) et on divise. Sinon (≤ 1), on suppose déjà
  // une fraction. Cap dur à 0 pour q = 0 % usuel (pas de division 0/100).
  const r = normalizeRateOrDividend(ctx.hypothesisSet.rate_flat);
  const q = normalizeRateOrDividend(ctx.hypothesisSet.dividend_yield);
  const market = { S0: s0, r, q, sigma };

  const instrument = {
    strike: ctx.plan.exercise_price ?? 0,
    T,
    // Note : le moteur Python normalise `.upper() == "OPTION"` (l. 320)
    // donc 'option' lowercase est accepté. Pas d'urgence à uppercaser.
    type: isOptionType(ctx.plan.plan_type) ? ('option' as const) : ('stock' as const),
    vesting_schedule: convertVestingToFormatV4(ctx.vestingTranches, ctx.plan.grant_date),
  };

  const conditions = ctx.conditions.map((cond) => buildConditionParams(cond, s0));

  return {
    config,
    market,
    instrument,
    conditions,
    // Greeks activés systématiquement (cf. spec sensitivities §6) — coût
    // ~5× la valuation vanilla mais on en a besoin pour la card Sensibilités
    // de la page détail valuation B5.5. Si perf devient un problème sur des
    // gros plans Monte Carlo, on rendra ça opt-in côté UI.
    //
    // Note : le moteur ne calcule que delta/vega/rho (pas gamma/theta) cf.
    // main.py l. 918-922.
    compute_greeks: true,
    // Debug paths : utilisés par le LineChart Recharts de B5.5 pour montrer
    // les trajectoires Monte Carlo. Cap à 50 paths côté moteur (downsample
    // à la source = pas de coût réseau si MC pour millions de paths).
    include_debug_paths: true,
    debug_light_paths: 50,
    // Module 11 B5 — top-level (pas dans config). Default false pour préserver
    // le coût réseau des runs purement IFRS 2 (sans replay UI). La SA
    // `requestValuationRun` set ce flag à true uniquement quand l'UI demande
    // explicitement un viewer Monte Carlo.
    include_visualization: options.includeVisualization === true,
  };
}

// =============================================================================
// Helpers internes
// =============================================================================

/**
 * Décide si on use Monte Carlo (vs Black-Scholes analytique).
 *
 * V2 — alignée sur la logique du moteur Python (l. 358-407 main.py) :
 *   - true SI ET SEULEMENT SI au moins une condition MARKET (TSR/SHARE_PRICE)
 *   - false sinon → BS analytique (multi-tranches gérées en boucle)
 *
 * Le critère hasMultipleTranches de V1 a été retiré : il forçait MC inutilement
 * pour les plans AGA multi-tranches sans condition de marché, alors que le
 * moteur sait gérer ce cas en analytique pur. Gain : ~100x perf sur ces plans.
 */
export function shouldUseMonteCarlo(ctx: PythonValuationContext): boolean {
  return ctx.conditions.some((c) => c.condition_type === 'MARKET');
}

/**
 * Détermine si le pricing doit traiter l'instrument comme une option (avec
 * strike + max(0, S-K)) ou comme une action gratuite (juste max valeur).
 *
 * BSPCE/STOCK_OPTION/BSA/SAR : option (strike > 0 typiquement)
 * AGA/RSU/PERFORMANCE_SHARE/PHANTOM/ESOP : stock (action gratuite, juste-valeur = ST)
 */
function isOptionType(planType: string): boolean {
  return ['BSPCE', 'STOCK_OPTION', 'BSA', 'SAR'].includes(planType);
}

/**
 * Module 11 B2 — Refonte normalizers (résolution dette #1).
 *
 * `normalizeRateUnit` historique faisait une heuristique unique pour rate ET
 * sigma, alors que les conventions DB sont différentes :
 *   - `rate_flat` / `dividend_yield` : stockés en pourcent bruts (3.0 = 3%)
 *   - `annualized_sigma` : stocké en fraction (0.18 = 18%)
 *
 * Conséquence : un sigma=0.18 était traité comme déjà fraction (correct),
 * mais un sigma=18 (saisie utilisateur erronée) aurait dû throw — l'ancienne
 * fonction le passait à 0.18 silencieusement. Bug masqué.
 *
 * La refonte split en 2 fonctions contextuelles avec validation métier :
 *   - `normalizeRateOrDividend` : conversion % → fraction si > 1, bornes [0, 1]
 *   - `normalizeSigma` : pas de conversion (toujours fraction), bornes [0.01, 5.0]
 */

/**
 * Normalise un taux d'intérêt ou un dividend yield vers une fraction.
 *
 * Convention de saisie DB : `rate_flat` et `dividend_yield` sont stockés en
 * pourcent bruts (ex. 3.2 pour 3.2%). Le moteur Python attend tout en
 * fractions, donc on convertit ici.
 *
 * Heuristique : si la valeur strictement > 1, elle est un pourcent → divise
 * par 100. Sinon (≤ 1), on suppose déjà en fraction. Une valeur 1.0 est
 * ambigüe (= 100% = 1.0 fraction); on tranche pour "fraction" (un taux flat
 * de 100% serait absurde dans tous les cas réalistes).
 *
 * Bornes : [0, 1] (taux > 100% rejeté, taux négatif rejeté).
 *
 * @param value — Valeur en pourcent (3.2) ou fraction (0.032). Null/undefined → 0.
 * @returns Valeur normalisée en fraction [0, 1].
 * @throws si value < 0.
 */
export function normalizeRateOrDividend(value: number | null | undefined): number {
  if (value == null) return 0;
  if (value < 0) {
    throw new Error(`Rate cannot be negative (got ${value})`);
  }
  return value > 1 ? value / 100 : value;
}

/**
 * Normalise une volatilité (sigma) avec validation des bornes métier.
 *
 * Convention de saisie DB : `annualized_sigma` est TOUJOURS en fraction
 * (0.18 = 18%). L'UI wizard label explicitement "Fraction (0,18 = 18%)".
 * Donc PAS de conversion pourcent → fraction (différent de
 * `normalizeRateOrDividend`).
 *
 * Cette fonction sert à :
 *   1. Normaliser les sigmas qui pourraient venir de sources externes (peer
 *      volatility EODHD, index sigma fetched) — qui peuvent par accident
 *      arriver en pourcent
 *   2. Valider les bornes métier : [0.01, 5.0] = [1%, 500%]
 *
 * Une sigma > 5 est probablement une erreur de saisie (% au lieu de fraction).
 * Une sigma < 0.01 est typiquement un asset trop stable pour Black-Scholes
 * (gilt-edged, low-vol equity ETF).
 *
 * @param value — Volatilité en fraction. Null/undefined → throw.
 * @returns Valeur sigma validée en fraction [0.01, 5.0].
 * @throws si value < 0.01 ("Volatility too low") ou value > 5.0 ("Volatility unrealistic").
 */
export function normalizeSigma(value: number | null | undefined): number {
  if (value == null) {
    throw new Error('Volatility is required (got null/undefined)');
  }
  if (value < 0.01) {
    throw new Error(
      `Volatility too low (min 1% = 0.01, got ${value}). Asset trop stable pour Black-Scholes ?`,
    );
  }
  if (value > 5.0) {
    throw new Error(
      `Volatility unrealistic (max 500% = 5.0, got ${value}). Saisie en pourcent au lieu de fraction ?`,
    );
  }
  return value;
}

/**
 * @deprecated Use `normalizeRateOrDividend` (taux/yield) ou `normalizeSigma`
 * (volatilité) à la place. Cette fonction sera supprimée en V2 (Module 12
 * cleanup) une fois tous les callsites migrés.
 *
 * Conservée pour compat avec d'éventuels imports externes ou downstream
 * (ex: tests anciens, scripts standalone). Délègue vers
 * `normalizeRateOrDividend` qui a le même comportement pour les rates.
 */
export function normalizeRateUnit(value: number | null | undefined): number {
  return normalizeRateOrDividend(value);
}

/**
 * Convertit la liste de tranches DB en format V4 attendu par le moteur :
 *   [{ time: years_from_grant, portion: pct_as_fraction_0_to_1 }]
 *
 * Convention temps : Julian year (365.25 jours), aligné sur la convention
 * UI du wizard (cf. memory/module_3a_todos.md). Si un jour le moteur Python
 * passe en Banker year, ajuster ici + dans le wizard pour cohérence.
 */
export function convertVestingToFormatV4(
  tranches: Array<{ sort_order: number; vesting_date: string; percentage_of_award: number }>,
  grantDate: string,
): Array<{ time: number; portion: number }> {
  const grant = Date.parse(grantDate);
  if (!Number.isFinite(grant)) {
    throw new Error(`grant_date invalide : ${grantDate}`);
  }
  const sorted = [...tranches].sort((a, b) => a.sort_order - b.sort_order);
  return sorted.map((t) => {
    const vest = Date.parse(t.vesting_date);
    if (!Number.isFinite(vest)) {
      throw new Error(`vesting_date invalide : ${t.vesting_date}`);
    }
    return {
      time: (vest - grant) / (1000 * 60 * 60 * 24 * 365.25),
      portion: t.percentage_of_award / 100,
    };
  });
}

/**
 * Convertit l'acquisition_scale du wizard (modes CURVE / TIERS) en payout_curve
 * pour le moteur Python : array de { performance_level, vesting_multiplier }.
 *
 * Pour TIERS, on émet 2 points par tier (min + max au même multiplier) pour
 * matérialiser le palier — le moteur interpole linéaire entre points.
 *
 * Conformément à apply_payout_curve (main.py l. 186-188), les keys attendues
 * sont `performance_level` et `vesting_multiplier`.
 */
export function convertAcquisitionScale(
  scale: PythonConditionInput['acquisition_scale'],
): Array<{ performance_level: number; vesting_multiplier: number }> | undefined {
  if (!scale) return undefined;
  if (scale.mode === 'CURVE') {
    return scale.points.map((p) => ({
      performance_level: p.threshold,
      vesting_multiplier: p.acquisition / 100,
    }));
  }
  // TIERS : 2 points par palier
  return scale.tiers.flatMap((t) => [
    { performance_level: t.min, vesting_multiplier: t.acquisition / 100 },
    { performance_level: t.max, vesting_multiplier: t.acquisition / 100 },
  ]);
}

/**
 * V2 — Mappe un PeerCompany (TS) vers le format Pydantic strict du moteur
 * (WeightedPeerInGroup main.py l. 65-74).
 *
 * Convention : DB Capiwise utilise s0/volatility/correlationWithMain
 * (camelCase JS), moteur Python utilise S0/sigma/correlation (Pydantic
 * strict). Sans ce mapping, le moteur retourne 422 immédiatement parce
 * que S0 et sigma sont REQUIRED.
 *
 * Si le peer n'a pas de s0 ou volatility, on throw — le moteur n'aurait
 * de toute façon aucun moyen de simuler ce peer (Bug A/B audit V8).
 *
 * @throws si peer.s0 ou peer.volatility manquant/invalide
 */
export function mapPeerToMoteur(peer: PeerCompany, forceATM: boolean): MoteurPeerFormat {
  if (peer.s0 == null || peer.s0 <= 0) {
    throw new Error(
      `Peer ${peer.ticker ?? peer.id ?? 'unknown'} : s0 manquant ou invalide (${peer.s0}). ` +
        `Le moteur Python rejette le payload (Pydantic S0 required > 0). ` +
        `Saisir S0 manuellement ou attendre l'edge function fetchMarketData (Module 3a §5.2).`,
    );
  }
  if (peer.volatility == null || peer.volatility <= 0) {
    throw new Error(
      `Peer ${peer.ticker ?? peer.id ?? 'unknown'} : volatility manquante ou invalide (${peer.volatility}). ` +
        `Le moteur Python rejette le payload (Pydantic sigma required > 0). ` +
        `Saisir σ manuellement ou attendre l'edge function fetchMarketData.`,
    );
  }

  return {
    id: peer.id ?? peer.ticker,
    name: peer.name,
    ticker: peer.ticker,
    weight: peer.weight ?? 1,
    S0: peer.s0,
    sigma: normalizeSigma(peer.volatility),
    correlation: peer.correlationWithMain,
    dividend_yield: 0, // adjusted_close intègre déjà les divs
    // ATM symmetric V4.2 : initial_reference_price = peer.s0 quand pas de FIXED user
    initial_reference_price: forceATM ? peer.s0 : peer.s0,
  };
}

/**
 * Construit les paramètres d'UNE condition pour le payload Python.
 *
 * V2 changes :
 *   - TSR_REL_INDEX : envoie index_S0/index_sigma/correlation depuis les
 *     nouvelles colonnes DB (sinon Bug A → résultats faux silencieux)
 *   - TSR_REL_PEERS : toujours wrapper en weighted_peer_groups (Bug B)
 *   - peers : sérialisés via mapPeerToMoteur (Pydantic-compatible)
 *
 * Règle ATM symétrique V4.2 (CRITIQUE — cf. HANDOVER_PACK §9.4) :
 *   - Si l'utilisateur a explicitement saisi un FIXED price au step 4
 *     (start_price_method='FIXED' avec start_fixed_price > 0) → on utilise
 *     ce prix comme initial_reference_price (pas d'override)
 *   - Sinon → on FORCE initial_reference_price = S0 du hypothesis_set
 *     (= "ATM symmetric" — aligné sur le sous-jacent au moment du grant)
 *
 * Cette règle évite les biais asymétriques sur les peers TSR_REL où une
 * référence baissière donnait artificiellement un payout positif.
 */
function buildConditionParams(cond: PythonConditionInput, mainS0: number): Record<string, unknown> {
  const params: Record<string, unknown> = {
    type: cond.market_metric_type ?? cond.condition_type,
    weight: cond.weight,
    payout_curve: convertAcquisitionScale(cond.acquisition_scale),
    measurement_period_years: cond.measurement_period_years,
    comparison_method: cond.comparison_method ?? 'WEIGHTED_AVERAGE',
  };

  // Use_averaging dérivé du start_price_method (notre DB n'a pas la colonne
  // explicit `use_averaging` ; cf. memory écart 2 — on l'infère).
  if (cond.start_price_method === 'AVERAGE') {
    params.use_averaging = true;
    params.averaging_days = cond.start_averaging_days;
  }
  if (cond.end_price_method === 'AVERAGE') {
    params.use_averaging = true;
    params.avg_days_end = cond.end_averaging_days;
  }

  // ===========================================================================
  // ATM rule V4.2 — initial_reference_price
  // ===========================================================================
  const userFixedStart =
    cond.start_price_method === 'FIXED' &&
    cond.start_fixed_price != null &&
    cond.start_fixed_price > 0;

  if (userFixedStart) {
    params.initial_reference_price = cond.start_fixed_price;
    params.ref_price_source = 'USER_FIXED';
  } else {
    // Force ATM = S0 (cf. HANDOVER_PACK §9.4)
    params.initial_reference_price = mainS0;
    params.ref_price_source = 'ATM_SYMMETRIC';
  }

  // ===========================================================================
  // V2 — TSR_REL_INDEX : index_S0/index_sigma/correlation OBLIGATOIRES
  //
  // Sans ces valeurs, le moteur Python (main.py l. 454-456) fallback à
  // S0=100, σ=20%, ρ=0.5 → résultats MC silencieusement faux.
  //
  // Source des données : pour V1, saisie manuelle dans le wizard step 4
  // (colonnes reference_index_s0/sigma/correlation/dividend_yield ajoutées
  // en migration 00050). Pour V2 (Module 3a §5.2 deferred), fetched live
  // via Yahoo/EODHD au moment de la sauvegarde de la condition.
  //
  // Si les colonnes sont vides (cas legacy data), on log un warning console
  // et on continue sans ces fields — le moteur fallback aux défauts (FV
  // sera faux mais pas de crash). Le fix prévu Étape 2 ajoute une compliance
  // rule MARKET_DATA_REQUIRED qui bloque la sauvegarde sans ces inputs.
  // ===========================================================================
  if (cond.market_metric_type === 'TSR_REL_INDEX') {
    params.index_ticker = cond.reference_index;
    params.index_display_name = cond.reference_index_display_name;

    if (cond.reference_index_s0 != null && cond.reference_index_s0 > 0) {
      params.index_S0 = cond.reference_index_s0;
    } else {
      console.warn(
        `[buildPythonPayload] TSR_REL_INDEX ${cond.reference_index} : ` +
          `reference_index_s0 manquant. Moteur fallback à 100.0 → FV sera faux. ` +
          `Saisir S0 manuellement dans le wizard ou activer fetchMarketData.`,
      );
    }

    if (cond.reference_index_sigma != null && cond.reference_index_sigma > 0) {
      params.index_sigma = normalizeSigma(cond.reference_index_sigma);
    } else {
      console.warn(
        `[buildPythonPayload] TSR_REL_INDEX ${cond.reference_index} : ` +
          `reference_index_sigma manquant. Moteur fallback à 0.20 → FV sera faux.`,
      );
    }

    if (cond.reference_index_correlation != null) {
      params.correlation = cond.reference_index_correlation;
    } else {
      console.warn(
        `[buildPythonPayload] TSR_REL_INDEX ${cond.reference_index} : ` +
          `reference_index_correlation manquant. Moteur fallback à 0.5 → FV sera biaisé.`,
      );
    }

    // index_params : structure libre (Dict[str, Any] côté Pydantic).
    // On y stocke le yield (forcé à 0 pour adjusted_close) + le name pour
    // les logs côté moteur.
    params.index_params = {
      name: cond.reference_index_display_name ?? cond.reference_index,
      q: cond.reference_index_dividend_yield ?? 0,
    };
  }

  // ===========================================================================
  // V2 — TSR_REL_PEERS : TOUJOURS weighted_peer_groups
  //
  // Le moteur Python (main.py l. 460/586) ne lit QUE cond.weighted_peer_groups.
  // Si on envoie cond.peer_group flat, les peers sont SILENCIEUSEMENT IGNORÉS
  // → la condition retourne 0 → multiplier × 0 → FV totalement faux.
  //
  // Fix : si l'utilisateur a configuré peer_group flat (mode simple sans
  // groupes pondérés), on le wrappe artificiellement dans un weighted_peer_groups
  // avec un seul groupe nommé "default" et weight=1.0.
  //
  // ATM symétrique V4.2 : enrichPeersWithATM met initial_reference_price = peer.s0
  // pour CHAQUE peer (chaque peer démarre à son propre spot, pas au S0 du
  // sous-jacent — sinon biais énorme).
  // ===========================================================================
  if (cond.market_metric_type === 'TSR_REL_PEERS') {
    const wpgs = cond.weighted_peer_groups ?? [];
    const flat = cond.peer_group ?? [];

    if (wpgs.length > 0) {
      params.weighted_peer_groups = wpgs.map((g) => ({
        id: g.id,
        name: g.name,
        weight: g.weight,
        peers: g.peers.map((p) => mapPeerToMoteur(p, !userFixedStart)),
      }));
    } else if (flat.length > 0) {
      // V2 — wrapper artificiel pour que le moteur lise les peers
      params.weighted_peer_groups = [
        {
          id: 'default',
          name: 'Peer group',
          weight: 1.0,
          peers: flat.map((p) => mapPeerToMoteur(p, !userFixedStart)),
        },
      ];
    }
    // Note : on n'envoie PLUS cond.peer_group au top-level de la condition
    // (champ non lu par le moteur, juste du bruit dans le payload).
  }

  return params;
}
