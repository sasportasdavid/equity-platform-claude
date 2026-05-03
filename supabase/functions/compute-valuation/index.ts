// =============================================================================
// Module 3a B5.2 — Edge Function compute-valuation
// =============================================================================
//
// V2 — 2026-05-01 — Persist payload_sent + response_received pour audit IFRS 2.46
// V2.1 — 2026-05-03 — Bloc LIVE_AT_VALUATION (re-fetch market data avant build)
//
// Pipeline asynchrone (déclenché par la Server Action runValuation B5.3) qui :
//   1. Charge le contexte du run depuis Supabase (plan + hypothesis_set
//      + volatility_scheme + simulation_config + conditions + vesting_tranches
//      + companyTicker pour TSR_REL_PEERS LIVE)
//   1.bis. NEW V2.1 — Pour les conditions configurées en market_data_fetch_mode
//      = LIVE_AT_VALUATION, re-fetch les paramètres marché depuis EODHD/Yahoo
//      via les EF market-data-fetch (TSR_REL_INDEX) et market-data-peer-group
//      (TSR_REL_PEERS). Patch in-place les valeurs sur context.python.conditions
//      avant le buildPythonPayload. Si fetch fail → throw (mark ERROR), pas de
//      fallback DB stale (cohérence mode LIVE).
//   2. Construit le payload Python via buildPythonPayload (helper B5.1)
//   3. Update valuation_runs.status = 'RUNNING' + started_at = now
//      + payload_sent = JSON snapshot (NEW V2 — audit IFRS 2.46)
//      + live_fetch_metadata si applicable (V2.1)
//   4. POST vers QUANT_ENGINE_URL/compute/multi-tranche (avec API key si fournie)
//   5. Insert valuation_results avec fair_value + sensitivities + audit_trail
//   6. Update valuation_runs.status = 'DONE' / 'ERROR' + finished_at + pricer_used
//      + response_received = JSON brut (NEW V2)
//   7. Trigger compute-ifrs2-expense (Edge Function future, non bloquant)
//
// Sécurité : appelle Supabase via SUPABASE_SERVICE_ROLE_KEY (bypass RLS)
// car l'utilisateur a déjà été authentifié + la permission validée par
// runValuation au moment de l'insertion du run QUEUED.
//
// Variables d'env requises :
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injectées par Supabase)
//   - QUANT_ENGINE_URL                        (https://equity-gem-quant.fly.dev)
//   - QUANT_ENGINE_API_KEY                    (optionnel — sk_live_xxx)
//   - EODHD_API_KEY                           (V2.1 — utilisé indirect via market-data-fetch EF)
//
// Fallback mock : si MOCK_PYTHON_ENGINE='true', l'Edge Function génère un
// résultat synthétique sans appeler le vrai moteur. Utile pour dev/test
// quand le moteur n'est pas réachable depuis Supabase Edge runtime.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { buildPythonPayload } from '../_shared/buildPythonPayload.ts';
import type { PythonValuationContext } from '../_shared/buildPythonPayload.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PythonResponse = {
  fair_value?: number;
  fair_value_market_only?: number;
  fair_value_per_unit?: number;
  std_error?: number;
  ci95_low?: number;
  ci95_high?: number;
  vesting_probability?: number;
  vesting_probability_real?: number;
  avg_market_multiplier?: number;
  debug_paths?: unknown;
  audit_trail?: unknown;
  tranche_details?: unknown;
  condition_breakdown?: unknown;
  greeks?: Record<string, number> | null;
  sensitivities?: Record<string, number>;
  engine_version?: string;
};

type LiveFetchMetadata = {
  conditions_refetched: string[];
  fetch_timestamps: Record<string, string>;
  data_sources: Record<string, string>;
  resolved_tickers: Record<string, string>;
  warnings: Record<string, unknown>;
};

type LoadedContext = {
  orgId: string;
  planId: string;
  /** Ticker du sous-jacent pour TSR_REL_PEERS LIVE (via plans.company_id → companies.ticker). */
  companyTicker: string | null;
  python: PythonValuationContext;
  marketDataSnapshot: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  let runId: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { run_id?: string };
    runId = body.run_id ?? null;
    if (!runId) {
      return jsonError(400, 'run_id requis');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // 1. Charger le contexte
    const context = await loadValuationContext(supabase, runId);
    if (!context) {
      return jsonError(404, `Run ${runId} introuvable ou contexte incomplet`);
    }

    // 1.bis (V2.1) — LIVE_AT_VALUATION : re-fetch market data pour les conditions
    // configurées avec ce mode. Les autres modes (SNAPSHOT_AT_GRANT, MANUAL)
    // utilisent les valeurs déjà figées en DB par loadValuationContext.
    //
    // Mode "déconseillé IFRS 2" — la reproductibilité des résultats est
    // dégradée (ré-évaluation à chaque run avec données du jour). L'audit reste
    // possible via valuation_runs.payload_sent qui contient le payload final
    // post-merge + live_fetch_metadata.
    const liveFetchResult = await refreshLiveMarketData(supabase, context);
    if (!liveFetchResult.ok) {
      // Fail-fast — NE PAS retomber sur valeurs DB stale (contradiction mode LIVE)
      throw new Error(
        `LIVE_AT_VALUATION fetch failed for ${liveFetchResult.failedConditionId}: ` +
          liveFetchResult.error,
      );
    }
    const liveFetchMetadata = liveFetchResult.data;

    // 2. Build payload (utilise context.python avec valeurs LIVE patchées si applicable)
    const payload = buildPythonPayload(context.python);

    // 3. Mark RUNNING + persist payload_sent (V2 — audit IFRS 2.46)
    await supabase
      .from('valuation_runs')
      .update({
        status: 'RUNNING',
        started_at: new Date().toISOString(),
        payload_sent: {
          ...payload,
          // V2.1 — trace les conditions re-fetched live pour audit
          ...(liveFetchMetadata.conditions_refetched.length > 0
            ? { live_fetch_metadata: liveFetchMetadata }
            : {}),
        },
      })
      .eq('id', runId);

    // 4. Appel Python (ou mock)
    const result = await callPythonEngine(payload);

    // 5. Save results
    //
    // IFRS 2 §16-22 : la juste-valeur d'un instrument equity-settled est
    // celle du sous-jacent SANS prise en compte des conditions de service
    // (rétention salarié) ni des conditions non-marché (perf interne).
    // Celles-ci ajustent la CHARGE comptable, pas la juste-valeur unitaire.
    //
    // Le moteur Python expose les deux niveaux :
    //   - `fair_value_market_only` = juste-valeur option pure (= ce qu'on
    //     veut stocker en `fair_value_per_instrument` IFRS 2)
    //   - `fair_value` = filtrée par vesting_probability × payout_multiplier
    //     (= valeur cash-flow attendue, utile pour reporting interne mais
    //     pas pour IFRS 2)
    //
    // Conditions MARKET (TSR/SHARE_PRICE) : elles SONT incluses dans la
    // juste-valeur IFRS 2 → elles font partie du Monte Carlo et impactent
    // déjà `fair_value_market_only` côté moteur (cf. HANDOVER_PACK §3).
    const fairValuePerUnit =
      result.fair_value_market_only ?? result.fair_value_per_unit ?? result.fair_value ?? null;

    await supabase.from('valuation_results').insert({
      valuation_run_id: runId,
      org_id: context.orgId,
      fair_value_per_instrument: fairValuePerUnit,
      fair_value_total: fairValuePerUnit, // = par_unit pour 1 instrument ; à pondérer par allocations Module 3b
      std_error: result.std_error ?? null,
      ci95_low: result.ci95_low ?? null,
      ci95_high: result.ci95_high ?? null,
      distribution_stats: {
        debug_paths: result.debug_paths,
        vesting_probability: result.vesting_probability,
        vesting_probability_real: result.vesting_probability_real,
        avg_market_multiplier: result.avg_market_multiplier,
        fair_value_filtered: result.fair_value, // = market × proba — utile reporting interne
        audit_trail: result.audit_trail,
        tranche_details: result.tranche_details,
        condition_breakdown: result.condition_breakdown,
      },
      sensitivities: result.greeks ?? result.sensitivities ?? null,
      market_data_snapshot: context.marketDataSnapshot,
      // Champs legacy 00001 (gardés pour compat) :
      fair_value: fairValuePerUnit,
      audit_data: { source: 'compute-valuation', engine_version: result.engine_version },
    });

    // 6. Mark DONE + persist response_received (V2 — audit IFRS 2.46)
    await supabase
      .from('valuation_runs')
      .update({
        status: 'DONE',
        completed_at: new Date().toISOString(),
        pricer_used: payload.config.use_monte_carlo ? 'MONTE_CARLO_MULTI_TRANCHE' : 'BLACK_SCHOLES',
        engine_version: result.engine_version ?? 'V8',
        response_received: result, // ← NEW V2 — snapshot brut moteur
      })
      .eq('id', runId);

    // 7. Trigger IFRS 2 (best-effort — fail silent si la fonction n'existe pas encore)
    supabase.functions.invoke('compute-ifrs2-expense', { body: { run_id: runId } }).catch(() => {
      // Edge Function compute-ifrs2-expense pas encore livrée (B5.6) — OK
    });

    return new Response(JSON.stringify({ success: true, run_id: runId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[compute-valuation]', errorMessage);

    // Update run en ERROR si possible (best effort)
    if (runId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false } },
        );
        await supabase
          .from('valuation_runs')
          .update({
            status: 'ERROR',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId);
      } catch {
        /* ignore — log seul */
      }
    }

    return jsonError(500, errorMessage);
  }
});

// =============================================================================
// Helpers
// =============================================================================

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyLiveFetchMetadata(): LiveFetchMetadata {
  return {
    conditions_refetched: [],
    fetch_timestamps: {},
    data_sources: {},
    resolved_tickers: {},
    warnings: {},
  };
}

/**
 * V2.1 — Pour chaque condition `market_data_fetch_mode = 'LIVE_AT_VALUATION'` :
 *   - TSR_REL_INDEX : invoke EF `market-data-fetch` avec ticker + as_of_date=today.
 *     Patch in-place reference_index_s0/sigma/dividend_yield sur la condition.
 *     `correlation` NON re-fetched ici (calcul vs main asset → délégué au moteur).
 *   - TSR_REL_PEERS : invoke EF `market-data-peer-group` avec company_ticker du plan.
 *     Patch in-place s0/volatility/correlationWithMain sur chaque peer (flat ou
 *     dans weighted_peer_groups) via assetStats + correlationMatrix.
 *
 * Fail-fast : si une condition LIVE foire le fetch, retourne ok:false (le caller
 * throw → status='ERROR' avec message clair). On NE retombe PAS sur valeurs DB
 * stale (contradiction mode LIVE).
 *
 * Si aucune condition LIVE : return ok:true avec metadata vide, no-op.
 */
async function refreshLiveMarketData(
  supabase: ReturnType<typeof createClient>,
  context: LoadedContext,
): Promise<
  { ok: true; data: LiveFetchMetadata } | { ok: false; failedConditionId: string; error: string }
> {
  const liveConditions = context.python.conditions.filter(
    (c) => c.market_data_fetch_mode === 'LIVE_AT_VALUATION',
  );
  if (liveConditions.length === 0) {
    return { ok: true, data: emptyLiveFetchMetadata() };
  }

  const today = new Date().toISOString().split('T')[0]!;
  const metadata = emptyLiveFetchMetadata();

  for (const c of liveConditions) {
    const condKey =
      c.id ?? c.reference_index ?? `${c.market_metric_type}-${liveConditions.indexOf(c)}`;

    // -------------------------------------------------------------------------
    // TSR_REL_INDEX
    // -------------------------------------------------------------------------
    if (c.market_metric_type === 'TSR_REL_INDEX' && c.reference_index) {
      const lookbackDays = c.measurement_period_years
        ? Math.round(c.measurement_period_years * 252)
        : 252;
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        data?: {
          spot_price: number;
          annualized_volatility: number;
          dividend_yield: number;
          data_source?: string;
          resolved_ticker?: string;
          warnings?: unknown;
        };
        error?: string;
      }>('market-data-fetch', {
        body: {
          org_id: context.orgId,
          plan_id: context.planId,
          ticker: c.reference_index,
          as_of_date: today,
          lookback_days: lookbackDays,
          preview_only: true, // ne pas écrire en DB performance_conditions
        },
      });

      if (error || !data?.success || !data.data) {
        return {
          ok: false,
          failedConditionId: condKey,
          error: error?.message ?? data?.error ?? 'unknown EF error',
        };
      }

      // Patch in-place les valeurs sur la condition
      c.reference_index_s0 = data.data.spot_price;
      c.reference_index_sigma = data.data.annualized_volatility;
      c.reference_index_dividend_yield = data.data.dividend_yield;
      // correlation : conservée telle quelle (calcul vs main asset délégué au moteur)

      metadata.conditions_refetched.push(condKey);
      metadata.fetch_timestamps[condKey] = new Date().toISOString();
      metadata.data_sources[condKey] = data.data.data_source ?? 'EODHD';
      metadata.resolved_tickers[condKey] = data.data.resolved_ticker ?? c.reference_index;
      if (data.data.warnings) metadata.warnings[condKey] = data.data.warnings;
      continue;
    }

    // -------------------------------------------------------------------------
    // TSR_REL_PEERS
    // -------------------------------------------------------------------------
    if (c.market_metric_type === 'TSR_REL_PEERS') {
      // Construit la liste des peers à partir de weighted_peer_groups OU peer_group flat
      const wpgPeers = (c.weighted_peer_groups ?? []).flatMap((g) => g.peers ?? []);
      const flatPeers = c.peer_group ?? [];
      const peersList = wpgPeers.length > 0 ? wpgPeers : flatPeers;

      if (peersList.length === 0) {
        return {
          ok: false,
          failedConditionId: condKey,
          error: 'TSR_REL_PEERS sans peer défini en mode LIVE_AT_VALUATION',
        };
      }
      if (!context.companyTicker) {
        return {
          ok: false,
          failedConditionId: condKey,
          error:
            'TSR_REL_PEERS LIVE_AT_VALUATION requiert companies.ticker du sous-jacent — non renseigné',
        };
      }

      const lookbackDays = c.measurement_period_years
        ? Math.round(c.measurement_period_years * 252)
        : 252;

      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        data?: {
          tickers: string[];
          assets: Array<{
            ticker: string;
            s0: number;
            volatility: number;
            dividendYield: number;
            resolvedSymbol?: string;
          }>;
          correlation_matrix: number[][];
          data_quality?: { warnings?: unknown };
        };
        error?: string;
      }>('market-data-peer-group', {
        body: {
          org_id: context.orgId,
          plan_id: context.planId,
          condition_id: c.id ?? null,
          company_ticker: context.companyTicker,
          peers: peersList.map((p) => ({ ticker: p.ticker, name: p.name })),
          lookback_days: lookbackDays,
          as_of_date: today,
        },
      });

      if (error || !data?.success || !data.data) {
        return {
          ok: false,
          failedConditionId: condKey,
          error: error?.message ?? data?.error ?? 'unknown EF error',
        };
      }

      // Patch in-place chaque peer avec assetStats + correlation vs target.
      // Convention market-data-peer-group : data.tickers[0] = company_ticker,
      // data.tickers[1..] = peers. Donc correlation_matrix[targetIdx][peerIdx]
      // est la corrélation peer ↔ target.
      const tickers = data.data.tickers;
      const assets = data.data.assets;
      const matrix = data.data.correlation_matrix;
      const targetIdx = tickers.indexOf(context.companyTicker);

      for (const peer of peersList) {
        const stats = assets.find((s) => s.ticker === peer.ticker);
        if (stats) {
          peer.s0 = stats.s0;
          peer.volatility = stats.volatility;
          const peerIdx = tickers.indexOf(peer.ticker);
          if (targetIdx >= 0 && peerIdx >= 0 && matrix[targetIdx]?.[peerIdx] != null) {
            peer.correlationWithMain = matrix[targetIdx][peerIdx]!;
          }
        }
      }

      metadata.conditions_refetched.push(condKey);
      metadata.fetch_timestamps[condKey] = new Date().toISOString();
      metadata.data_sources[condKey] = 'EODHD_PEERS';
      metadata.resolved_tickers[condKey] = peersList.map((p) => p.ticker).join(',');
      if (data.data.data_quality?.warnings) {
        metadata.warnings[condKey] = data.data.data_quality.warnings;
      }
      continue;
    }

    // Type non géré (NON_MARKET, etc.) → skip silencieux
    // (LIVE_AT_VALUATION sur condition non-marché est une mauvaise config —
    // mais pas bloquant pour V1).
  }

  return { ok: true, data: metadata };
}

/**
 * Charge tout le contexte nécessaire à la valorisation à partir du run_id.
 * 6 queries parallèles via Promise.all. Retourne null si le plan ou le
 * hypothesis_set/simulation_config/volatility_scheme manquent.
 *
 * V2 : étend la query performance_conditions avec les nouvelles colonnes
 * reference_index_s0/sigma/correlation/dividend_yield (migration 00050 → 00070).
 *
 * V2.1 : étend la query performance_conditions avec id + market_data_fetch_mode
 * (migration 00073) pour permettre le dispatch LIVE_AT_VALUATION. Ajoute aussi
 * la query companies pour récupérer le ticker du sous-jacent (companyTicker
 * pour TSR_REL_PEERS LIVE).
 */
async function loadValuationContext(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<LoadedContext | null> {
  const { data: run } = await supabase
    .from('valuation_runs')
    .select('id, plan_id, org_id, simulation_config_id')
    .eq('id', runId)
    .maybeSingle();
  if (!run?.plan_id || !run.org_id) return null;

  const [planRes, conditionsRes, vestingRes, hypoRes] = await Promise.all([
    supabase
      .from('plans')
      .select('id, plan_type, exercise_price, grant_date, company_id')
      .eq('id', run.plan_id)
      .maybeSingle(),
    supabase
      .from('performance_conditions')
      .select(
        // V2 : ajout reference_index_s0/sigma/correlation/dividend_yield
        // V2.1 : ajout id + market_data_fetch_mode (migration 00073)
        'id, condition_type, market_metric_type, weight, measurement_period_years, comparison_method, ' +
          'reference_index, reference_index_display_name, ' +
          'reference_index_s0, reference_index_sigma, reference_index_correlation, reference_index_dividend_yield, ' +
          'market_data_fetch_mode, ' +
          'start_price_method, start_fixed_price, start_averaging_days, ' +
          'end_price_method, end_fixed_price, end_averaging_days, ' +
          'peer_group, weighted_peer_groups, acquisition_scale',
      )
      .eq('plan_id', run.plan_id),
    supabase
      .from('vesting_schedules')
      .select('id, vesting_tranches ( sort_order, vesting_date, percentage_of_award )')
      .eq('plan_id', run.plan_id)
      .maybeSingle(),
    supabase
      .from('hypothesis_sets')
      .select('id, s0, rate_flat, dividend_yield')
      .eq('plan_id', run.plan_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!planRes.data || !hypoRes.data) return null;

  const planRow = planRes.data as {
    id: string;
    plan_type: string;
    exercise_price: number | null;
    grant_date: string;
    company_id: string | null;
  };

  // Volatility + simulation : chaînés depuis hypothesis_set
  // V2.1 : + companies pour récupérer le ticker du sous-jacent
  const [volRes, simRes, companyRes] = await Promise.all([
    supabase
      .from('volatility_schemes')
      .select('annualized_sigma, heston_params, jump_params')
      .eq('hypothesis_set_id', hypoRes.data.id)
      .maybeSingle(),
    supabase
      .from('simulation_configs')
      .select('num_paths, steps_per_year, time_horizon_years, antithetic_variates')
      .eq('hypothesis_set_id', hypoRes.data.id)
      .maybeSingle(),
    planRow.company_id
      ? supabase.from('companies').select('ticker').eq('id', planRow.company_id).maybeSingle()
      : Promise.resolve({ data: null as { ticker: string | null } | null }),
  ]);

  if (!volRes.data || !simRes.data) return null;

  const tranches = (vestingRes.data?.vesting_tranches ?? []) as Array<{
    sort_order: number;
    vesting_date: string;
    percentage_of_award: number;
  }>;

  return {
    orgId: run.org_id,
    planId: run.plan_id,
    companyTicker: (companyRes.data as { ticker: string | null } | null)?.ticker ?? null,
    python: {
      orgId: run.org_id,
      plan: planRow,
      hypothesisSet: hypoRes.data,
      volatilityScheme: volRes.data,
      simulationConfig: simRes.data,
      conditions: (conditionsRes.data ?? []) as PythonValuationContext['conditions'],
      vestingTranches: tranches,
    },
    marketDataSnapshot: {
      captured_at: new Date().toISOString(),
      hypothesis_set_id: hypoRes.data.id,
      // En B5 : on capture juste les inputs hypothesis. La snapshot complète
      // (peers + index live data depuis EODHD/Yahoo) arrive maintenant via
      // payload_sent.live_fetch_metadata pour les conditions LIVE_AT_VALUATION.
    },
  };
}

/**
 * Appelle le moteur Python OU retourne un résultat mock si MOCK_PYTHON_ENGINE='true'.
 *
 * Le mock permet de tester le wire complet (queue → run → save) sans dépendre
 * du moteur Python — utile pour le dev local + l'E2E CI tant que le moteur
 * n'est pas accessible depuis le runtime Edge Function (probe externe bloquée
 * dans certains environnements sandbox).
 */
async function callPythonEngine(
  payload: ReturnType<typeof buildPythonPayload>,
): Promise<PythonResponse> {
  if (Deno.env.get('MOCK_PYTHON_ENGINE') === 'true') {
    return generateMockResponse(payload);
  }

  const url = Deno.env.get('QUANT_ENGINE_URL');
  if (!url) {
    throw new Error(
      'QUANT_ENGINE_URL non configuré (set Supabase secret ou MOCK_PYTHON_ENGINE=true)',
    );
  }
  const apiKey = Deno.env.get('QUANT_ENGINE_API_KEY');

  const response = await fetch(`${url}/compute/multi-tranche`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Python engine ${response.status} : ${text.slice(0, 500)}`);
  }
  return (await response.json()) as PythonResponse;
}

/**
 * Mock résultat — formules Black-Scholes très simplifiées (pas de
 * multi-tranches, pas de conditions perf). Suffisant pour valider le wire.
 *
 * fair_value ≈ S0 × exp(-q × T) × N(d1) - K × exp(-r × T) × N(d2)
 * avec d1 = (ln(S0/K) + (r-q+σ²/2)×T) / (σ×√T), d2 = d1 - σ×√T
 *
 * Pour les stocks (pas d'option), on retourne S0 × exp(-q × T) × vesting_prob.
 */
function generateMockResponse(payload: ReturnType<typeof buildPythonPayload>): PythonResponse {
  const { S0, r, q, sigma } = payload.market;
  const { strike, T, type } = payload.instrument;
  let fv: number;
  if (type === 'option' && strike > 0) {
    const d1 = (Math.log(S0 / strike) + (r - q + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    fv = S0 * Math.exp(-q * T) * normCdf(d1) - strike * Math.exp(-r * T) * normCdf(d2);
  } else {
    fv = S0 * Math.exp(-q * T);
  }
  const fvRounded = Math.max(0, Number(fv.toFixed(4)));
  return {
    fair_value: fvRounded,
    fair_value_per_unit: fvRounded,
    std_error: fvRounded * 0.01,
    ci95_low: fvRounded * 0.98,
    ci95_high: fvRounded * 1.02,
    vesting_probability: 1.0,
    sensitivities: {
      delta: 0.5,
      gamma: 0.05,
      vega: S0 * Math.sqrt(T) * 0.01,
      theta: -fvRounded / (T * 365),
      rho: T * Math.exp(-r * T) * 0.01,
    },
    engine_version: 'MOCK_V1',
    audit_trail: {
      source: 'mock',
      formula: 'black-scholes-simplified',
      payload_seed: payload.config.seed,
    },
  };
}

/** CDF normale standardisée — approximation Abramowitz & Stegun (1965). */
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}
