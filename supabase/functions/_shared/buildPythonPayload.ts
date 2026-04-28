// =============================================================================
// Module 3a B5.1 — Builder du payload Python (moteur equity-gem-quant V8)
// =============================================================================
//
// Conversion canonique entre les rows DB Supabase et le format attendu par
// `POST /compute/multi-tranche` du moteur Python (HANDOVER_PACK V4.2).
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
  condition_type: string | null;
  market_metric_type: string | null;
  weight: number | null;
  measurement_period_years: number | null;
  comparison_method: string | null;
  reference_index: string | null;
  reference_index_display_name: string | null;
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
  name: string;
  ticker: string;
  weight?: number;
  s0?: number;
  volatility?: number;
  correlationWithMain?: number;
};

// ---------------------------------------------------------------------------
// Output payload (format Python V4.2 — HANDOVER_PACK §4.2)
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
};

// =============================================================================
// API publique
// =============================================================================

/**
 * Construit le payload JSON à envoyer à `POST /compute/multi-tranche`.
 *
 * Routing config.use_monte_carlo :
 *   - true si au moins une condition MARKET (TSR/SHARE_PRICE)
 *   - true si vesting multi-tranches (le moteur a un kernel dédié multi-tranche)
 *   - false sinon → Black-Scholes analytique (rapide pour BSPCE/AGA simples)
 *
 * Convention vesting_schedule format V4 :
 *   [{ time: years_from_grant_julian, portion: pct/100 }]
 *
 * @throws si paramètres critiques manquants (S0, sigma, T, etc.)
 */
export function buildPythonPayload(ctx: PythonValuationContext): PythonPayload {
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

  // 2. Routing : Monte Carlo si MARKET ou multi-tranches, sinon BS
  const useMonteCarlo = shouldUseMonteCarlo(ctx);

  // 3. Build sections
  const config = {
    num_paths: numPaths,
    num_time_steps: Math.round(T * stepsPerYear),
    seed: 42, // deterministic replay (cf. spec §4 — IFRS 2 audit)
    antithetic_variates: ctx.simulationConfig.antithetic_variates,
    use_monte_carlo: useMonteCarlo,
  };

  const market = {
    S0: s0,
    r: ctx.hypothesisSet.rate_flat ?? 0,
    q: ctx.hypothesisSet.dividend_yield ?? 0,
    sigma,
  };

  const instrument = {
    strike: ctx.plan.exercise_price ?? 0,
    T,
    type: isOptionType(ctx.plan.plan_type) ? ('option' as const) : ('stock' as const),
    vesting_schedule: convertVestingToFormatV4(ctx.vestingTranches, ctx.plan.grant_date),
  };

  const conditions = ctx.conditions.map((cond) => buildConditionParams(cond, s0));

  return { config, market, instrument, conditions };
}

// =============================================================================
// Helpers internes
// =============================================================================

/**
 * Décide si on use Monte Carlo (vs Black-Scholes analytique).
 *
 *   - true si AU MOINS une condition de type MARKET (TSR_*, SHARE_PRICE) :
 *     ces conditions ont un payout path-dependent, BS ne suffit pas
 *   - true si > 1 tranches : le moteur a un kernel dédié multi-tranche
 *     pour vesting échelonné (BS standard ne le supporte pas natively)
 *   - false sinon : Black-Scholes analytique fait l'affaire (BSPCE/AGA simple)
 */
export function shouldUseMonteCarlo(ctx: PythonValuationContext): boolean {
  const hasMarketCondition = ctx.conditions.some((c) => c.condition_type === 'MARKET');
  const hasMultipleTranches = ctx.vestingTranches.length > 1;
  return hasMarketCondition || hasMultipleTranches;
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
 * Construit les paramètres d'UNE condition pour le payload Python.
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
  // TSR_REL_INDEX — paramètres index (mock S0/sigma pour V1, à compléter
  // quand l'edge function searchTicker sera branchée sur Yahoo/EODHD)
  // ===========================================================================
  if (cond.market_metric_type === 'TSR_REL_INDEX') {
    params.index_ticker = cond.reference_index;
    params.index_display_name = cond.reference_index_display_name;
    // Le moteur Python a des defaults sensés pour les indices connus
    // (^FCHI / ^GSPC / ^STOXX50E) — cf. HANDOVER_PACK §10.1
  }

  // ===========================================================================
  // TSR_REL_PEERS — V4.2 ATM symmetric sur tous les peers
  // ===========================================================================
  if (cond.market_metric_type === 'TSR_REL_PEERS') {
    const wpgs = cond.weighted_peer_groups ?? [];
    const flat = cond.peer_group ?? [];

    if (wpgs.length > 0) {
      params.weighted_peer_groups = wpgs.map((g) => ({
        ...g,
        peers: enrichPeersWithATM(g.peers, mainS0, !userFixedStart),
      }));
    } else if (flat.length > 0) {
      params.peer_group = enrichPeersWithATM(flat, mainS0, !userFixedStart);
    }
  }

  return params;
}

/**
 * Enrichit chaque peer avec son `initial_reference_price` selon la règle ATM
 * V4.2 :
 *
 *   - forceATM=true (= pas de FIXED user) : initial_reference_price = peer.s0
 *     pour CHAQUE peer (ATM symétrique : chaque peer démarre à son propre
 *     spot, pas au S0 du sous-jacent — sinon biais énorme)
 *   - forceATM=false : on garde le initial_reference_price custom si fourni,
 *     sinon fallback sur peer.s0
 */
export function enrichPeersWithATM(
  peers: PeerCompany[],
  _mainS0: number,
  forceATM: boolean,
): Array<PeerCompany & { initial_reference_price?: number; ref_price_source?: string }> {
  return peers.map((p) => ({
    ...p,
    initial_reference_price: forceATM ? p.s0 : (p.s0 ?? undefined),
    ref_price_source: forceATM ? 'ATM_SYMMETRIC' : 'CUSTOM',
  }));
}
