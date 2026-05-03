import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests Server Actions market-data — Module 3a payload V2.
 *
 * Couvre les 3 actions exposées au wizard plan (Step 4) :
 *  - searchIndices : proxy yahoo-search EF
 *  - fetchIndexMarketData : proxy market-data-fetch EF (TSR_REL_INDEX)
 *  - fetchPeerGroupMarketData : proxy market-data-peer-group EF (TSR_REL_PEERS)
 *
 * Pattern mock : pas de network réel, on stub `supabase.functions.invoke`.
 * 3 cas par action minimum : happy path, EF error, Zod validation fail.
 */

const { TEST_ORG_ID, TEST_USER_ID, invokeMock } = vi.hoisted(() => ({
  TEST_ORG_ID: '00000000-0000-4000-8000-000000000000',
  TEST_USER_ID: '00000000-0000-4000-8000-000000000099',
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/auth/rbac', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    id: TEST_USER_ID,
    email: 'admin@capiwise.local',
    fullName: 'Admin User',
    activeOrgId: TEST_ORG_ID,
    orgIds: [TEST_ORG_ID],
    activeRoles: ['OWNER'],
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    functions: {
      invoke: invokeMock,
    },
  }),
}));

import { fetchIndexMarketData, fetchPeerGroupMarketData, searchIndices } from '../market-data';

beforeEach(() => {
  invokeMock.mockReset();
});

// ---------------------------------------------------------------------------
// 1. searchIndices
// ---------------------------------------------------------------------------

describe('searchIndices', () => {
  it('happy path : EF retourne success → wrapping {ok:true,data}', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        success: true,
        results: [
          { symbol: '^FCHI', shortname: 'CAC 40', quoteType: 'INDEX' },
          { symbol: '^GSPC', shortname: 'S&P 500', quoteType: 'INDEX' },
        ],
        total: 2,
        fallback: false,
      },
      error: null,
    });

    const result = await searchIndices({ query: 'CAC' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.results).toHaveLength(2);
      expect(result.data.results[0]!.symbol).toBe('^FCHI');
      expect(result.data.fallback).toBe(false);
    }
    expect(invokeMock).toHaveBeenCalledWith('yahoo-search', {
      body: { query: 'CAC', quotesCount: 15 },
    });
  });

  it('fallback Yahoo : success=true mais fallback=true → propagation flag', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: true, results: [], total: 0, fallback: true },
      error: null,
    });

    const result = await searchIndices({ query: 'XYZ', quotesCount: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fallback).toBe(true);
      expect(result.data.total).toBe(0);
    }
    expect(invokeMock).toHaveBeenCalledWith('yahoo-search', {
      body: { query: 'XYZ', quotesCount: 5 },
    });
  });

  it('EF retourne error → {ok:false,error}', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'non-2xx status code' },
    });
    const result = await searchIndices({ query: 'ABC' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('yahoo-search invoke échoué');
    }
  });

  it('EF retourne success=false dans le body → propagation message', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: false, error: 'Yahoo down hard' },
      error: null,
    });
    const result = await searchIndices({ query: 'def' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Yahoo down hard');
    }
  });

  it('Zod fail : query trop courte (< 2 chars)', async () => {
    const result = await searchIndices({ query: 'a' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/au moins 2/i);
    }
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. fetchIndexMarketData
// ---------------------------------------------------------------------------

describe('fetchIndexMarketData', () => {
  const validInput = {
    ticker: '^FCHI',
    asOfDate: '2026-01-15',
    lookbackDays: 1095,
  };

  it('happy path : EF preview_only renvoie market_data → wrapping data', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        success: true,
        preview_only: true,
        from_cache: false,
        market_data: {
          ticker: '^FCHI',
          s0: 7234.12,
          S0: 7234.12,
          sigma: 0.18,
          q: 0.025,
          r: 0.032,
          volatility: 0.18,
          dividend_yield: 0.025,
          currency: 'EUR',
          data_points: 750,
          lookback_days: 1095,
          as_of_date: '2026-01-15',
        },
      },
      error: null,
    });

    const result = await fetchIndexMarketData(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.s0).toBe(7234.12);
      expect(result.data.sigma).toBe(0.18);
      expect(result.data.dividend_yield).toBe(0.025);
    }
    expect(invokeMock).toHaveBeenCalledWith('market-data-fetch', {
      body: expect.objectContaining({
        ticker: '^FCHI',
        as_of_date: '2026-01-15',
        lookback_days: 1095,
        preview_only: true,
        price_type: 'CLOSE',
      }),
    });
  });

  it('EF retourne error → propagation', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'EODHD timeout' },
    });
    const result = await fetchIndexMarketData(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('market-data-fetch invoke échoué');
    }
  });

  it("EF retourne success=false → message d'erreur business", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: false, error: 'Ticker introuvable EODHD' },
      error: null,
    });
    const result = await fetchIndexMarketData(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Ticker introuvable EODHD');
    }
  });

  it('réponse malformée (market_data absent) → erreur claire', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: true },
      error: null,
    });
    const result = await fetchIndexMarketData(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('market_data absent');
    }
  });

  it('Zod fail : asOfDate non-ISO', async () => {
    const result = await fetchIndexMarketData({
      ticker: '^FCHI',
      asOfDate: '15/01/2026',
    });
    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Zod fail : lookbackDays > MAX (3650)', async () => {
    const result = await fetchIndexMarketData({
      ...validInput,
      lookbackDays: 5000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/3650/);
    }
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Zod fail : ticker vide', async () => {
    const result = await fetchIndexMarketData({
      ...validInput,
      ticker: '',
    });
    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. fetchPeerGroupMarketData
// ---------------------------------------------------------------------------

describe('fetchPeerGroupMarketData', () => {
  const validInput = {
    companyTicker: 'BNP.PA',
    peers: [
      { ticker: 'GLE.PA', name: 'Société Générale' },
      { ticker: 'ACA.PA', name: 'Crédit Agricole' },
    ],
    asOfDate: '2026-01-15',
    lookbackDays: 1095,
  };

  it('happy path : EF renvoie matrix + assets → wrapping data', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          tickers: ['BNP.PA', 'GLE.PA', 'ACA.PA'],
          assets: [
            { ticker: 'BNP.PA', s0: 65.4, volatility: 0.22, dividendYield: 0.05, dataPoints: 750 },
            { ticker: 'GLE.PA', s0: 25.1, volatility: 0.28, dividendYield: 0.07, dataPoints: 750 },
            { ticker: 'ACA.PA', s0: 12.3, volatility: 0.21, dividendYield: 0.06, dataPoints: 750 },
          ],
          correlation_matrix: [
            [1.0, 0.85, 0.78],
            [0.85, 1.0, 0.82],
            [0.78, 0.82, 1.0],
          ],
          sample_size: 750,
          lookback_days: 1095,
          as_of_date: '2026-01-15',
        },
      },
      error: null,
    });

    const result = await fetchPeerGroupMarketData(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tickers).toEqual(['BNP.PA', 'GLE.PA', 'ACA.PA']);
      expect(result.data.assets).toHaveLength(3);
      expect(result.data.correlation_matrix[0]![1]).toBe(0.85);
      expect(result.data.sample_size).toBe(750);
    }
    expect(invokeMock).toHaveBeenCalledWith('market-data-peer-group', {
      body: expect.objectContaining({
        org_id: TEST_ORG_ID,
        company_ticker: 'BNP.PA',
        peers: validInput.peers,
        as_of_date: '2026-01-15',
        lookback_days: 1095,
      }),
    });
  });

  it('EF retourne error réseau → propagation', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'function timeout' },
    });
    const result = await fetchPeerGroupMarketData(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('market-data-peer-group invoke échoué');
    }
  });

  it('EF retourne success=false → propagation message business', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: false, error: 'Insufficient data to compute correlation' },
      error: null,
    });
    const result = await fetchPeerGroupMarketData(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Insufficient data to compute correlation');
    }
  });

  it('Zod fail : peers vide', async () => {
    const result = await fetchPeerGroupMarketData({
      ...validInput,
      peers: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/au moins 1 peer/i);
    }
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Zod fail : companyTicker vide', async () => {
    const result = await fetchPeerGroupMarketData({
      ...validInput,
      companyTicker: '',
    });
    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Zod fail : > 30 peers', async () => {
    const tooManyPeers = Array.from({ length: 31 }, (_, i) => ({
      ticker: `PEER${i}.PA`,
    }));
    const result = await fetchPeerGroupMarketData({
      ...validInput,
      peers: tooManyPeers,
    });
    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
