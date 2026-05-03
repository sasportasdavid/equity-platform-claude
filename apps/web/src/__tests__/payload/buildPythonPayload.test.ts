// =============================================================================
// Tests d'alignement buildPythonPayload v2 ↔ moteur Python V8
// =============================================================================
//
// Vérifie que le payload construit par Capiwise est compatible avec le schéma
// Pydantic strict du moteur Python (cf. main.py l. 65-120 ValuationRequest).
//
// Tests structurels (pas d'appel réel au moteur — voir e2e/* pour ça).
// =============================================================================

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildPythonPayload,
  shouldUseMonteCarlo,
  mapPeerToMoteur,
  convertVestingToFormatV4,
  convertAcquisitionScale,
  type PythonValuationContext,
  type PeerCompany,
} from '../../../../../supabase/functions/_shared/buildPythonPayload';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMinimalContext(overrides?: Partial<PythonValuationContext>): PythonValuationContext {
  return {
    orgId: 'org-1',
    plan: {
      id: 'plan-1',
      plan_type: 'AGA',
      exercise_price: null,
      grant_date: '2026-01-01',
    },
    hypothesisSet: {
      s0: 100,
      rate_flat: 3, // %
      dividend_yield: 2, // %
    },
    volatilityScheme: {
      annualized_sigma: 0.3, // fraction
      heston_params: null,
      jump_params: null,
    },
    simulationConfig: {
      num_paths: 50000,
      steps_per_year: 12,
      time_horizon_years: 4,
      antithetic_variates: true,
    },
    conditions: [],
    vestingTranches: [{ sort_order: 1, vesting_date: '2030-01-01', percentage_of_award: 100 }],
    ...overrides,
  };
}

function makeMarketCondition(metric: string, overrides: Record<string, unknown> = {}) {
  return {
    condition_type: 'MARKET',
    market_metric_type: metric,
    weight: 1.0,
    measurement_period_years: 4,
    comparison_method: 'WEIGHTED_AVERAGE',
    reference_index: null,
    reference_index_display_name: null,
    reference_index_s0: null,
    reference_index_sigma: null,
    reference_index_correlation: null,
    reference_index_dividend_yield: null,
    start_price_method: 'LIVE',
    start_fixed_price: null,
    start_averaging_days: null,
    end_price_method: 'LIVE',
    end_fixed_price: null,
    end_averaging_days: null,
    peer_group: null,
    weighted_peer_groups: null,
    acquisition_scale: {
      mode: 'CURVE' as const,
      points: [
        { threshold: -10, acquisition: 0 },
        { threshold: 0, acquisition: 50 },
        { threshold: 20, acquisition: 100 },
      ],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. shouldUseMonteCarlo (V2 — sans critère multi-tranches)
// ---------------------------------------------------------------------------

describe('shouldUseMonteCarlo (V2)', () => {
  it('false : plan AGA simple sans condition, 1 tranche', () => {
    const ctx = makeMinimalContext();
    expect(shouldUseMonteCarlo(ctx)).toBe(false);
  });

  it('false : plan AGA multi-tranches (4) SANS condition de marché', () => {
    // V2 — critère hasMultipleTranches retiré → pas besoin de MC
    // Le moteur Python (l. 358-407) gère multi-tranches en BS analytique pur
    const ctx = makeMinimalContext({
      vestingTranches: [
        { sort_order: 1, vesting_date: '2027-01-01', percentage_of_award: 25 },
        { sort_order: 2, vesting_date: '2028-01-01', percentage_of_award: 25 },
        { sort_order: 3, vesting_date: '2029-01-01', percentage_of_award: 25 },
        { sort_order: 4, vesting_date: '2030-01-01', percentage_of_award: 25 },
      ],
    });
    expect(shouldUseMonteCarlo(ctx)).toBe(false);
  });

  it('false : plan avec uniquement des conditions NON_MARKET (EBITDA)', () => {
    const ctx = makeMinimalContext({
      conditions: [
        {
          ...makeMarketCondition('EBITDA'),
          condition_type: 'NON_MARKET', // EBITDA = non-market
          market_metric_type: null,
        },
      ],
    });
    expect(shouldUseMonteCarlo(ctx)).toBe(false);
  });

  it('true : plan avec une condition TSR_REL_INDEX', () => {
    const ctx = makeMinimalContext({
      conditions: [makeMarketCondition('TSR_REL_INDEX')],
    });
    expect(shouldUseMonteCarlo(ctx)).toBe(true);
  });

  it('true : mix MARKET + NON_MARKET → MC (le NON_MARKET devient un facteur multiplicatif)', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('SHARE_PRICE'),
        {
          ...makeMarketCondition('EBITDA'),
          condition_type: 'NON_MARKET',
          market_metric_type: null,
        },
      ],
    });
    expect(shouldUseMonteCarlo(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. mapPeerToMoteur (V2 — Pydantic-compatibility)
// ---------------------------------------------------------------------------

describe('mapPeerToMoteur (V2)', () => {
  const validPeer: PeerCompany = {
    id: 'apple-id',
    name: 'Apple Inc.',
    ticker: 'AAPL.US',
    weight: 25,
    s0: 175.2,
    volatility: 0.28,
    correlationWithMain: 0.65,
  };

  it('renvoie le format Pydantic strict (S0/sigma/correlation)', () => {
    const result = mapPeerToMoteur(validPeer, true);
    expect(result.S0).toBe(175.2);
    expect(result.sigma).toBe(0.28);
    expect(result.correlation).toBe(0.65);
    expect(result.dividend_yield).toBe(0); // forcé à 0 (adjusted_close)
  });

  it('uppercase S0 — pas s0', () => {
    const result = mapPeerToMoteur(validPeer, true);
    expect(result).toHaveProperty('S0');
    expect(result).not.toHaveProperty('s0');
  });

  it('sigma — pas volatility', () => {
    const result = mapPeerToMoteur(validPeer, true);
    expect(result).toHaveProperty('sigma');
    expect(result).not.toHaveProperty('volatility');
  });

  it('correlation — pas correlationWithMain', () => {
    const result = mapPeerToMoteur(validPeer, true);
    expect(result).toHaveProperty('correlation');
    expect(result).not.toHaveProperty('correlationWithMain');
  });

  it('forceATM=true → initial_reference_price = peer.s0 (V4.2 ATM symmetric)', () => {
    const result = mapPeerToMoteur(validPeer, true);
    expect(result.initial_reference_price).toBe(175.2);
  });

  it('throw si peer.s0 manquant (avec ticker dans le message)', () => {
    const peer: PeerCompany = { ticker: 'INVALID.US', volatility: 0.3 };
    expect(() => mapPeerToMoteur(peer, true)).toThrow(/INVALID\.US/);
    expect(() => mapPeerToMoteur(peer, true)).toThrow(/s0 manquant ou invalide/);
  });

  it('throw si peer.s0 = 0 ou négatif', () => {
    const peer: PeerCompany = { ticker: 'X', s0: 0, volatility: 0.3 };
    expect(() => mapPeerToMoteur(peer, true)).toThrow(/s0 manquant ou invalide/);
  });

  it('throw si peer.volatility manquante', () => {
    const peer: PeerCompany = { ticker: 'X', s0: 100 };
    expect(() => mapPeerToMoteur(peer, true)).toThrow(/volatility manquante/);
  });

  it('normalise volatility en % brut (e.g. 30 → 0.30)', () => {
    const peer: PeerCompany = { ticker: 'X', s0: 100, volatility: 30 };
    const result = mapPeerToMoteur(peer, true);
    expect(result.sigma).toBe(0.3);
  });

  it('correlation optionnelle (peut être undefined → fallback moteur 0.5)', () => {
    const peer: PeerCompany = { ticker: 'X', s0: 100, volatility: 0.3 };
    const result = mapPeerToMoteur(peer, true);
    expect(result.correlation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. TSR_REL_PEERS payload : weighted_peer_groups TOUJOURS wrapper
// ---------------------------------------------------------------------------

describe('TSR_REL_PEERS payload (V2)', () => {
  const validPeers: PeerCompany[] = [
    {
      ticker: 'AAPL.US',
      name: 'Apple',
      weight: 25,
      s0: 175.2,
      volatility: 0.28,
      correlationWithMain: 0.65,
    },
    {
      ticker: 'GOOGL.US',
      name: 'Google',
      weight: 25,
      s0: 140.5,
      volatility: 0.25,
      correlationWithMain: 0.6,
    },
    {
      ticker: 'MSFT.US',
      name: 'Microsoft',
      weight: 25,
      s0: 380.0,
      volatility: 0.24,
      correlationWithMain: 0.7,
    },
    {
      ticker: 'AMZN.US',
      name: 'Amazon',
      weight: 25,
      s0: 145.0,
      volatility: 0.32,
      correlationWithMain: 0.55,
    },
  ];

  it('peer_group flat (mode simple) → wrapped dans weighted_peer_groups[0]', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_PEERS', {
          peer_group: validPeers,
          weighted_peer_groups: null,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;

    expect(cond.weighted_peer_groups).toBeDefined();
    expect(cond.peer_group).toBeUndefined(); // V2 — pas envoyé au top-level
    const wpgs = cond.weighted_peer_groups as Array<{ id: string; peers: unknown[] }>;
    expect(wpgs).toHaveLength(1);
    expect(wpgs[0]!.id).toBe('default');
    expect(wpgs[0]!.peers).toHaveLength(4);
  });

  it('weighted_peer_groups (mode groupé) → préservé tel quel', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_PEERS', {
          peer_group: null,
          weighted_peer_groups: [
            {
              id: 'big-tech',
              name: 'Big Tech',
              weight: 60,
              peers: validPeers.slice(0, 2),
            },
            {
              id: 'cloud',
              name: 'Cloud Players',
              weight: 40,
              peers: validPeers.slice(2),
            },
          ],
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;
    const wpgs = cond.weighted_peer_groups as Array<{
      id: string;
      weight: number;
      peers: unknown[];
    }>;
    expect(wpgs).toHaveLength(2);
    expect(wpgs[0]!.id).toBe('big-tech');
    expect(wpgs[1]!.id).toBe('cloud');
  });

  it('peers convertis en format Pydantic (S0/sigma/correlation uppercase)', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_PEERS', {
          peer_group: validPeers,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;
    const wpgs = cond.weighted_peer_groups as Array<{
      peers: Array<{ S0: number; sigma: number; correlation: number; ticker: string }>;
    }>;

    const apple = wpgs[0]!.peers[0]!;
    expect(apple.S0).toBe(175.2);
    expect(apple.sigma).toBe(0.28);
    expect(apple.correlation).toBe(0.65);
    // Vérifie que les anciens noms ne fuitent pas
    expect(apple).not.toHaveProperty('s0');
    expect(apple).not.toHaveProperty('volatility');
    expect(apple).not.toHaveProperty('correlationWithMain');
  });

  it('throw si un peer du groupe a s0 manquant', () => {
    const badPeers = [...validPeers, { ticker: 'BAD.US' }];
    const ctx = makeMinimalContext({
      conditions: [makeMarketCondition('TSR_REL_PEERS', { peer_group: badPeers })],
    });
    expect(() => buildPythonPayload(ctx)).toThrow(/BAD\.US/);
  });

  it('aucun peer fourni (peer_group null + wpg null) → pas de weighted_peer_groups dans la condition', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_PEERS', {
          peer_group: null,
          weighted_peer_groups: null,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;
    expect(cond.weighted_peer_groups).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. TSR_REL_INDEX payload : index_S0/sigma/correlation depuis colonnes DB
// ---------------------------------------------------------------------------

describe('TSR_REL_INDEX payload (V2)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('avec index data complète → tous les fields envoyés', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_INDEX', {
          reference_index: 'GSPC.INDX',
          reference_index_display_name: 'S&P 500',
          reference_index_s0: 4500,
          reference_index_sigma: 0.18,
          reference_index_correlation: 0.72,
          reference_index_dividend_yield: 0,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;

    expect(cond.index_ticker).toBe('GSPC.INDX');
    expect(cond.index_S0).toBe(4500);
    expect(cond.index_sigma).toBe(0.18);
    expect(cond.correlation).toBe(0.72);
    expect(cond.index_params).toEqual({ name: 'S&P 500', q: 0 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('sigma stocké en % (18) → normalisé à 0.18', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_INDEX', {
          reference_index: 'X',
          reference_index_s0: 100,
          reference_index_sigma: 18, // % brut
          reference_index_correlation: 0.5,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;
    expect(cond.index_sigma).toBe(0.18);
  });

  it('sans index data → 3 warnings + fields absents', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_INDEX', {
          reference_index: 'GSPC.INDX',
          reference_index_s0: null,
          reference_index_sigma: null,
          reference_index_correlation: null,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;

    expect(cond.index_S0).toBeUndefined();
    expect(cond.index_sigma).toBeUndefined();
    expect(cond.correlation).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy.mock.calls[0][0]).toMatch(/reference_index_s0 manquant/);
  });
});

// ---------------------------------------------------------------------------
// 5. Structure générale du payload (parité avec ValuationRequest Pydantic)
// ---------------------------------------------------------------------------

describe('Payload structure (parity with main.py ValuationRequest)', () => {
  it('Plan AGA simple → use_monte_carlo=false, instrument.type=stock', () => {
    const ctx = makeMinimalContext();
    const payload = buildPythonPayload(ctx);

    expect(payload.config.use_monte_carlo).toBe(false);
    expect(payload.instrument.type).toBe('stock');
    expect(payload.instrument.strike).toBe(0);
  });

  it('Plan BSPCE → instrument.type=option avec strike', () => {
    const ctx = makeMinimalContext({
      plan: { id: 'p1', plan_type: 'BSPCE', exercise_price: 80, grant_date: '2026-01-01' },
    });
    const payload = buildPythonPayload(ctx);
    expect(payload.instrument.type).toBe('option');
    expect(payload.instrument.strike).toBe(80);
  });

  it('config.seed = 42 (deterministic IFRS 2 audit)', () => {
    const payload = buildPythonPayload(makeMinimalContext());
    expect(payload.config.seed).toBe(42);
  });

  it('compute_greeks et include_debug_paths au TOP-LEVEL (pas dans config)', () => {
    const payload = buildPythonPayload(makeMinimalContext());
    // Important : ces flags sont au top-level de ValuationRequest, pas dans config
    expect(payload).toHaveProperty('compute_greeks', true);
    expect(payload).toHaveProperty('include_debug_paths', true);
    expect(payload.config).not.toHaveProperty('compute_greeks');
    expect(payload.config).not.toHaveProperty('include_debug_paths');
  });

  it('rate_flat=3 → market.r=0.03 (fraction)', () => {
    const ctx = makeMinimalContext({
      hypothesisSet: { s0: 100, rate_flat: 3, dividend_yield: 2 },
    });
    const payload = buildPythonPayload(ctx);
    expect(payload.market.r).toBe(0.03);
    expect(payload.market.q).toBe(0.02);
  });

  it('rate_flat=0.03 (déjà fraction) → market.r=0.03 inchangé', () => {
    const ctx = makeMinimalContext({
      hypothesisSet: { s0: 100, rate_flat: 0.03, dividend_yield: 0.02 },
    });
    const payload = buildPythonPayload(ctx);
    expect(payload.market.r).toBe(0.03);
    expect(payload.market.q).toBe(0.02);
  });

  it('vesting multi-tranches → ordonné par sort_order, fractions [0,1]', () => {
    const ctx = makeMinimalContext({
      vestingTranches: [
        { sort_order: 2, vesting_date: '2028-01-01', percentage_of_award: 50 },
        { sort_order: 1, vesting_date: '2027-01-01', percentage_of_award: 25 },
        { sort_order: 3, vesting_date: '2029-01-01', percentage_of_award: 25 },
      ],
    });
    const payload = buildPythonPayload(ctx);
    const vs = payload.instrument.vesting_schedule;
    expect(vs).toHaveLength(3);
    // Ordonné par sort_order (1, 2, 3)
    expect(vs[0]!.time).toBeCloseTo(1, 1);
    expect(vs[1]!.time).toBeCloseTo(2, 1);
    expect(vs[2]!.time).toBeCloseTo(3, 1);
    expect(vs[0]!.portion).toBe(0.25);
    expect(vs[1]!.portion).toBe(0.5);
    expect(vs[2]!.portion).toBe(0.25);
  });

  it('throw si S0 manquant', () => {
    const ctx = makeMinimalContext({
      hypothesisSet: { s0: null, rate_flat: 3, dividend_yield: 0 },
    });
    expect(() => buildPythonPayload(ctx)).toThrow(/s0 invalide/);
  });

  it('throw si sigma manquant', () => {
    const ctx = makeMinimalContext({
      volatilityScheme: { annualized_sigma: null, heston_params: null, jump_params: null },
    });
    expect(() => buildPythonPayload(ctx)).toThrow(/annualized_sigma/);
  });
});

// ---------------------------------------------------------------------------
// 6. payout_curve : keys performance_level + vesting_multiplier
// ---------------------------------------------------------------------------

describe('payout_curve format (main.py l. 186-188)', () => {
  it('CURVE mode → keys performance_level + vesting_multiplier', () => {
    const result = convertAcquisitionScale({
      mode: 'CURVE',
      points: [
        { threshold: -10, acquisition: 0 },
        { threshold: 0, acquisition: 50 },
        { threshold: 20, acquisition: 100 },
      ],
    });
    expect(result).toEqual([
      { performance_level: -10, vesting_multiplier: 0 },
      { performance_level: 0, vesting_multiplier: 0.5 },
      { performance_level: 20, vesting_multiplier: 1.0 },
    ]);
  });

  it('TIERS mode → 2 points par palier (matérialise la marche)', () => {
    const result = convertAcquisitionScale({
      mode: 'TIERS',
      tiers: [
        { min: -100, max: 0, acquisition: 0 },
        { min: 0, max: 20, acquisition: 50 },
        { min: 20, max: 100, acquisition: 100 },
      ],
    });
    expect(result).toEqual([
      { performance_level: -100, vesting_multiplier: 0 },
      { performance_level: 0, vesting_multiplier: 0 },
      { performance_level: 0, vesting_multiplier: 0.5 },
      { performance_level: 20, vesting_multiplier: 0.5 },
      { performance_level: 20, vesting_multiplier: 1.0 },
      { performance_level: 100, vesting_multiplier: 1.0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7. ATM symétrique V4.2 (ne doit pas régresser depuis V1)
// ---------------------------------------------------------------------------

describe('ATM symmetric V4.2 (preserved from V1)', () => {
  it('start_price_method=LIVE → initial_reference_price=S0, ref_price_source=ATM_SYMMETRIC', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('SHARE_PRICE', {
          start_price_method: 'LIVE',
          start_fixed_price: null,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;
    expect(cond.initial_reference_price).toBe(100); // = S0
    expect(cond.ref_price_source).toBe('ATM_SYMMETRIC');
  });

  it('start_price_method=FIXED → initial_reference_price=user value, ref_price_source=USER_FIXED', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('SHARE_PRICE', {
          start_price_method: 'FIXED',
          start_fixed_price: 95,
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;
    expect(cond.initial_reference_price).toBe(95);
    expect(cond.ref_price_source).toBe('USER_FIXED');
  });

  it('TSR_REL_PEERS sans FIXED user → forceATM=true → peers initial_reference_price = peer.s0', () => {
    const ctx = makeMinimalContext({
      conditions: [
        makeMarketCondition('TSR_REL_PEERS', {
          start_price_method: 'LIVE',
          peer_group: [{ ticker: 'X.US', s0: 200, volatility: 0.3, correlationWithMain: 0.6 }],
        }),
      ],
    });
    const payload = buildPythonPayload(ctx);
    const cond = payload.conditions[0] as Record<string, unknown>;
    const wpgs = cond.weighted_peer_groups as Array<{
      peers: Array<{ initial_reference_price: number }>;
    }>;
    expect(wpgs[0]!.peers[0]!.initial_reference_price).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 8. convertVestingToFormatV4 (helper pur)
// ---------------------------------------------------------------------------

describe('convertVestingToFormatV4', () => {
  it('1 tranche à T+4y exact → time=4.0', () => {
    const result = convertVestingToFormatV4(
      [{ sort_order: 1, vesting_date: '2030-01-01', percentage_of_award: 100 }],
      '2026-01-01',
    );
    // 4 ans Julian = 4 × 365.25 jours
    expect(result[0]!.time).toBeGreaterThan(3.99);
    expect(result[0]!.time).toBeLessThan(4.01);
    expect(result[0]!.portion).toBe(1);
  });

  it('throw si grant_date invalide', () => {
    expect(() =>
      convertVestingToFormatV4(
        [{ sort_order: 1, vesting_date: '2030-01-01', percentage_of_award: 100 }],
        'not-a-date',
      ),
    ).toThrow(/grant_date invalide/);
  });

  it('throw si vesting_date invalide', () => {
    expect(() =>
      convertVestingToFormatV4(
        [{ sort_order: 1, vesting_date: 'oups', percentage_of_award: 100 }],
        '2026-01-01',
      ),
    ).toThrow(/vesting_date invalide/);
  });
});
