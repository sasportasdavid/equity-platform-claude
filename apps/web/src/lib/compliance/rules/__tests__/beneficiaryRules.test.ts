import { describe, expect, it } from 'vitest';
import {
  BSPCE_BENEFICIARY_TYPE_REVERSE,
  EMAIL_UNIQUE_IN_ORG,
  HIRE_DATE_REASONABLE,
  IBAN_FORMAT,
  MANAGER_NOT_SELF,
  TAX_RESIDENCE_FRANCE_CONSISTENCY,
} from '../beneficiaryRules';
import type { BeneficiaryCheckContext, BeneficiaryCheckInput } from '../../types';

const baseInput: BeneficiaryCheckInput = {
  id: null,
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  beneficiaryType: 'EMPLOYEE',
  taxResidence: 'FR',
  isTaxResidentFrance: true,
};

function makeCtx(overrides: Partial<BeneficiaryCheckContext> = {}): BeneficiaryCheckContext {
  return { orgId: 'org-uuid', emailCollisionId: null, beneficiary: null, ...overrides };
}

describe('EMAIL_UNIQUE_IN_ORG', () => {
  it('returns null si pas de collision', async () => {
    const issue = await EMAIL_UNIQUE_IN_ORG.check(baseInput, makeCtx());
    expect(issue).toBeNull();
  });

  it('returns ERROR si collision intra-org sur autre id', async () => {
    const issue = await EMAIL_UNIQUE_IN_ORG.check(
      baseInput,
      makeCtx({ emailCollisionId: 'other-id' }),
    );
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('EMAIL_UNIQUE_IN_ORG');
  });

  it('returns null si collision sur soi-même (update du même row)', async () => {
    const issue = await EMAIL_UNIQUE_IN_ORG.check(
      { ...baseInput, id: 'me-id' },
      makeCtx({ emailCollisionId: 'me-id' }),
    );
    expect(issue).toBeNull();
  });
});

describe('TAX_RESIDENCE_FRANCE_CONSISTENCY', () => {
  it('FR + isFR=true → null', async () => {
    const issue = await TAX_RESIDENCE_FRANCE_CONSISTENCY.check(
      { ...baseInput, taxResidence: 'FR', isTaxResidentFrance: true },
      makeCtx(),
    );
    expect(issue).toBeNull();
  });

  it('UK + isFR=true → ERROR', async () => {
    const issue = await TAX_RESIDENCE_FRANCE_CONSISTENCY.check(
      { ...baseInput, taxResidence: 'UK', isTaxResidentFrance: true },
      makeCtx(),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/UK/);
  });

  it('UK + isFR=false → null', async () => {
    const issue = await TAX_RESIDENCE_FRANCE_CONSISTENCY.check(
      { ...baseInput, taxResidence: 'UK', isTaxResidentFrance: false },
      makeCtx(),
    );
    expect(issue).toBeNull();
  });
});

describe('HIRE_DATE_REASONABLE', () => {
  it("aujourd'hui → null", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const issue = await HIRE_DATE_REASONABLE.check({ ...baseInput, hireDate: today }, makeCtx());
    expect(issue).toBeNull();
  });

  it('futur (1 an, > maxFutureMonths default 3) → WARNING', async () => {
    const futur = new Date();
    futur.setFullYear(futur.getFullYear() + 1);
    const iso = futur.toISOString().slice(0, 10);
    const issue = await HIRE_DATE_REASONABLE.check({ ...baseInput, hireDate: iso }, makeCtx());
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('HIRE_DATE_FUTURE');
  });

  it('1850 → ERROR (sub-rule HIRE_DATE_INVALID hardcoded)', async () => {
    const issue = await HIRE_DATE_REASONABLE.check(
      { ...baseInput, hireDate: '1850-01-01' },
      makeCtx(),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('HIRE_DATE_INVALID');
  });

  it('null hireDate → null', async () => {
    const issue = await HIRE_DATE_REASONABLE.check({ ...baseInput, hireDate: null }, makeCtx());
    expect(issue).toBeNull();
  });
});

describe('MANAGER_NOT_SELF', () => {
  it('manager différent → null', async () => {
    const issue = await MANAGER_NOT_SELF.check(
      { ...baseInput, id: 'me-uuid', managerId: 'other-uuid' },
      makeCtx(),
    );
    expect(issue).toBeNull();
  });

  it('manager = soi-même → ERROR', async () => {
    const issue = await MANAGER_NOT_SELF.check(
      { ...baseInput, id: 'me-uuid', managerId: 'me-uuid' },
      makeCtx(),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('MANAGER_NOT_SELF');
  });

  it('création (id=null) → null (pas de risque)', async () => {
    const issue = await MANAGER_NOT_SELF.check(
      { ...baseInput, id: null, managerId: 'some-uuid' },
      makeCtx(),
    );
    expect(issue).toBeNull();
  });
});

describe('IBAN_FORMAT', () => {
  it('FR76 valide → null', async () => {
    const issue = await IBAN_FORMAT.check(
      { ...baseInput, iban: 'FR7612345678901234567890123' },
      makeCtx(),
    );
    expect(issue).toBeNull();
  });

  it('"abc" → WARNING', async () => {
    const issue = await IBAN_FORMAT.check({ ...baseInput, iban: 'abc' }, makeCtx());
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('IBAN_INVALID_FORMAT');
  });

  it('null iban → null', async () => {
    const issue = await IBAN_FORMAT.check({ ...baseInput, iban: null }, makeCtx());
    expect(issue).toBeNull();
  });

  it('IBAN avec espaces → null (cleaned avant regex)', async () => {
    const issue = await IBAN_FORMAT.check(
      { ...baseInput, iban: 'FR76 1234 5678 9012 3456 7890 123' },
      makeCtx(),
    );
    expect(issue).toBeNull();
  });
});

describe('BSPCE_BENEFICIARY_TYPE_REVERSE', () => {
  it('CONSULTANT avec 0 awards BSPCE → null', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE_REVERSE.check(
      { ...baseInput, id: 'me', beneficiaryType: 'CONSULTANT' },
      makeCtx({ bspceActiveAwardsCount: 0 }),
    );
    expect(issue).toBeNull();
  });

  it('CONSULTANT avec 1 award BSPCE actif → ERROR', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE_REVERSE.check(
      { ...baseInput, id: 'me', beneficiaryType: 'CONSULTANT' },
      makeCtx({ bspceActiveAwardsCount: 1 }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('BSPCE_BENEFICIARY_TYPE_REVERSE');
    expect(issue?.message).toMatch(/1 award/);
  });

  it('EXTERNAL avec count null (tous awards FULLY_EXERCISED → 0) → null', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE_REVERSE.check(
      { ...baseInput, id: 'me', beneficiaryType: 'EXTERNAL' },
      makeCtx({ bspceActiveAwardsCount: 0 }),
    );
    expect(issue).toBeNull();
  });

  it('EMPLOYEE avec 5 awards BSPCE actifs → null (rule ne s’applique pas)', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE_REVERSE.check(
      { ...baseInput, id: 'me', beneficiaryType: 'EMPLOYEE' },
      makeCtx({ bspceActiveAwardsCount: 5 }),
    );
    expect(issue).toBeNull();
  });

  it('OFFICER (dirigeant) avec 2 awards BSPCE actifs → null (rule ne s’applique pas)', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE_REVERSE.check(
      { ...baseInput, id: 'me', beneficiaryType: 'OFFICER' },
      makeCtx({ bspceActiveAwardsCount: 2 }),
    );
    expect(issue).toBeNull();
  });
});

// ===========================================================================
// Module 12.5 B2 — Lecture des seuils + severity depuis ctx
// ===========================================================================

describe('HIRE_DATE_REASONABLE — params dynamiques (Module 12.5 B2)', () => {
  it('utilise minYear=1950 du ctx → 1949 émet ERROR HIRE_DATE_INVALID', async () => {
    const issue = await HIRE_DATE_REASONABLE.check(
      { ...baseInput, hireDate: '1949-12-31' },
      makeCtx({
        effectiveParamsByRule: { HIRE_DATE_REASONABLE: { minYear: 1950 } },
      }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('HIRE_DATE_INVALID');
    expect(issue?.message).toMatch(/avant 1950/);
  });

  it('utilise maxFutureMonths=3 (default) → +2 mois passe (sous la marge)', async () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 2);
    future.setDate(future.getDate() - 3); // safety pour éviter dépasser pile à 3 mois
    const issue = await HIRE_DATE_REASONABLE.check(
      { ...baseInput, hireDate: future.toISOString().slice(0, 10) },
      makeCtx(),
    );
    expect(issue).toBeNull();
  });

  it('utilise maxFutureMonths=12 (org permissive) → +8 mois passe', async () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 8);
    const issue = await HIRE_DATE_REASONABLE.check(
      { ...baseInput, hireDate: future.toISOString().slice(0, 10) },
      makeCtx({
        effectiveParamsByRule: { HIRE_DATE_REASONABLE: { maxFutureMonths: 12 } },
      }),
    );
    expect(issue).toBeNull();
  });

  it('utilise maxFutureMonths=3 → +6 mois émet WARNING HIRE_DATE_FUTURE', async () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const issue = await HIRE_DATE_REASONABLE.check(
      { ...baseInput, hireDate: future.toISOString().slice(0, 10) },
      makeCtx(),
    );
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('HIRE_DATE_FUTURE');
    expect(issue?.message).toMatch(/> 3 mois/);
  });

  it('respecte severity DB error pour HIRE_DATE_FUTURE (admin upgrade)', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const issue = await HIRE_DATE_REASONABLE.check(
      { ...baseInput, hireDate: future.toISOString().slice(0, 10) },
      makeCtx({
        effectiveSeverityByRule: { HIRE_DATE_REASONABLE: 'error' },
      }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('HIRE_DATE_FUTURE');
  });

  it('HIRE_DATE_INVALID reste ERROR même si severity DB warning (sub-rule hardcoded #114)', async () => {
    const issue = await HIRE_DATE_REASONABLE.check(
      { ...baseInput, hireDate: '1850-01-01' },
      makeCtx({
        effectiveSeverityByRule: { HIRE_DATE_REASONABLE: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('HIRE_DATE_INVALID');
  });
});

describe('Beneficiary rules — severity dynamique (Module 12.5 B2)', () => {
  it('EMAIL_UNIQUE_IN_ORG respecte severity DB warning (admin downgrade)', async () => {
    const issue = await EMAIL_UNIQUE_IN_ORG.check(
      baseInput,
      makeCtx({
        emailCollisionId: 'other-id',
        effectiveSeverityByRule: { EMAIL_UNIQUE_IN_ORG: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('EMAIL_UNIQUE_IN_ORG');
  });

  it('TAX_RESIDENCE_FRANCE_CONSISTENCY respecte severity DB warning (drift seedé)', async () => {
    const issue = await TAX_RESIDENCE_FRANCE_CONSISTENCY.check(
      { ...baseInput, taxResidence: 'UK', isTaxResidentFrance: true },
      makeCtx({
        effectiveSeverityByRule: { TAX_RESIDENCE_FRANCE_CONSISTENCY: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
  });

  it('MANAGER_NOT_SELF respecte severity DB warning', async () => {
    const issue = await MANAGER_NOT_SELF.check(
      { ...baseInput, id: 'me', managerId: 'me' },
      makeCtx({
        effectiveSeverityByRule: { MANAGER_NOT_SELF: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
  });

  it('IBAN_FORMAT respecte severity DB error (admin upgrade)', async () => {
    const issue = await IBAN_FORMAT.check(
      { ...baseInput, iban: 'abc' },
      makeCtx({
        effectiveSeverityByRule: { IBAN_FORMAT: 'error' },
      }),
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('IBAN_INVALID_FORMAT');
  });

  it('BSPCE_BENEFICIARY_TYPE_REVERSE respecte severity DB warning (drift seedé)', async () => {
    const issue = await BSPCE_BENEFICIARY_TYPE_REVERSE.check(
      { ...baseInput, id: 'me', beneficiaryType: 'CONSULTANT' },
      makeCtx({
        bspceActiveAwardsCount: 2,
        effectiveSeverityByRule: { BSPCE_BENEFICIARY_TYPE_REVERSE: 'warning' },
      }),
    );
    expect(issue?.severity).toBe('WARNING');
  });
});
