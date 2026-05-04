import 'server-only';

/**
 * Module 11 B1 — Client HTTP du moteur Python (quant engine Fly.io).
 *
 * Wrapper minimal autour de `fetch` vers `${QUANT_ENGINE_URL}/compute/multi-tranche`
 * avec validation Zod stricte de la réponse via `pyMonteCarloResponseSchema`.
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §3.2.
 *
 * Erreurs remontées (Error.message lisible humain) :
 *  - `Engine quant failed (HTTP <status>): <body>` si HTTP non-2xx
 *  - `Engine response shape mismatch: <zod issues>` si validation Zod fail
 *  - `QUANT_ENGINE_URL non configuré` si la variable d'env est absente
 *
 * ⚠️ Auth : header `Authorization: Bearer <key>` si `QUANT_ENGINE_API_KEY` est
 * défini. Différent de l'EF Deno historique `compute-valuation` qui utilise
 * `x-api-key` (pattern V1, conservé en l'état tant qu'on ne refactore pas
 * cette EF pour appeler ce client TS — décision B5+).
 *
 * Note : `'server-only'` car le client porte le secret QUANT_ENGINE_API_KEY,
 * il ne doit jamais finir dans un bundle client.
 */

import { pyMonteCarloResponseSchema, type PyMonteCarloResponse } from '@equity/shared';

export type CallMultiTrancheOptions = {
  /**
   * Override du base URL — utile pour les tests (mock server) ou pour
   * pointer vers une instance Fly.io alternative (staging vs prod).
   * Défaut : `process.env.QUANT_ENGINE_URL`.
   */
  baseUrl?: string;
  /**
   * Override de l'API key — utile pour les tests. Défaut :
   * `process.env.QUANT_ENGINE_API_KEY`. Si `null` explicit, désactive
   * le header `Authorization` même si la variable d'env est définie.
   */
  apiKey?: string | null;
  /**
   * AbortSignal pour timeout / cancel côté caller. Défaut : pas de timeout
   * (le moteur peut répondre lentement sur 100K paths × 50 tranches).
   */
  signal?: AbortSignal;
};

/**
 * POST `${QUANT_ENGINE_URL}/compute/multi-tranche` avec body JSON `payload`.
 *
 * Le payload est `unknown` côté caller : on délègue la validation au moteur
 * Python (qui utilise Pydantic + raise 422 si shape invalide). On garde donc
 * la flexibilité de changer le format payload V2/V3 sans casser ce client.
 *
 * La réponse est strictement validée via `pyMonteCarloResponseSchema` (cf
 * @equity/shared/types/valuation). Si shape invalide → throw.
 */
export async function callMultiTrancheCompute(
  payload: unknown,
  options: CallMultiTrancheOptions = {},
): Promise<PyMonteCarloResponse> {
  const baseUrl = options.baseUrl ?? process.env.QUANT_ENGINE_URL;
  if (!baseUrl) {
    throw new Error(
      'QUANT_ENGINE_URL non configuré (set process.env.QUANT_ENGINE_URL ou passez baseUrl en option)',
    );
  }

  const apiKey =
    options.apiKey === null ? null : (options.apiKey ?? process.env.QUANT_ENGINE_API_KEY ?? null);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/compute/multi-tranche`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '<unable to read response body>';
    }
    throw new Error(`Engine quant failed (HTTP ${response.status}): ${errorBody.slice(0, 1000)}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    throw new Error(`Engine response not JSON-parseable: ${msg}`);
  }

  const parsed = pyMonteCarloResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Engine response shape mismatch: ${parsed.error.message}`);
  }
  return parsed.data;
}
