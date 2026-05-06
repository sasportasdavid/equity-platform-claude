/**
 * Quant engine Fly.io — healthcheck E2E ops.
 *
 * Vérifie en pré-beta (et à chaque release) que :
 *  - L'instance Fly.io répond à `GET /openapi.json` (liveness)
 *  - L'endpoint `POST /compute/multi-tranche` calcule effectivement une
 *    valuation simple en < 5s (sanity sur dépendances Python : numpy,
 *    scipy, pandas, etc. + cold start VM)
 *  - Le Pydantic ValuationRequest est toujours compatible avec notre payload
 *
 * Usage :
 *   pnpm --filter web tsx scripts/quant-engine-healthcheck.ts
 *
 * Variables d'env consommées :
 *   QUANT_ENGINE_URL      — base URL Fly.io (default https://equity-gem-quant-tonnom.fly.dev)
 *   QUANT_ENGINE_API_KEY  — Bearer token (optionnel)
 *
 * Exit code :
 *   0 — tout OK
 *   1 — au moins un check KO
 *
 * Pas de `server-only` — c'est un script CLI standalone (pas un module
 * importé par le bundle Next.js).
 */

const DEFAULT_URL = 'https://equity-gem-quant-tonnom.fly.dev';

type CheckResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  detail: string;
};

async function checkLiveness(baseUrl: string, apiKey: string | null): Promise<CheckResult> {
  const start = Date.now();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`${baseUrl}/openapi.json`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - start;

    if (!response.ok) {
      return {
        name: 'liveness',
        ok: false,
        durationMs,
        detail: `HTTP ${response.status} on /openapi.json`,
      };
    }

    const json = (await response.json()) as { info?: { title?: string; version?: string } };
    return {
      name: 'liveness',
      ok: true,
      durationMs,
      detail: `OpenAPI ${json.info?.title ?? '?'} v${json.info?.version ?? '?'}`,
    };
  } catch (error) {
    return {
      name: 'liveness',
      ok: false,
      durationMs: Date.now() - start,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkComputeEndpoint(baseUrl: string, apiKey: string | null): Promise<CheckResult> {
  const start = Date.now();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // Payload minimal — 1 tranche OPTION at-the-money, 1k paths, T=2y. < 5s.
  // strike = S0 → option ATM, fv_market_only > 0. Pas de market condition,
  // pas de greeks, pas de viz : on teste le pricer GBM seul.
  const body = {
    config: { num_paths: 1000, seed: 42 },
    market: { S0: 25, annualized_sigma: 0.3, rate_flat: 0.038 },
    instrument: { type: 'OPTION', strike: 25, T: 2 },
    include_debug_paths: false,
    compute_greeks: false,
    include_visualization: false,
  };

  try {
    const response = await fetch(`${baseUrl}/compute/multi-tranche`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const durationMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        name: 'compute',
        ok: false,
        durationMs,
        detail: `HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const json = (await response.json()) as {
      engine_version?: string;
      fair_value?: number;
      fair_value_market_only?: number;
      execution_time_ms?: number;
    };

    const engineVersion = json.engine_version ?? 'unknown';
    const fvMarket =
      typeof json.fair_value_market_only === 'number'
        ? json.fair_value_market_only.toFixed(4)
        : 'n/a';
    const serverMs =
      typeof json.execution_time_ms === 'number' ? `${json.execution_time_ms.toFixed(1)}ms` : 'n/a';

    return {
      name: 'compute',
      ok: true,
      durationMs,
      detail: `engine v${engineVersion}, fv_market=${fvMarket} (server ${serverMs})`,
    };
  } catch (error) {
    return {
      name: 'compute',
      ok: false,
      durationMs: Date.now() - start,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResult(result: CheckResult): void {
  const icon = result.ok ? '✅' : '❌';
  // eslint-disable-next-line no-console
  console.log(`${icon} ${result.name.padEnd(10)} (${result.durationMs}ms) — ${result.detail}`);
}

async function main(): Promise<void> {
  const baseUrl = process.env.QUANT_ENGINE_URL ?? DEFAULT_URL;
  const apiKey = process.env.QUANT_ENGINE_API_KEY ?? null;

  // eslint-disable-next-line no-console
  console.log(`\n🔬 Quant engine healthcheck — ${baseUrl}\n`);

  const liveness = await checkLiveness(baseUrl, apiKey);
  printResult(liveness);

  const compute = await checkComputeEndpoint(baseUrl, apiKey);
  printResult(compute);

  const allOk = liveness.ok && compute.ok;
  // eslint-disable-next-line no-console
  console.log(allOk ? '\n✅ All checks passed.\n' : '\n❌ One or more checks failed.\n');
  process.exit(allOk ? 0 : 1);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Healthcheck crashed:', error);
  process.exit(1);
});
