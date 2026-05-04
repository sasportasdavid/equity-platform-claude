import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 12 B2 — Tests `loadEffectiveRule` + `loadAllEffectiveRules`.
 *
 * Pattern : `vi.hoisted` partage le mock state entre les `vi.mock` factories
 * pour pouvoir muter `mockState.rpcReturn` / `mockState.viewReturn` par test.
 *
 * Note : on ne teste pas le SQL réel (RLS, RPC SECURITY DEFINER), juste
 * la logique TS du helper (parse Zod, fallback null, propagation effective_params).
 */

const { mockState, rpcMock, fromMock } = vi.hoisted(() => {
  const mockState = {
    rpcReturn: { data: null as unknown, error: null as unknown },
    viewReturn: { data: null as unknown[] | null, error: null as unknown },
  };

  const rpcMock = vi.fn();
  const fromMock = vi.fn();

  return { mockState, rpcMock, fromMock };
});

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: (..._args: unknown[]) => {
      rpcMock(..._args);
      return {
        maybeSingle: () =>
          Promise.resolve({
            data: mockState.rpcReturn.data,
            error: mockState.rpcReturn.error,
          }),
      };
    },
    from: (table: string) => {
      fromMock(table);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.order = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: mockState.viewReturn.data,
          error: mockState.viewReturn.error,
        }).then(resolve);
      return builder;
    },
  }),
}));

import { loadAllEffectiveRules, loadEffectiveRule } from '../effectiveRules';

beforeEach(() => {
  rpcMock.mockClear();
  fromMock.mockClear();
  mockState.rpcReturn = { data: null, error: null };
  mockState.viewReturn = { data: null, error: null };
});

// ===========================================================================
// loadEffectiveRule — 6 tests
// ===========================================================================

describe('loadEffectiveRule', () => {
  it('happy path : rule sans override → defaults DB retournés', async () => {
    mockState.rpcReturn = {
      data: {
        rule_code: 'VALUATION_STALE_BLOCKING',
        scope: 'valuation',
        is_active: true,
        effective_severity: 'error',
        effective_params: { staleDays: 90 },
        cta_url_template: '/dashboard/plans/{planId}/valuations',
      },
      error: null,
    };
    const rule = await loadEffectiveRule('VALUATION_STALE_BLOCKING');
    expect(rule).not.toBeNull();
    expect(rule?.is_active).toBe(true);
    expect(rule?.effective_params.staleDays).toBe(90);
    expect(rpcMock).toHaveBeenCalledWith('get_effective_rule', {
      p_rule_code: 'VALUATION_STALE_BLOCKING',
    });
  });

  it('rule avec override → params merged retournés (staleDays=60)', async () => {
    mockState.rpcReturn = {
      data: {
        rule_code: 'VALUATION_STALE_BLOCKING',
        scope: 'valuation',
        is_active: true,
        effective_severity: 'error',
        effective_params: { staleDays: 60 },
        cta_url_template: null,
      },
      error: null,
    };
    const rule = await loadEffectiveRule('VALUATION_STALE_BLOCKING');
    expect(rule?.effective_params.staleDays).toBe(60);
  });

  it('rule désactivée par org → is_active=false', async () => {
    mockState.rpcReturn = {
      data: {
        rule_code: 'FMV_DEVIATION_WARNING',
        scope: 'valuation',
        is_active: false,
        effective_severity: 'warning',
        effective_params: { deviationPct: 20 },
        cta_url_template: null,
      },
      error: null,
    };
    const rule = await loadEffectiveRule('FMV_DEVIATION_WARNING');
    expect(rule?.is_active).toBe(false);
  });

  it('RPC retourne null (rule inconnue / aucune org active) → null', async () => {
    mockState.rpcReturn = { data: null, error: null };
    const rule = await loadEffectiveRule('VALUATION_STALE_BLOCKING');
    expect(rule).toBeNull();
  });

  it('RPC retourne erreur → null + warning console', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockState.rpcReturn = { data: null, error: { message: 'permission denied' } };
    const rule = await loadEffectiveRule('VALUATION_STALE_BLOCKING');
    expect(rule).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('RPC retourne shape invalide (severity invalide) → null + warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockState.rpcReturn = {
      data: {
        rule_code: 'VALUATION_STALE_BLOCKING',
        scope: 'valuation',
        is_active: true,
        effective_severity: 'BLOCKING', // invalide (pas dans enum error|warning)
        effective_params: {},
        cta_url_template: null,
      },
      error: null,
    };
    const rule = await loadEffectiveRule('VALUATION_STALE_BLOCKING');
    expect(rule).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ===========================================================================
// loadAllEffectiveRules — 4 tests
// ===========================================================================

describe('loadAllEffectiveRules', () => {
  function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      rule_code: 'VALUATION_STALE_BLOCKING',
      scope: 'valuation',
      description_fr: 'Valorisation IFRS 2 datée de moins de N jours obligatoire',
      description_en: null,
      is_active: true,
      effective_severity: 'error',
      severity_default: 'error',
      is_severity_overridable: false,
      effective_params: { staleDays: 90 },
      params_schema: {
        staleDays: {
          type: 'integer',
          min: 30,
          max: 365,
          default: 90,
          label_fr: 'Seuil',
        },
      },
      default_params: { staleDays: 90 },
      cta_url_template: '/dashboard/plans/{planId}/valuations',
      documentation_url: null,
      is_overridden: false,
      override_notes: null,
      params_override: null,
      override_updated_at: null,
      override_updated_by: null,
      ...overrides,
    };
  }

  it('retourne tableau vide si aucune row', async () => {
    mockState.viewReturn = { data: [], error: null };
    const rules = await loadAllEffectiveRules();
    expect(rules).toEqual([]);
  });

  it('retourne tableau vide si erreur DB', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockState.viewReturn = { data: null, error: { message: 'permission denied' } };
    const rules = await loadAllEffectiveRules();
    expect(rules).toEqual([]);
    warnSpy.mockRestore();
  });

  it('parse 2 rows valides correctement', async () => {
    mockState.viewReturn = {
      data: [
        makeRow(),
        makeRow({ rule_code: 'POOL_AVAILABLE', scope: 'award', effective_params: {} }),
      ],
      error: null,
    };
    const rules = await loadAllEffectiveRules();
    expect(rules).toHaveLength(2);
    expect(rules[0]?.rule_code).toBe('VALUATION_STALE_BLOCKING');
    expect(rules[1]?.rule_code).toBe('POOL_AVAILABLE');
  });

  it('skip silently les rows malformées (continue avec les autres)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockState.viewReturn = {
      data: [
        makeRow(),
        // Row malformée — severity invalide
        makeRow({ rule_code: 'POOL_AVAILABLE', effective_severity: 'BLOCKING' }),
      ],
      error: null,
    };
    const rules = await loadAllEffectiveRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.rule_code).toBe('VALUATION_STALE_BLOCKING');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
