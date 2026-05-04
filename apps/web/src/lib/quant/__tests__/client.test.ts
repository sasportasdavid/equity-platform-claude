import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callMultiTrancheCompute } from '../client';

/**
 * Module 11 B1 — Tests du client quant engine.
 *
 * Couvre les cas critiques :
 *  - Happy path : fetch retourne JSON valide → return parsé
 *  - HTTP non-2xx : throw avec status + body dans message
 *  - Body non-JSON : throw "not JSON-parseable"
 *  - Zod parse échoue (response shape invalide) → throw "shape mismatch"
 *  - Auth : Authorization Bearer présent si apiKey, absent sinon
 *  - apiKey: null → désactive Authorization même si env présent
 *  - QUANT_ENGINE_URL absent → throw explicite
 *  - visualization absent / nullable → parse OK
 *
 * On mock `globalThis.fetch` directement (pas besoin de MSW pour ce niveau).
 */

const MOCK_URL = 'https://test-engine.example.com';

const VALID_RESPONSE_MIN = {
  fair_value: 12.34,
  fair_value_per_unit: 12.34,
  engine_version: '2.5.0',
  input_hash: 'abc123def456',
  execution_time_ms: 1234,
};

function makeFetchMock(responseInit: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const ok = responseInit.ok ?? true;
  const status = responseInit.status ?? 200;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(responseInit.json ?? VALID_RESPONSE_MIN),
    text: vi.fn().mockResolvedValue(responseInit.text ?? ''),
  });
}

describe('callMultiTrancheCompute', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalUrl: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalUrl = process.env.QUANT_ENGINE_URL;
    originalApiKey = process.env.QUANT_ENGINE_API_KEY;
    delete process.env.QUANT_ENGINE_URL;
    delete process.env.QUANT_ENGINE_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl !== undefined) process.env.QUANT_ENGINE_URL = originalUrl;
    if (originalApiKey !== undefined) process.env.QUANT_ENGINE_API_KEY = originalApiKey;
  });

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------

  it('returns parsed response on 200 OK with valid shape', async () => {
    const fetchMock = makeFetchMock({ json: VALID_RESPONSE_MIN });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await callMultiTrancheCompute({ dummy: 'payload' }, { baseUrl: MOCK_URL });

    expect(result.fair_value).toBe(12.34);
    expect(result.engine_version).toBe('2.5.0');
    expect(result.input_hash).toBe('abc123def456');
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${MOCK_URL}/compute/multi-tranche`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ dummy: 'payload' }));
  });

  // -------------------------------------------------------------------------
  // 2. HTTP non-2xx
  // -------------------------------------------------------------------------

  it('throws with HTTP status + body when response.ok is false', async () => {
    const fetchMock = makeFetchMock({
      ok: false,
      status: 500,
      text: 'Internal server error from engine',
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(callMultiTrancheCompute({}, { baseUrl: MOCK_URL })).rejects.toThrow(
      /Engine quant failed \(HTTP 500\): Internal server error from engine/,
    );
  });

  it('handles 422 validation errors with body', async () => {
    const fetchMock = makeFetchMock({
      ok: false,
      status: 422,
      text: '{"detail":"validation error"}',
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(callMultiTrancheCompute({}, { baseUrl: MOCK_URL })).rejects.toThrow(/HTTP 422/);
  });

  // -------------------------------------------------------------------------
  // 3. Zod parse failure
  // -------------------------------------------------------------------------

  it('throws "shape mismatch" if response misses required fields', async () => {
    const fetchMock = makeFetchMock({
      json: { fair_value: 'not a number', engine_version: '2.5.0' },
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(callMultiTrancheCompute({}, { baseUrl: MOCK_URL })).rejects.toThrow(
      /Engine response shape mismatch/,
    );
  });

  it('throws if response body is not parseable JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      text: vi.fn().mockResolvedValue(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(callMultiTrancheCompute({}, { baseUrl: MOCK_URL })).rejects.toThrow(
      /Engine response not JSON-parseable/,
    );
  });

  // -------------------------------------------------------------------------
  // 4. Auth header
  // -------------------------------------------------------------------------

  it('adds Authorization Bearer header when apiKey is provided via option', async () => {
    const fetchMock = makeFetchMock({});
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await callMultiTrancheCompute({}, { baseUrl: MOCK_URL, apiKey: 'sk_test_abc123' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['Authorization']).toBe('Bearer sk_test_abc123');
  });

  it('reads QUANT_ENGINE_API_KEY from env when option not provided', async () => {
    process.env.QUANT_ENGINE_API_KEY = 'sk_env_xyz';
    const fetchMock = makeFetchMock({});
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await callMultiTrancheCompute({}, { baseUrl: MOCK_URL });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['Authorization']).toBe('Bearer sk_env_xyz');
  });

  it('does NOT add Authorization header when no apiKey available', async () => {
    const fetchMock = makeFetchMock({});
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await callMultiTrancheCompute({}, { baseUrl: MOCK_URL });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('apiKey: null option disables Authorization even if env is set', async () => {
    process.env.QUANT_ENGINE_API_KEY = 'sk_env_should_be_ignored';
    const fetchMock = makeFetchMock({});
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await callMultiTrancheCompute({}, { baseUrl: MOCK_URL, apiKey: null });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['Authorization']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 5. baseUrl from env
  // -------------------------------------------------------------------------

  it('reads QUANT_ENGINE_URL from env when option not provided', async () => {
    process.env.QUANT_ENGINE_URL = MOCK_URL;
    const fetchMock = makeFetchMock({});
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await callMultiTrancheCompute({});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${MOCK_URL}/compute/multi-tranche`);
  });

  it('throws explicit error when QUANT_ENGINE_URL is missing entirely', async () => {
    await expect(callMultiTrancheCompute({})).rejects.toThrow(/QUANT_ENGINE_URL non configuré/);
  });

  // -------------------------------------------------------------------------
  // 6. Visualization optionality
  // -------------------------------------------------------------------------

  it('parses response without visualization field (visualization absent)', async () => {
    const fetchMock = makeFetchMock({ json: VALID_RESPONSE_MIN });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await callMultiTrancheCompute({}, { baseUrl: MOCK_URL });

    expect(result.visualization).toBeUndefined();
  });

  it('parses response with visualization explicitly null (engine fast-path FV=0)', async () => {
    const fetchMock = makeFetchMock({
      json: { ...VALID_RESPONSE_MIN, visualization: null },
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await callMultiTrancheCompute({}, { baseUrl: MOCK_URL });

    expect(result.visualization).toBeNull();
  });

  it('parses response with full visualization payload', async () => {
    const fetchMock = makeFetchMock({
      json: {
        ...VALID_RESPONSE_MIN,
        visualization: {
          paths_sample: [[1, 2, 3]],
          paths_metadata: [
            {
              sim_id: 0,
              final_value: 3,
              max_value: 3,
              min_value: 1,
              final_itm: true,
              achieved_vesting: true,
              payoff_discounted: 1.5,
            },
          ],
          convergence_curve: [{ n: 1000, fv: 12.3 }],
          payoff_histogram: { bins: [0, 1, 2], counts: [10, 5, 1] },
          sample_size: 1,
          total_paths: 100000,
          num_steps: 36,
          sim_T: 3,
        },
      },
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await callMultiTrancheCompute({}, { baseUrl: MOCK_URL });

    expect(result.visualization).toBeDefined();
    expect(result.visualization?.paths_sample).toHaveLength(1);
    expect(result.visualization?.paths_metadata[0]?.sim_id).toBe(0);
    expect(result.visualization?.total_paths).toBe(100000);
  });

  // -------------------------------------------------------------------------
  // 7. AbortSignal forwarding
  // -------------------------------------------------------------------------

  it('forwards AbortSignal to fetch', async () => {
    const fetchMock = makeFetchMock({});
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const controller = new AbortController();
    await callMultiTrancheCompute({}, { baseUrl: MOCK_URL, signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.signal).toBe(controller.signal);
  });
});
