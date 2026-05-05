// =============================================================================
// Module 3a B5.2 — Edge Function compute-valuation
// =============================================================================
//
// V2 — 2026-05-01 — Persist payload_sent + response_received pour audit IFRS 2.46
// V2.1 — 2026-05-03 — Bloc LIVE_AT_VALUATION (re-fetch market data avant build)
// V3 — 2026-05-05 — Pattern EdgeRuntime.waitUntil() (B0.6, dette #94 partial fix)
// V4 — 2026-05-05 — Pattern callback async Python → Capiwise (B0.7, dette #94 vrai fix)
//   au lieu de attendre `await fetch()` sur Python (qui pouvait bloquer même <300s),
//   on génère un callback_secret per-run, on POST Python en mode async (Python ack 202
//   en ~100ms et fait son calcul en BackgroundTask FastAPI), et on laisse l'EF
//   python-callback (NEW B0.7.4) gérer le UPDATE DONE quand Python POST le callback
//   signé HMAC SHA-256.
//
//   Le pipeline EF compute-valuation FINIT après ack Python (~30s max via timeout).
//   Aucune dépendance à EdgeRuntime.waitUntil long ou à grosse response Python parsing.
//
// Pipeline asynchrone (déclenché par la Server Action runValuation B5.3) qui :
//   0. (V3) Validation rapide : run existe + status='QUEUED' (idempotency)
//      → return 202 Accepted immédiat
//   1. [BG] Charge le contexte du run depuis Supabase
//   1.bis. [BG] V2.1 — LIVE_AT_VALUATION re-fetch market data (inchangé)
//   2. [BG] Construit le payload Python via buildPythonPayload
//   3. [BG] V4 NEW — Génère callback_secret + Update RUNNING + payload_sent + callback_secret
//   4. [BG] V4 NEW — POST Python avec callback_url + callback_secret + run_id
//      → fire-and-forget (timeout 30s pour ack 202, pas pour calcul complet)
//   5. [BG] V4 NEW — Pipeline FINIT ICI (le callback fera UPDATE DONE + INSERT results).
//      Mode mock (MOCK_PYTHON_ENGINE=true) garde le path direct via applyMockResult.
//
// Sécurité : appelle Supabase via SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
//
// Variables d'env requises :
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injectées par Supabase)
//   - QUANT_ENGINE_URL                        (https://equity-gem-quant-tonnom.fly.dev)
//   - QUANT_ENGINE_API_KEY                    (optionnel — sk_live_xxx)
//   - EODHD_API_KEY                           (V2.1 — utilisé indirect via market-data-fetch EF)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { buildPythonPayload } from '../_shared/buildPythonPayload.ts';
import type { PythonValuationContext } from '../_shared/buildPythonPayload.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

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
  companyTicker: string | null;
  python: PythonValuationContext;
  marketDataSnapshot: Record<string, unknown>;
  includeVisualization: boolean;
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

    // V3 (B0.6) — Idempotency check
    const { data: runCheck, error: runCheckErr } = await supabase
      .from('valuation_runs')
      .select('id, status')
      .eq('id', runId)
      .maybeSingle();
    if (runCheckErr || !runCheck) {
      return jsonError(404, `Run ${runId} introuvable`);
    }
    if (runCheck.status !== 'QUEUED') {
      console.log(`[compute-valuation] Run ${runId} already ${runCheck.status}, skipping`);
      return new Response(
        JSON.stringify({ ok: true, skipped: 'already_processing', status: runCheck.status }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // V3 (B0.6) — Pattern EdgeRuntime.waitUntil() : ack 202 immédiat puis BG processing
    const capturedRunId = runId;

    const processValuation = async () => {
      try {
        await runValuationPipeline(capturedRunId, supabase);
      } catch (bgErr) {
        const msg = bgErr instanceof Error ? bgErr.message : String(bgErr);
        console.error(`[compute-valuation][bg] Run ${capturedRunId} failed: ${msg}`);
        await supabase
          .from('valuation_runs')
          .update({
            status: 'ERROR',
            error_message: msg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', capturedRunId)
          .then(() => {
            /* noop */
          })
          .catch((e: unknown) => {
            console.error(`[compute-valuation][bg] Failed to mark ERROR: ${String(e)}`);
          });
      }
    };

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(processValuation());
    } else {
      await processValuation();
    }

    return new Response(
      JSON.stringify({ accepted: true, run_id: runId, processing: 'background' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[compute-valuation] handler error:', errorMessage);
    return jsonError(500, errorMessage);
  }
});

// =============================================================================
// V4 (B0.7) — Pipeline avec pattern callback Python → Capiwise
// =============================================================================

async function runValuationPipeline(
  runId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  // 1. Charger le contexte
  const context = await loadValuationContext(supabase, runId);
  if (!context) {
    throw new Error(`Run ${runId} introuvable ou contexte incomplet`);
  }

  // 1.bis (V2.1) — LIVE_AT_VALUATION re-fetch market data (inchangé)
  const liveFetchResult = await refreshLiveMarketData(supabase, context);
  if (!liveFetchResult.ok) {
    throw new Error(
      `LIVE_AT_VALUATION fetch failed for ${liveFetchResult.failedConditionId}: ` +
        liveFetchResult.error,
    );
  }
  const liveFetchMetadata = liveFetchResult.data;

  // 2. Build payload
  const payload = buildPythonPayload(context.python, {
    includeVisualization: context.includeVisualization,
  });

  const inputHash = await computeInputHash(payload);

  // 3. V4 (B0.7) NEW — Génère callback_secret per-run (64 hex chars = 256 bits entropy)
  const callbackSecret = generateCallbackSecret();

  // V4 (B0.7) NEW — Mark RUNNING + payload_sent + input_hash + callback_secret
  await supabase
    .from('valuation_runs')
    .update({
      status: 'RUNNING',
      started_at: new Date().toISOString(),
      input_hash: inputHash,
      callback_secret: callbackSecret,
      payload_sent: {
        ...payload,
        ...(liveFetchMetadata.conditions_refetched.length > 0
          ? { live_fetch_metadata: liveFetchMetadata }
          : {}),
      },
    })
    .eq('id', runId);

  // 4. V4 (B0.7) NEW — Mock path conservé pour dev local sans Python
  if (Deno.env.get('MOCK_PYTHON_ENGINE') === 'true') {
    const mockResult = generateMockResponse(payload);
    await applyMockResult(runId, context, payload, mockResult, supabase);
    return;
  }

  // 5. V4 (B0.7) NEW — POST Python en mode async (fire-and-forget)
  await triggerPythonAsync(payload, runId, callbackSecret);

  // 6. V4 (B0.7) NEW — Pipeline FINIT ICI. Le callback fera UPDATE DONE + INSERT results.
  console.log(`[compute-valuation][bg] Run ${runId} dispatched to Python, awaiting callback`);
}

// =============================================================================
// V4 (B0.7) NEW — Helpers
// =============================================================================

/**
 * Génère un callback_secret per-run (64 hex chars = 256 bits entropy).
 * Stocké dans valuation_runs.callback_secret, envoyé au moteur Python qui le
 * réutilise pour signer le callback. EF python-callback vérifie la signature
 * avant UPDATE.
 */
function generateCallbackSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * V4 (B0.7) NEW — POST au moteur Python en mode async.
 *
 * Le payload est enrichi avec callback_url + callback_secret + run_id (top-level,
 * cohérent avec include_visualization existant).
 *
 * Python doit retourner 202 Accepted en ~100ms, puis faire le calcul en
 * BackgroundTask FastAPI, et finir par POSTer le callback signé à Capiwise.
 *
 * Timeout 30s : couvre l'ack 202 initial. Pas le calcul (qui peut prendre 5min+).
 *
 * Si Python ack non-2xx → throw → caller mark ERROR direct.
 * Si Python ack 200 OK avec body legacy (pas {status:'accepted'}) → throw
 * (Python n'a pas le mode callback). Cela ne doit pas arriver en prod V1.
 */
async function triggerPythonAsync(
  payload: ReturnType<typeof buildPythonPayload>,
  runId: string,
  callbackSecret: string,
): Promise<void> {
  const url = Deno.env.get('QUANT_ENGINE_URL');
  if (!url) {
    throw new Error(
      'QUANT_ENGINE_URL non configuré (set Supabase secret ou MOCK_PYTHON_ENGINE=true)',
    );
  }
  const apiKey = Deno.env.get('QUANT_ENGINE_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const callbackUrl = `${supabaseUrl}/functions/v1/python-callback`;

  // Enrich payload top-level (cohérent include_visualization)
  const enrichedPayload = {
    ...payload,
    callback_url: callbackUrl,
    callback_secret: callbackSecret,
    run_id: runId,
  };

  // Timeout 30s pour ack 202 (pas pour le calcul complet — Python continue en BG)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${url}/compute/multi-tranche`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(enrichedPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Python ack non-2xx ${response.status}: ${text.slice(0, 500)}`);
    }

    const ack = (await response.json().catch(() => ({}))) as { status?: string; run_id?: string };
    if (ack.status !== 'accepted') {
      throw new Error(
        `Python returned unexpected ack (mode callback non supporté?): ${JSON.stringify(ack).slice(0, 500)}`,
      );
    }

    console.log(`[compute-valuation][bg] Python accepted run ${runId}, awaiting callback`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * V4 (B0.7) NEW — Mock path : applique le résultat directement sans appel Python.
 * Garde le mock dev fonctionnel sans nécessiter le pattern callback.
 */
async function applyMockResult(
  runId: string,
  context: LoadedContext,
  payload: ReturnType<typeof buildPythonPayload>,
  result: PythonResponse,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const fairValuePerUnit =
    result.fair_value_market_only ?? result.fair_value_per_unit ?? result.fair_value ?? null;

  await supabase.from('valuation_results').insert({
    valuation_run_id: runId,
    org_id: context.orgId,
    fair_value_per_instrument: fairValuePerUnit,
    fair_value_total: fairValuePerUnit,
    std_error: result.std_error ?? null,
    ci95_low: result.ci95_low ?? null,
    ci95_high: result.ci95_high ?? null,
    distribution_stats: {
      debug_paths: result.debug_paths,
      vesting_probability: result.vesting_probability,
      vesting_probability_real: result.vesting_probability_real,
      avg_market_multiplier: result.avg_market_multiplier,
      fair_value_filtered: result.fair_value,
      audit_trail: result.audit_trail,
      tranche_details: result.tranche_details,
      condition_breakdown: result.condition_breakdown,
    },
    sensitivities: result.greeks ?? result.sensitivities ?? null,
    market_data_snapshot: context.marketDataSnapshot,
    fair_value: fairValuePerUnit,
    audit_data: { source: 'compute-valuation-mock', engine_version: result.engine_version },
  });

  await supabase
    .from('valuation_runs')
    .update({
      status: 'DONE',
      completed_at: new Date().toISOString(),
      pricer_used: 'MOCK',
      engine_version: result.engine_version ?? 'MOCK_V1',
      includes_visualization: false,
      response_received: result,
    })
    .eq('id', runId);

  supabase.functions
    .invoke('compute-ifrs2-expense', { body: { run_id: runId } })
    .then(() => {
      /* noop */
    })
    .catch(() => {
      /* ignore */
    });
}

// =============================================================================
// Existing helpers (unchanged from V3)
// =============================================================================

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function computeInputHash(payload: unknown): Promise<string> {
  const canonical = canonicalJsonStringify(payload);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJsonStringify).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return (
    '{' +
    entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalJsonStringify(v)).join(',') +
    '}'
  );
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
          preview_only: true,
        },
      });

      if (error || !data?.success || !data.data) {
        return {
          ok: false,
          failedConditionId: condKey,
          error: error?.message ?? data?.error ?? 'unknown EF error',
        };
      }

      c.reference_index_s0 = data.data.spot_price;
      c.reference_index_sigma = data.data.annualized_volatility;
      c.reference_index_dividend_yield = data.data.dividend_yield;

      metadata.conditions_refetched.push(condKey);
      metadata.fetch_timestamps[condKey] = new Date().toISOString();
      metadata.data_sources[condKey] = data.data.data_source ?? 'EODHD';
      metadata.resolved_tickers[condKey] = data.data.resolved_ticker ?? c.reference_index;
      if (data.data.warnings) metadata.warnings[condKey] = data.data.warnings;
      continue;
    }

    if (c.market_metric_type === 'TSR_REL_PEERS') {
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
  }

  return { ok: true, data: metadata };
}

async function loadValuationContext(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<LoadedContext | null> {
  const { data: run } = await supabase
    .from('valuation_runs')
    .select('id, plan_id, org_id, simulation_config_id, includes_visualization')
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
    includeVisualization:
      (run as { includes_visualization?: boolean | null }).includes_visualization === true,
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
    },
  };
}

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
