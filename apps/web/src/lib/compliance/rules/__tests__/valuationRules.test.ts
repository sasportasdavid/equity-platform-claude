import { describe, expect, it } from 'vitest';
import {
  FMV_DEVIATION_WARNING,
  VALUATION_RULES,
  VALUATION_STALE_BLOCKING,
} from '../valuationRules';
import type { ValuationCheckContext, ValuationCheckInput } from '../../types';

/**
 * Module 11 B6 — Tests des compliance rules valuation.
 *
 * Couvre :
 *   - VALUATION_STALE_BLOCKING : pas de run, run frais, run pile à 90j,
 *     run >90j, run avec completedAt malformé
 *   - FMV_DEVIATION_WARNING : pas d'historique, run unique, déviation 5%,
 *     déviation 25%, fvPrevious=0, fv null
 *
 * Pattern : pure functions — ctx forgé directement, pas de mock Supabase.
 * Le ctx loader est testé séparément en intégration via runChecks.
 */

const INPUT: ValuationCheckInput = {
  scope: 'AWARD_TRANSITION',
  planId: '11111111-1111-4111-8111-111111111111',
};

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('VALUATION_STALE_BLOCKING', () => {
  it('retourne ERROR si pas de valorisation (latestRun null)', async () => {
    const ctx: ValuationCheckContext = { latestRun: null, previousRun: null };
    const issue = await VALUATION_STALE_BLOCKING.check(INPUT, ctx);
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('VALUATION_STALE_BLOCKING');
    expect(issue?.message).toMatch(/Aucune valorisation/i);
  });

  it('retourne null si run très récent (1 jour)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 10 },
      previousRun: null,
    };
    const issue = await VALUATION_STALE_BLOCKING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });

  it('retourne null à exactement 90 jours (edge inclusif)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(90), fairValuePerUnit: 10 },
      previousRun: null,
    };
    const issue = await VALUATION_STALE_BLOCKING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });

  it('retourne ERROR à 91 jours (edge exclusif)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(91), fairValuePerUnit: 10 },
      previousRun: null,
    };
    const issue = await VALUATION_STALE_BLOCKING.check(INPUT, ctx);
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/91 jours/);
  });

  it('retourne ERROR à 200 jours (clairement périmé)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(200), fairValuePerUnit: 10 },
      previousRun: null,
    };
    const issue = await VALUATION_STALE_BLOCKING.check(INPUT, ctx);
    expect(issue).not.toBeNull();
    expect(issue?.code).toBe('VALUATION_STALE_BLOCKING');
  });

  it('retourne null si completedAt malformé (pas une date parsable)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: 'not-a-date', fairValuePerUnit: 10 },
      previousRun: null,
    };
    const issue = await VALUATION_STALE_BLOCKING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });
});

describe('FMV_DEVIATION_WARNING', () => {
  it("retourne null sans previousRun (pas d'historique)", async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 10 },
      previousRun: null,
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });

  it('retourne null si déviation <20% (5%)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 10.5 },
      previousRun: { runId: 'r0', completedAt: daysAgo(30), fairValuePerUnit: 10 },
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });

  it('retourne null à exactement 20% (edge inclusif)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 12 },
      previousRun: { runId: 'r0', completedAt: daysAgo(30), fairValuePerUnit: 10 },
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });

  it('retourne WARNING à 25% de hausse', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 12.5 },
      previousRun: { runId: 'r0', completedAt: daysAgo(30), fairValuePerUnit: 10 },
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('FMV_DEVIATION_WARNING');
    expect(issue?.message).toMatch(/25\.0 %/);
  });

  it('retourne WARNING à 25% de baisse (déviation absolue)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 7.5 },
      previousRun: { runId: 'r0', completedAt: daysAgo(30), fairValuePerUnit: 10 },
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('WARNING');
  });

  it('retourne null si fvPrevious=0 (division par zéro)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 10 },
      previousRun: { runId: 'r0', completedAt: daysAgo(30), fairValuePerUnit: 0 },
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });

  it('retourne null si fvLatest est null (no-op)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: null },
      previousRun: { runId: 'r0', completedAt: daysAgo(30), fairValuePerUnit: 10 },
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });

  it('retourne null si fvPrevious est null (no-op)', async () => {
    const ctx: ValuationCheckContext = {
      latestRun: { runId: 'r1', completedAt: daysAgo(1), fairValuePerUnit: 10 },
      previousRun: { runId: 'r0', completedAt: daysAgo(30), fairValuePerUnit: null },
    };
    const issue = await FMV_DEVIATION_WARNING.check(INPUT, ctx);
    expect(issue).toBeNull();
  });
});

describe('VALUATION_RULES (registry)', () => {
  it("contient les 2 rules attendues dans l'ordre canonique", () => {
    expect(VALUATION_RULES).toHaveLength(2);
    expect(VALUATION_RULES[0]?.code).toBe('VALUATION_STALE_BLOCKING');
    expect(VALUATION_RULES[1]?.code).toBe('FMV_DEVIATION_WARNING');
  });

  it('a une rule hard et une rule soft', () => {
    const hardCount = VALUATION_RULES.filter((r) => r.enforcement === 'hard').length;
    const softCount = VALUATION_RULES.filter((r) => r.enforcement === 'soft').length;
    expect(hardCount).toBe(1);
    expect(softCount).toBe(1);
  });

  it("toutes les rules ont appliesTo=['*'] (V1 — pas de gating plan_type)", () => {
    for (const rule of VALUATION_RULES) {
      expect(rule.appliesTo).toEqual(['*']);
    }
  });
});
