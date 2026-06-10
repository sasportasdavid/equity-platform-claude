// =============================================================================
// Module 11 B0.7 — Edge Function python-callback (NEW)
// =============================================================================
//
// Le moteur Python (Fly.io) POSTe ici quand il a fini un calcul Monte Carlo.
// Capiwise reçoit la response, vérifie HMAC, UPDATE valuation_runs.status
// = DONE/ERROR et insert valuation_results.
//
// Pattern callback async — Vrai fix dette #94 (Module 11 B0.7).
// Remplace le pattern EdgeRuntime.waitUntil() (B0.6) qui bloquait sur les
// `await fetch` longs ou les `await response.json()` de grosses responses.
//
// Sécurité : auth via HMAC SHA-256 signature dans header X-Capiwise-Signature.
// Le secret est généré per-run par EF compute-valuation et stocké dans
// valuation_runs.callback_secret. Python le réutilise pour signer son callback.
//
// Idempotency : si run déjà DONE/ERROR, return 200 sans rien faire (Python
// peut retry network glitch). Run.status check + early return.
//
// Variables d'env requises :
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injectées)
//
// verify_jwt: false — caller externe (Python externe Fly.io), auth via HMAC.
//
// ⚠️ Ce fichier doit rester synchronisé avec la version déployée en cloud
// (restauré le 2026-06-10 après corruption repo — audit P0-3 : le fichier
// committé contenait du code étranger, la version cloud était correcte).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CallbackPayload = {
  run_id?: string;
  status?: 'DONE' | 'ERROR';
  response?: PythonResponse;
  error?: string;
};

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
  visualization?: { paths_sample?: unknown };
};

type RunRow = {
  id: string;
  callback_secret: string | null;
  status: string;
  plan_id: string | null;
  org_id: string | null;
  simulation_config_id: string | null;
  payload_sent: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  const signature = req.headers.get('x-capiwise-signature');
  if (!signature) {
    return jsonError(401, 'Missing X-Capiwise-Signature header');
  }

  // Read raw body for HMAC verification (must be on raw bytes, not parsed JSON)
  const rawBody = await req.text();
  let payload: CallbackPayload;
  try {
    payload = JSON.parse(rawBody) as CallbackPayload;
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const { run_id, status, response, error } = payload;
  if (!run_id || !status) {
    return jsonError(400, 'Missing run_id or status in body');
  }
  if (status !== 'DONE' && status !== 'ERROR') {
    return jsonError(400, `Invalid status: ${status}`);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Load run + verify HMAC
  const { data: run, error: fetchErr } = await supabase
    .from('valuation_runs')
    .select('id, callback_secret, status, plan_id, org_id, simulation_config_id, payload_sent')
    .eq('id', run_id)
    .maybeSingle();

  if (fetchErr || !run) {
    return jsonError(404, `Run ${run_id} not found`);
  }
  const runRow = run as RunRow;
  if (!runRow.callback_secret) {
    return jsonError(400, `Run ${run_id} has no callback_secret (legacy run?)`);
  }

  // Verify HMAC signature on raw body
  const expectedSig = await computeHmac(rawBody, runRow.callback_secret);
  if (signature !== expectedSig) {
    console.error(`[python-callback] HMAC mismatch run_id=${run_id}`);
    return jsonError(401, 'Invalid signature');
  }

  // Idempotency : skip si déjà DONE/ERROR (network retry from Python)
  if (runRow.status === 'DONE' || runRow.status === 'ERROR') {
    console.log(`[python-callback] run ${run_id} already ${runRow.status}, skipping`);
    return jsonResponse({ ok: true, already_processed: true, status: runRow.status });
  }

  // Process callback based on status
  try {
    if (status === 'DONE' && response) {
      await processSuccessCallback(run_id, runRow, response, supabase);
    } else {
      await processFailureCallback(run_id, error, supabase);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[python-callback] processing failed for ${run_id}: ${msg}`);
    // Mark ERROR best-effort
    await supabase
      .from('valuation_runs')
      .update({
        status: 'ERROR',
        error_message: `python-callback processing error: ${msg}`.slice(0, 5000),
        callback_received_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', run_id)
      .then(() => {
        /* noop */
      });
    return jsonError(500, msg);
  }
});

// =============================================================================
// Process callback success (DONE)
// =============================================================================

async function processSuccessCallback(
  runId: string,
  run: RunRow,
  result: PythonResponse,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  // IFRS 2 §16-22 : la juste-valeur d'un instrument equity-settled est celle
  // du sous-jacent SANS prise en compte des conditions de service ni non-marché.
  // Celles-ci ajustent la CHARGE comptable, pas la juste-valeur unitaire.
  const fairValuePerUnit =
    result.fair_value_market_only ?? result.fair_value_per_unit ?? result.fair_value ?? null;

  // Insert valuation_results
  if (run.org_id == null) {
    throw new Error(`Run ${runId} has no org_id, cannot insert valuation_results`);
  }

  await supabase.from('valuation_results').insert({
    valuation_run_id: runId,
    org_id: run.org_id,
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
    market_data_snapshot: {},
    fair_value: fairValuePerUnit,
    audit_data: {
      source: 'python-callback',
      engine_version: result.engine_version,
      pattern: 'B0.7-callback',
    },
  });

  // Determine if visualization is present in response
  const payloadSent = run.payload_sent as {
    include_visualization?: boolean;
    config?: { use_monte_carlo?: boolean };
  } | null;
  const visualizationPresent =
    payloadSent?.include_visualization === true &&
    result.visualization != null &&
    Array.isArray(result.visualization.paths_sample);

  // Determine pricer_used from payload
  const pricerUsed =
    payloadSent?.config?.use_monte_carlo === true ? 'MONTE_CARLO_MULTI_TRANCHE' : 'BLACK_SCHOLES';

  // Update run to DONE
  await supabase
    .from('valuation_runs')
    .update({
      status: 'DONE',
      completed_at: new Date().toISOString(),
      callback_received_at: new Date().toISOString(),
      pricer_used: pricerUsed,
      engine_version: result.engine_version ?? 'V8',
      includes_visualization: visualizationPresent,
      response_received: result,
    })
    .eq('id', runId);

  // Trigger compute-ifrs2-expense (best-effort, non bloquant)
  supabase.functions
    .invoke('compute-ifrs2-expense', { body: { run_id: runId } })
    .then(() => {
      /* noop */
    })
    .catch(() => {
      /* compute-ifrs2-expense optionnel — ignore failure */
    });

  console.log(`[python-callback] run ${runId} marked DONE successfully`);
}

// =============================================================================
// Process callback failure (ERROR)
// =============================================================================

async function processFailureCallback(
  runId: string,
  error: string | undefined,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  await supabase
    .from('valuation_runs')
    .update({
      status: 'ERROR',
      error_message: (error ?? 'Python callback reported failure (no detail)').slice(0, 5000),
      callback_received_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  console.log(`[python-callback] run ${runId} marked ERROR`);
}

// =============================================================================
// HMAC helper (Web Crypto SubtleCrypto — disponible en Deno EF runtime)
// =============================================================================

async function computeHmac(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// Response helpers
// =============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
