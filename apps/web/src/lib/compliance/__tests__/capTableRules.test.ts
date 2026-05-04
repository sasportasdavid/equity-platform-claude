import { describe, expect, it, vi } from 'vitest';
import {
  CAP_TABLE_RULES,
  ESOP_PERCENT_BEST_PRACTICE,
  POOL_OVER_ALLOCATION,
  ROUND_AMOUNT_CONSISTENCY,
  SHARE_CLASS_CODE_UNIQUE,
} from '../rules/capTableRules';
import { AGA_30_PERCENT_CAP, AGA_APPROACHING_CAP } from '../rules/awardRules';
import type {
  AwardCheckContext,
  AwardCheckInput,
  CapTableCheckContext,
  CapTableCheckInput,
} from '../types';

/**
 * Module 10 B7 — Tests compliance cap table rules.
 *
 * Couvre :
 *  - SHARE_CLASS_CODE_UNIQUE (happy + duplicate)
 *  - ROUND_AMOUNT_CONSISTENCY (happy + 2% mismatch + 0.5% tolerance OK)
 *  - POOL_OVER_ALLOCATION (ESOP poolTotalUnits=0 reject + non-ESOP no-op)
 *  - ESOP_PERCENT_BEST_PRACTICE (5% OK, 3% warn small, 25% warn large)
 *  - AGA_30_PERCENT_CAP (résolution dette #3) : 25% OK, 31% reject, ctx null skip
 *  - AGA_APPROACHING_CAP : 28% warn, 26% no-warn, 31% no-warn (>30% géré par cap)
 */

const baseCtx: CapTableCheckContext = {
  existingShareClassCodes: new Set(),
  companyTotalSharesIncludingPool: null,
};

const baseAwardCtx: AwardCheckContext = {
  plan: { id: 'p1', plan_type: 'AGA', pool_size: 100000, pool_allocated: 0, company_id: 'c1' },
  beneficiary: { id: 'b1', beneficiary_type: 'EMPLOYEE', email: 'a@b.com' },
  poolStatus: { remaining: 100000 },
  agaAllocatedTotal: 0,
  companyTotalShares: 1_000_000,
};

const baseAwardInput: AwardCheckInput = {
  planId: 'p1',
  beneficiaryId: 'b1',
  unitsGranted: 1000,
  grantDate: '2026-01-01',
};

// ---------------------------------------------------------------------------
// SHARE_CLASS_CODE_UNIQUE
// ---------------------------------------------------------------------------

describe('SHARE_CLASS_CODE_UNIQUE', () => {
  it('returns null when code is not in existing set', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'PREF_B',
      classType: 'PREFERRED',
    };
    const ctx = { ...baseCtx, existingShareClassCodes: new Set(['COMMON', 'PREF_A']) };
    const result = await SHARE_CLASS_CODE_UNIQUE.check(input, ctx);
    expect(result).toBeNull();
  });

  it('returns ERROR when code already exists (case-insensitive uppercased)', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'PREF_A',
      classType: 'PREFERRED',
    };
    const ctx = { ...baseCtx, existingShareClassCodes: new Set(['COMMON', 'PREF_A']) };
    const result = await SHARE_CLASS_CODE_UNIQUE.check(input, ctx);
    expect(result?.severity).toBe('ERROR');
    expect(result?.code).toBe('SHARE_CLASS_CODE_DUPLICATE');
  });

  it('skips for non-SHARE_CLASS_CREATE scope', async () => {
    const input: CapTableCheckInput = {
      scope: 'POOL_TOPUP_SCENARIO',
      poolTotalUnits: 5000,
    };
    const result = await SHARE_CLASS_CODE_UNIQUE.check(input, baseCtx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ROUND_AMOUNT_CONSISTENCY
// ---------------------------------------------------------------------------

describe('ROUND_AMOUNT_CONSISTENCY', () => {
  it('passes when sum(investors.amount) ≈ amountRaised within 1%', async () => {
    const input: CapTableCheckInput = {
      scope: 'FUNDING_ROUND_CREATE',
      amountRaised: 1_000_000,
      pricePerShare: 100,
      investors: [
        { amount: 600_000, units: 6000 },
        { amount: 400_000, units: 4000 },
      ],
    };
    const result = await ROUND_AMOUNT_CONSISTENCY.check(input, baseCtx);
    expect(result).toBeNull();
  });

  it('passes when off by 0.5% (within tolerance)', async () => {
    const input: CapTableCheckInput = {
      scope: 'FUNDING_ROUND_CREATE',
      amountRaised: 1_000_000,
      pricePerShare: 100,
      investors: [{ amount: 995_000, units: 10000 }],
    };
    const result = await ROUND_AMOUNT_CONSISTENCY.check(input, baseCtx);
    expect(result).toBeNull();
  });

  it('rejects when off by 2% (over tolerance)', async () => {
    const input: CapTableCheckInput = {
      scope: 'FUNDING_ROUND_CREATE',
      amountRaised: 1_000_000,
      pricePerShare: 100,
      investors: [{ amount: 980_000, units: 10000 }],
    };
    const result = await ROUND_AMOUNT_CONSISTENCY.check(input, baseCtx);
    expect(result?.severity).toBe('ERROR');
    expect(result?.code).toBe('ROUND_AMOUNT_INCONSISTENT');
  });
});

// ---------------------------------------------------------------------------
// POOL_OVER_ALLOCATION
// ---------------------------------------------------------------------------

describe('POOL_OVER_ALLOCATION', () => {
  it('rejects ESOP class with poolTotalUnits=0', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 0,
    };
    const result = await POOL_OVER_ALLOCATION.check(input, baseCtx);
    expect(result?.severity).toBe('ERROR');
  });

  it('rejects ESOP class with poolTotalUnits=null', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: null,
    };
    const result = await POOL_OVER_ALLOCATION.check(input, baseCtx);
    expect(result?.severity).toBe('ERROR');
  });

  it('passes ESOP class with positive poolTotalUnits', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 100000,
    };
    const result = await POOL_OVER_ALLOCATION.check(input, baseCtx);
    expect(result).toBeNull();
  });

  it('skips non-ESOP class even with poolTotalUnits set', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'COMMON',
      classType: 'COMMON',
      poolTotalUnits: 0,
    };
    const result = await POOL_OVER_ALLOCATION.check(input, baseCtx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ESOP_PERCENT_BEST_PRACTICE
// ---------------------------------------------------------------------------

describe('ESOP_PERCENT_BEST_PRACTICE', () => {
  it('passes ESOP at 10% (within 5-20% range)', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 100000,
    };
    const ctx = { ...baseCtx, companyTotalSharesIncludingPool: 1_000_000 };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, ctx);
    expect(result).toBeNull();
  });

  it('warns when ESOP < 5%', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 30000, // 3%
    };
    const ctx = { ...baseCtx, companyTotalSharesIncludingPool: 1_000_000 };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, ctx);
    expect(result?.severity).toBe('WARNING');
    expect(result?.code).toBe('ESOP_TOO_SMALL');
  });

  it('warns when ESOP > 20%', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 250000, // 25%
    };
    const ctx = { ...baseCtx, companyTotalSharesIncludingPool: 1_000_000 };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, ctx);
    expect(result?.severity).toBe('WARNING');
    expect(result?.code).toBe('ESOP_TOO_LARGE');
  });

  it('skips when capTotal is null (early-stage org)', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 100000,
    };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, baseCtx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AGA_30_PERCENT_CAP — résolution dette #3
// ---------------------------------------------------------------------------

describe('AGA_30_PERCENT_CAP — activated B7', () => {
  it('passes at 25% AGA (under 30% cap)', async () => {
    // 200_000 already + 50_000 new = 250_000 / 1_000_000 = 25%
    const ctx = { ...baseAwardCtx, agaAllocatedTotal: 200_000 };
    const input = { ...baseAwardInput, unitsGranted: 50_000 };
    const result = await AGA_30_PERCENT_CAP.check(input, ctx);
    expect(result).toBeNull();
  });

  it('rejects at 31% AGA (over 30% cap)', async () => {
    // 250_000 already + 60_000 new = 310_000 / 1_000_000 = 31%
    const ctx = { ...baseAwardCtx, agaAllocatedTotal: 250_000 };
    const input = { ...baseAwardInput, unitsGranted: 60_000 };
    const result = await AGA_30_PERCENT_CAP.check(input, ctx);
    expect(result?.severity).toBe('ERROR');
    expect(result?.code).toBe('AGA_30_PERCENT_CAP');
    expect(result?.message).toContain('31.0');
  });

  it('passes exactly at 30%', async () => {
    const ctx = { ...baseAwardCtx, agaAllocatedTotal: 250_000 };
    const input = { ...baseAwardInput, unitsGranted: 50_000 };
    const result = await AGA_30_PERCENT_CAP.check(input, ctx);
    expect(result).toBeNull();
  });

  it('skips when companyTotalShares is null (cap table empty)', async () => {
    const ctx = { ...baseAwardCtx, companyTotalShares: null };
    const result = await AGA_30_PERCENT_CAP.check(baseAwardInput, ctx);
    expect(result).toBeNull();
  });

  it('skips when agaAllocatedTotal is null', async () => {
    const ctx = { ...baseAwardCtx, agaAllocatedTotal: null };
    const result = await AGA_30_PERCENT_CAP.check(baseAwardInput, ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AGA_APPROACHING_CAP — soft warning (separated from hard rule)
// ---------------------------------------------------------------------------

describe('AGA_APPROACHING_CAP', () => {
  it('warns at 28% AGA (soft)', async () => {
    const ctx = { ...baseAwardCtx, agaAllocatedTotal: 270_000 };
    const input = { ...baseAwardInput, unitsGranted: 10_000 };
    const result = await AGA_APPROACHING_CAP.check(input, ctx);
    expect(result?.severity).toBe('WARNING');
    expect(result?.code).toBe('AGA_APPROACHING_CAP');
  });

  it('does not warn at 26%', async () => {
    const ctx = { ...baseAwardCtx, agaAllocatedTotal: 250_000 };
    const input = { ...baseAwardInput, unitsGranted: 10_000 };
    const result = await AGA_APPROACHING_CAP.check(input, ctx);
    expect(result).toBeNull();
  });

  it('does not warn at 31% (handled by hard rule)', async () => {
    const ctx = { ...baseAwardCtx, agaAllocatedTotal: 250_000 };
    const input = { ...baseAwardInput, unitsGranted: 60_000 };
    const result = await AGA_APPROACHING_CAP.check(input, ctx);
    expect(result).toBeNull();
  });

  it('skips when ctx is null (cap table empty)', async () => {
    const ctx = { ...baseAwardCtx, companyTotalShares: null };
    const result = await AGA_APPROACHING_CAP.check(baseAwardInput, ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CAP_TABLE_RULES export
// ---------------------------------------------------------------------------

describe('CAP_TABLE_RULES', () => {
  it('exports exactly 4 rules', () => {
    expect(CAP_TABLE_RULES).toHaveLength(4);
    const codes = CAP_TABLE_RULES.map((r) => r.code);
    expect(codes).toContain('SHARE_CLASS_CODE_UNIQUE');
    expect(codes).toContain('ROUND_AMOUNT_CONSISTENCY');
    expect(codes).toContain('POOL_OVER_ALLOCATION');
    expect(codes).toContain('ESOP_PERCENT_BEST_PRACTICE');
  });

  it('has 3 hard rules + 1 soft rule', () => {
    const hard = CAP_TABLE_RULES.filter((r) => r.enforcement === 'hard');
    const soft = CAP_TABLE_RULES.filter((r) => r.enforcement === 'soft');
    expect(hard).toHaveLength(3);
    expect(soft).toHaveLength(1);
  });
});

// ===========================================================================
// Module 12.5 B3 — Lecture des seuils + severity depuis ctx
// ===========================================================================

describe('ROUND_AMOUNT_CONSISTENCY — params dynamiques (Module 12.5 B3)', () => {
  it('utilise tolerancePct=5 (org permissive) — 4 % passe', async () => {
    const input: CapTableCheckInput = {
      scope: 'FUNDING_ROUND_CREATE',
      amountRaised: 1_000_000,
      pricePerShare: 100,
      investors: [{ amount: 960_000, units: 9600 }],
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      effectiveParamsByRule: { ROUND_AMOUNT_CONSISTENCY: { tolerancePct: 5 } },
    };
    const result = await ROUND_AMOUNT_CONSISTENCY.check(input, ctx);
    expect(result).toBeNull();
  });

  it('utilise tolerancePct=0.5 (org strict) — 1 % bloque', async () => {
    const input: CapTableCheckInput = {
      scope: 'FUNDING_ROUND_CREATE',
      amountRaised: 1_000_000,
      pricePerShare: 100,
      investors: [{ amount: 990_000, units: 9900 }],
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      effectiveParamsByRule: { ROUND_AMOUNT_CONSISTENCY: { tolerancePct: 0.5 } },
    };
    const result = await ROUND_AMOUNT_CONSISTENCY.check(input, ctx);
    expect(result?.severity).toBe('ERROR');
    expect(result?.message).toMatch(/±0\.5 %/);
  });

  it('fallback sur 1 % si effectiveParamsByRule absent (DB indispo)', async () => {
    const input: CapTableCheckInput = {
      scope: 'FUNDING_ROUND_CREATE',
      amountRaised: 1_000_000,
      pricePerShare: 100,
      investors: [{ amount: 980_000, units: 9800 }],
    };
    const result = await ROUND_AMOUNT_CONSISTENCY.check(input, baseCtx);
    expect(result?.severity).toBe('ERROR');
    expect(result?.message).toMatch(/±1 %/);
  });
});

describe('ESOP_PERCENT_BEST_PRACTICE — params dynamiques + cross-validation (Module 12.5 B3)', () => {
  it('utilise minPct=8 / maxPct=20 (org custom) — 18 % passe', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 180000, // 18%
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      companyTotalSharesIncludingPool: 1_000_000,
      effectiveParamsByRule: {
        ESOP_PERCENT_BEST_PRACTICE: { minPct: 8, maxPct: 20 },
      },
    };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, ctx);
    expect(result).toBeNull();
  });

  it('utilise default 5/15 — 18 % émet WARNING ESOP_TOO_LARGE', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 180000, // 18%
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      companyTotalSharesIncludingPool: 1_000_000,
    };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, ctx);
    expect(result?.code).toBe('ESOP_TOO_LARGE');
    expect(result?.message).toMatch(/5–15 % recommandé/);
  });

  it('cross-validation : minPct >= maxPct → fallback aux defaults + warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 100000, // 10% — dans les defaults (5-15) mais hors d'une éventuelle config invalide
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      companyTotalSharesIncludingPool: 1_000_000,
      effectiveParamsByRule: {
        ESOP_PERCENT_BEST_PRACTICE: { minPct: 25, maxPct: 10 }, // INVALIDE
      },
    };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, ctx);
    // 10 % est dans la fourchette default 5-15 → null après fallback
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('config invalide'));
    warnSpy.mockRestore();
  });

  it('respecte severity DB error au lieu de WARNING par défaut', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 30000, // 3%
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      companyTotalSharesIncludingPool: 1_000_000,
      effectiveSeverityByRule: { ESOP_PERCENT_BEST_PRACTICE: 'error' },
    };
    const result = await ESOP_PERCENT_BEST_PRACTICE.check(input, ctx);
    expect(result?.severity).toBe('ERROR');
    expect(result?.code).toBe('ESOP_TOO_SMALL');
  });
});

describe('SHARE_CLASS_CODE_UNIQUE / POOL_OVER_ALLOCATION — severity dynamique (Module 12.5 B3)', () => {
  it('SHARE_CLASS_CODE_UNIQUE respecte severity DB warning', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'PREF_A',
      classType: 'PREFERRED',
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      existingShareClassCodes: new Set(['PREF_A']),
      effectiveSeverityByRule: { SHARE_CLASS_CODE_UNIQUE: 'warning' },
    };
    const result = await SHARE_CLASS_CODE_UNIQUE.check(input, ctx);
    expect(result?.severity).toBe('WARNING');
  });

  it('POOL_OVER_ALLOCATION respecte severity DB warning', async () => {
    const input: CapTableCheckInput = {
      scope: 'SHARE_CLASS_CREATE',
      code: 'ESOP',
      classType: 'ESOP',
      poolTotalUnits: 0,
    };
    const ctx: CapTableCheckContext = {
      ...baseCtx,
      effectiveSeverityByRule: { POOL_OVER_ALLOCATION: 'warning' },
    };
    const result = await POOL_OVER_ALLOCATION.check(input, ctx);
    expect(result?.severity).toBe('WARNING');
  });
});
