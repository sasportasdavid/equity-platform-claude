import { describe, expect, it } from 'vitest';
import { planWizardSchema, step6Schema } from './plan-wizard';

/**
 * Tests pour planWizardSchema — validations Zod cross-step et garde-fous
 * critiques (year range, vesting cohérence, step6 strict).
 *
 * Le schéma est central : un bug ici fait passer en DB des plans corrompus
 * (cf. memory/module_3a_b5_partial.md : 6 fixes critiques découverts en E2E).
 */

const baseValidPlan = {
  // Step 1
  planType: 'BSPCE' as const,
  // Step 2
  name: 'Plan Test',
  description: 'Plan de test unitaire',
  boardDate: '2026-04-28',
  grantDate: '2026-04-28',
  poolSize: 1000,
  exercisePrice: 1.5,
  // Step 3 — single tranche
  vestingType: 'single' as const,
  singleVestingDate: '2030-04-28',
  // Step 5 — leavers (default sera appliqué)
  leaverRules: {
    resignation: { treatment: 'keep_vested' as const },
    termination_cause: { treatment: 'forfeit_all' as const },
    termination_no_cause: { treatment: 'keep_vested' as const },
    death: { treatment: 'full_accelerate' as const },
    retirement: { treatment: 'keep_vested' as const },
    company_sale: { treatment: 'full_accelerate' as const },
    mutual_agreement: { treatment: 'keep_vested' as const },
    end_of_contract: { treatment: 'keep_vested' as const },
  },
  // Step 6 — valuation
  underlyingPrice: 12,
  volatility: 35,
  riskFreeRate: 3,
  dividendYield: 0,
  timeHorizonYears: 4,
};

describe('planWizardSchema', () => {
  describe('validation OK', () => {
    it('accepte un plan BSPCE single vesting valide', () => {
      const result = planWizardSchema.safeParse(baseValidPlan);
      expect(result.success).toBe(true);
    });
  });

  describe('grantDate / boardDate — year range guard', () => {
    it('rejette grantDate avec année < 1900 (anti-bug E2E « 0002-01-01 »)', () => {
      const result = planWizardSchema.safeParse({
        ...baseValidPlan,
        grantDate: '0002-01-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const grantDateIssue = result.error.issues.find((i) => i.path.includes('grantDate'));
        expect(grantDateIssue).toBeDefined();
      }
    });

    it('rejette grantDate avec année > 2100', () => {
      const result = planWizardSchema.safeParse({
        ...baseValidPlan,
        grantDate: '2200-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('accepte grantDate dans [1900, 2100]', () => {
      // singleVestingDate doit rester strictement > grantDate (cross-step
      // check), donc on l'ajuste aux extrêmes pour isoler le test du year
      // range.
      expect(
        planWizardSchema.safeParse({
          ...baseValidPlan,
          grantDate: '1950-06-15',
          singleVestingDate: '1955-06-15',
        }).success,
      ).toBe(true);
      expect(
        planWizardSchema.safeParse({
          ...baseValidPlan,
          grantDate: '2090-06-15',
          singleVestingDate: '2095-06-15',
        }).success,
      ).toBe(true);
    });
  });

  describe('vesting cross-step validation', () => {
    it('rejette singleVestingDate <= grantDate', () => {
      const result = planWizardSchema.safeParse({
        ...baseValidPlan,
        grantDate: '2026-04-28',
        singleVestingDate: '2026-04-28', // même date → fail
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('singleVestingDate'))).toBe(true);
      }
    });

    it('rejette tranches dont la somme des % ≠ 100', () => {
      const result = planWizardSchema.safeParse({
        ...baseValidPlan,
        vestingType: 'tranches',
        singleVestingDate: undefined,
        vestingTranches: [
          { vesting_date: '2027-01-01', percentage: 30 },
          { vesting_date: '2028-01-01', percentage: 30 },
          { vesting_date: '2029-01-01', percentage: 30 }, // total = 90 ≠ 100
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejette cliff_linear avec cliffMonths > totalMonths', () => {
      const result = planWizardSchema.safeParse({
        ...baseValidPlan,
        vestingType: 'cliff_linear',
        singleVestingDate: undefined,
        cliffMonths: 24,
        cliffPercentage: 25,
        totalMonths: 12, // < cliffMonths → fail
        frequency: 'monthly',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('step6Schema (strict guard)', () => {
  /**
   * step6Schema est utilisé par createPlan (Server Action) APRÈS le partial
   * planWizardSchema, pour bloquer les drafts incomplets au submit final.
   * Cf. memory/module_3a_b5_partial.md fix #6.
   */

  const validStep6 = {
    underlyingPrice: 12,
    volatility: 35,
    riskFreeRate: 3,
    dividendYield: 0,
    timeHorizonYears: 4,
  };

  it('accepte les inputs valides', () => {
    expect(step6Schema.safeParse(validStep6).success).toBe(true);
  });

  it('rejette si volatility manquant (anti-bug NULL en DB)', () => {
    const { volatility, ...withoutVol } = validStep6;
    void volatility;
    const result = step6Schema.safeParse(withoutVol);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('volatility'))).toBe(true);
    }
  });

  it('rejette si volatility = 0 (hors range)', () => {
    const result = step6Schema.safeParse({ ...validStep6, volatility: 0 });
    expect(result.success).toBe(false);
  });

  it('rejette si timeHorizonYears = 0', () => {
    const result = step6Schema.safeParse({ ...validStep6, timeHorizonYears: 0 });
    expect(result.success).toBe(false);
  });

  it('applique les defaults sur champs optionnels', () => {
    const result = step6Schema.safeParse(validStep6);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.volMethod).toBe('MANUAL');
      expect(result.data.currency).toBe('EUR');
      expect(result.data.useAntithetic).toBe(true);
      expect(result.data.numPaths).toBe(50000);
    }
  });
});
