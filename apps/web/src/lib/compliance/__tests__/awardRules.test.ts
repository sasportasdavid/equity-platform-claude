import { describe, expect, it } from 'vitest';
import {
  AGA_30_PERCENT_CAP,
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
