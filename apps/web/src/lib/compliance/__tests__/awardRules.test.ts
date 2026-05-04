import { describe, expect, it } from 'vitest';
import {
  AGA_30_PERCENT_CAP,
  AGA_APPROACHING_CAP,
  BSPCE_BENEFICIARY_TYPE,
  GRANT_DATE_RECENT,
  POOL_AVAILABLE,
} from '../rules/awardRules';
import type { AwardCheckContext, AwardCheckInput } from '../types';

const baseInput: AwardCheckInput = {
  planId: 'plan-uuid',
  beneficiaryId: 'ben-uuid',
  unitsGranted: 100,
  grantDate: new Date().toISOString().slice(0, 10),
};

function makeCtx(overrides: Partial<AwardCheckContext>): AwardCheckContext {
  return {
    plan: {
      id: 'plan-uuid',
      plan_type: 'BSPCE',
      pool_size: 10000,
      pool_allocated: 1000,
      company_id: 'co-uuid',
    },
    beneficiary: {
      id: 'ben-uuid',
      beneficiary_type: 'EMPLOYEE',
      email: 'employee@example.com',
    },
    poolStatus: { remaining: 9000 },
    agaAllocatedTotal: null,
    companyTotalShares: null,
    ...overrides,
  };
}

describe('BSPCE_BENEFICIARY_TYPE', () => {
  it('returns null pour un EMPLOYEE sur BSPCE', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE.check(baseInput, makeCtx({}));
    expect(issue).toBeNull();
  });

  it('returns null pour un OFFICER sur BSPCE', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE.check(
      baseInput,
      makeCtx({
        beneficiary: { id: 'b', beneficiary_type: 'OFFICER', email: 'o@example.com' },
      }),
    );
    expect(issue).toBeNull();
  });

  it('returns ERROR pour CONSULTANT sur BSPCE', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE.check(
      baseInput,
      makeCtx({
        beneficiary: { id: 'b', beneficiary_type: 'CONSULTANT', email: 'c@example.com' },
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('BSPCE_BENEFICIARY_TYPE');
    expect(issue?.suggestedAction).toMatch(/BSA/);
  });

  it('rule a appliesTo limité à BSPCE (le caller filtre, mais on documente le contrat)', () => {
    expect(BSPCE_BENEFICIARY_TYPE.appliesTo).toEqual(['BSPCE']);
    expect(BSPCE_BENEFICIARY_TYPE.enforcement).toBe('hard');
  });
});

describe('AGA_30_PERCENT_CAP', () => {
  it('returns null si companyTotalShares manquant (V1 stub Module 10)', async () => {
    const issue = await AGA_30_PERCENT_CAP.check(
      baseInput,
      makeCtx({ plan: { ...makeCtx({}).plan, plan_type: 'AGA' }, agaAllocatedTotal: 5000 }),
    );
    expect(issue).toBeNull();
  });

  it('returns null si 25 % cumulé après attribution', async () => {
    const issue = await AGA_30_PERCENT_CAP.check(
      { ...baseInput, unitsGranted: 5000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 25 000 / 100 000 = 25 %
        companyTotalShares: 100_000,
      }),
    );
    expect(issue).toBeNull();
  });

  it('returns ERROR si > 30 % cumulé', async () => {
    const issue = await AGA_30_PERCENT_CAP.check(
      { ...baseInput, unitsGranted: 15_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 35 000 / 100 000 = 35 %
        companyTotalShares: 100_000,
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/35\.0 %/);
  });
});

describe('POOL_AVAILABLE', () => {
  it('returns null si pool restant >= units demandées', async () => {
    const issue = await POOL_AVAILABLE.check(
      { ...baseInput, unitsGranted: 100 },
      makeCtx({ poolStatus: { remaining: 1000 } }),
    );
    expect(issue).toBeNull();
  });

  it('returns ERROR si pool insuffisant', async () => {
    const issue = await POOL_AVAILABLE.check(
      { ...baseInput, unitsGranted: 500 },
      makeCtx({ poolStatus: { remaining: 100 } }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/Pool insuffisant/);
    expect(issue?.message).toMatch(/100/);
    expect(issue?.message).toMatch(/500/);
  });

  it('returns null pile au seuil (pool == units)', async () => {
    const issue = await POOL_AVAILABLE.check(
      { ...baseInput, unitsGranted: 100 },
      makeCtx({ poolStatus: { remaining: 100 } }),
    );
    expect(issue).toBeNull();
  });
});

describe('GRANT_DATE_RECENT', () => {
  it("returns null pour grantDate aujourd'hui", async () => {
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: new Date().toISOString().slice(0, 10) },
      makeCtx({}),
    );
    expect(issue).toBeNull();
  });

  it('returns null pour grantDate il y a 25 jours', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 25);
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: d.toISOString().slice(0, 10) },
      makeCtx({}),
    );
    expect(issue).toBeNull();
  });

  it('returns WARNING (pas ERROR) pour grantDate il y a 35 jours', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 35);
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: d.toISOString().slice(0, 10) },
      makeCtx({}),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('GRANT_DATE_RECENT');
    // 35 ou 36 jours selon timezone/heure courante — Math.round + UTC offset
    expect(issue?.message).toMatch(/3[56] jours/);
  });

  it('returns WARNING même pour 100 jours (rule soft, severity reste WARNING)', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 100);
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: d.toISOString().slice(0, 10) },
      makeCtx({}),
    );
    expect(issue?.severity).toBe('WARNING');
  });

  it("rule enforcement = soft (n'est jamais ERROR)", () => {
    expect(GRANT_DATE_RECENT.enforcement).toBe('soft');
  });
});

// ===========================================================================
// Module 12.5 B1 — Lecture des seuils + severity depuis ctx
// ===========================================================================

describe('AGA_30_PERCENT_CAP — params dynamiques (Module 12.5 B1)', () => {
  it('utilise capPct=20 du ctx (org strict) — 25 % bloque', async () => {
    const issue = await AGA_30_PERCENT_CAP.check(
      { ...baseInput, unitsGranted: 5_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 25 / 100 = 25 %
        companyTotalShares: 100_000,
        effectiveParamsByRule: { AGA_30_PERCENT_CAP: { capPct: 20 } },
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/25\.0 %/);
    expect(issue?.message).toMatch(/max légal 20 %/);
  });

  it('utilise capPct=40 (org permissive) — 35 % passe', async () => {
    const issue = await AGA_30_PERCENT_CAP.check(
      { ...baseInput, unitsGranted: 15_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 35 / 100 = 35 %
        companyTotalShares: 100_000,
        effectiveParamsByRule: { AGA_30_PERCENT_CAP: { capPct: 40 } },
      }),
    );
    expect(issue).toBeNull();
  });

  it('fallback sur 30 % si effectiveParamsByRule absent (DB indispo)', async () => {
    const issue = await AGA_30_PERCENT_CAP.check(
      { ...baseInput, unitsGranted: 15_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 35 %
        companyTotalShares: 100_000,
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.message).toMatch(/max légal 30 %/);
  });

  it('respecte severity DB warning au lieu de ERROR par défaut', async () => {
    const issue = await AGA_30_PERCENT_CAP.check(
      { ...baseInput, unitsGranted: 15_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000,
        companyTotalShares: 100_000,
        effectiveSeverityByRule: { AGA_30_PERCENT_CAP: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
  });
});

describe('AGA_APPROACHING_CAP — params dynamiques (Module 12.5 B1)', () => {
  it('utilise warningPct=20 du ctx — 25 % émet le warning', async () => {
    const issue = await AGA_APPROACHING_CAP.check(
      { ...baseInput, unitsGranted: 5_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 25 %
        companyTotalShares: 100_000,
        effectiveParamsByRule: { AGA_APPROACHING_CAP: { warningPct: 20 } },
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('AGA_APPROACHING_CAP');
  });

  it('retourne null si pct > capPct (zone géré par AGA_30_PERCENT_CAP hard)', async () => {
    const issue = await AGA_APPROACHING_CAP.check(
      { ...baseInput, unitsGranted: 15_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 35 % > 30
        companyTotalShares: 100_000,
      }),
    );
    expect(issue).toBeNull();
  });

  it('messages affichent le capPct effectif (org cap personnalisé 25 %)', async () => {
    const issue = await AGA_APPROACHING_CAP.check(
      { ...baseInput, unitsGranted: 3_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 23 %
        companyTotalShares: 100_000,
        effectiveParamsByRule: {
          AGA_30_PERCENT_CAP: { capPct: 25 },
          AGA_APPROACHING_CAP: { warningPct: 22 },
        },
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.message).toMatch(/max légal 25 %/);
  });

  it('fallback default 27 % si params absent — 28 % émet warning', async () => {
    const issue = await AGA_APPROACHING_CAP.check(
      { ...baseInput, unitsGranted: 8_000 },
      makeCtx({
        plan: { ...makeCtx({}).plan, plan_type: 'AGA' },
        agaAllocatedTotal: 20_000, // 28 %
        companyTotalShares: 100_000,
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('WARNING');
  });
});

describe('GRANT_DATE_RECENT — params dynamiques (Module 12.5 B1)', () => {
  it('utilise maxDaysAgo=7 (org strict) — 10j émet warning', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: d.toISOString().slice(0, 10) },
      makeCtx({
        effectiveParamsByRule: { GRANT_DATE_RECENT: { maxDaysAgo: 7 } },
      }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.message).toMatch(/seuil 7 jours/);
  });

  it('utilise maxDaysAgo=90 (org permissive) — 35j passe', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 35);
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: d.toISOString().slice(0, 10) },
      makeCtx({
        effectiveParamsByRule: { GRANT_DATE_RECENT: { maxDaysAgo: 90 } },
      }),
    );
    expect(issue).toBeNull();
  });

  it('fallback default 30 jours si params absent', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 35);
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: d.toISOString().slice(0, 10) },
      makeCtx({}),
    );
    expect(issue).not.toBeNull();
    expect(issue?.message).toMatch(/seuil 30 jours/);
  });

  it('respecte severity DB error au lieu de WARNING par défaut', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 35);
    const issue = await GRANT_DATE_RECENT.check(
      { ...baseInput, grantDate: d.toISOString().slice(0, 10) },
      makeCtx({
        effectiveSeverityByRule: { GRANT_DATE_RECENT: 'error' },
      }),
    );
    expect(issue?.severity).toBe('ERROR');
  });
});

describe('BSPCE_BENEFICIARY_TYPE — severity dynamique (Module 12.5 B1)', () => {
  it('respecte severity DB warning au lieu de ERROR par défaut', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE.check(
      baseInput,
      makeCtx({
        beneficiary: { id: 'b', beneficiary_type: 'CONSULTANT', email: 'c@example.com' },
        effectiveSeverityByRule: { BSPCE_BENEFICIARY_TYPE: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('BSPCE_BENEFICIARY_TYPE');
  });
});

describe('POOL_AVAILABLE — severity dynamique (Module 12.5 B1)', () => {
  it('respecte severity DB warning (admin downgrade)', async () => {
    const issue = await POOL_AVAILABLE.check(
      { ...baseInput, unitsGranted: 500 },
      makeCtx({
        poolStatus: { remaining: 100 },
        effectiveSeverityByRule: { POOL_AVAILABLE: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('POOL_AVAILABLE');
  });
});
