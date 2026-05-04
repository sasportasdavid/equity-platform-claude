import { describe, expect, it } from 'vitest';
import {
  complianceRuleDefinitionSchema,
  complianceRuleOverrideInputSchema,
  effectiveRuleFullSchema,
  effectiveRuleSchema,
  paramFieldSchema,
  paramsSchemaSchema,
  ruleCodeSchema,
  ruleScopeSchema,
  ruleSeveritySchema,
  simulationResultSchema,
} from './compliance';

/**
 * Module 12 B1 — Tests des schemas Zod compliance engine V2.
 *
 * Couvre :
 *  - Enums : severity, scope, rule_code (alignés avec migration 00094)
 *  - paramFieldSchema / paramsSchemaSchema (méta-schema des params)
 *  - effectiveRuleSchema / effectiveRuleFullSchema (output RPC + vue)
 *  - complianceRuleOverrideInputSchema (input updateOverride SA)
 *  - simulationResultSchema (output simulateChange B4)
 *
 * Pattern : pure parse / safeParse, pas de DB.
 */

describe('ruleSeveritySchema', () => {
  it('accepte error et warning', () => {
    expect(ruleSeveritySchema.parse('error')).toBe('error');
    expect(ruleSeveritySchema.parse('warning')).toBe('warning');
  });

  it('rejette severity invalide (BLOCKING)', () => {
    expect(ruleSeveritySchema.safeParse('BLOCKING').success).toBe(false);
  });

  it('rejette severity casing invalide (Error)', () => {
    expect(ruleSeveritySchema.safeParse('Error').success).toBe(false);
  });
});

describe('ruleScopeSchema', () => {
  it('accepte les 8 scopes V1', () => {
    const scopes = [
      'plan',
      'award',
      'beneficiary',
      'valuation',
      'cap_table',
      'exercise',
      'approval',
      'document',
    ];
    for (const s of scopes) {
      expect(ruleScopeSchema.parse(s)).toBe(s);
    }
  });

  it('rejette scope invalide (foo)', () => {
    expect(ruleScopeSchema.safeParse('foo').success).toBe(false);
  });

  it('rejette scope avec casing differente (PLAN)', () => {
    expect(ruleScopeSchema.safeParse('PLAN').success).toBe(false);
  });
});

describe('ruleCodeSchema', () => {
  it('contient exactement 23 codes (parite avec migration 00094b realign)', () => {
    expect(ruleCodeSchema.options).toHaveLength(23);
  });

  it('accepte VALUATION_STALE_BLOCKING (Module 11 B6 livree, conservee B3b)', () => {
    expect(ruleCodeSchema.parse('VALUATION_STALE_BLOCKING')).toBe('VALUATION_STALE_BLOCKING');
  });

  it('accepte les 5 rules award (post-B3b realign)', () => {
    const awardRules = [
      'BSPCE_BENEFICIARY_TYPE',
      'AGA_30_PERCENT_CAP',
      'AGA_APPROACHING_CAP',
      'POOL_AVAILABLE',
      'GRANT_DATE_RECENT',
    ];
    for (const r of awardRules) {
      expect(ruleCodeSchema.parse(r)).toBe(r);
    }
  });

  it('accepte les 6 rules beneficiary (post-B3b realign)', () => {
    const benRules = [
      'EMAIL_UNIQUE_IN_ORG',
      'TAX_RESIDENCE_FRANCE_CONSISTENCY',
      'HIRE_DATE_REASONABLE',
      'MANAGER_NOT_SELF',
      'IBAN_FORMAT',
      'BSPCE_BENEFICIARY_TYPE_REVERSE',
    ];
    for (const r of benRules) {
      expect(ruleCodeSchema.parse(r)).toBe(r);
    }
  });

  it('rejette les 20 rules aspirationnelles supprimees en B3b', () => {
    const removed = [
      'PLAN_VESTING_SCHEDULE_VALID',
      'AWARD_UNITS_POSITIVE',
      'BENEFICIARY_TAX_PROFILE_REQUIRED',
      'EXERCISE_WINDOW_VALID',
      'APPROVAL_QUORUM_REQUIRED',
      'DOCUMENT_TEMPLATE_REQUIRED',
    ];
    for (const r of removed) {
      expect(ruleCodeSchema.safeParse(r).success).toBe(false);
    }
  });

  it('rejette un code inconnu (RULE_NOT_IN_CATALOG)', () => {
    expect(ruleCodeSchema.safeParse('RULE_NOT_IN_CATALOG').success).toBe(false);
  });
});

describe('paramFieldSchema', () => {
  it('parse un param integer borne (staleDays)', () => {
    const field = paramFieldSchema.parse({
      type: 'integer',
      min: 30,
      max: 365,
      default: 90,
      label_fr: 'Seuil péremption (jours)',
    });
    expect(field.type).toBe('integer');
    expect(field.default).toBe(90);
  });

  it('rejette type invalide (decimal)', () => {
    const r = paramFieldSchema.safeParse({
      type: 'decimal',
      default: 5,
      label_fr: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('rejette label_fr vide', () => {
    const r = paramFieldSchema.safeParse({
      type: 'integer',
      default: 90,
      label_fr: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('paramsSchemaSchema (record paramName -> ParamField)', () => {
  it("parse l'objet vide (rule sans param)", () => {
    expect(paramsSchemaSchema.parse({})).toEqual({});
  });

  it('parse le params_schema de VALUATION_STALE_BLOCKING (extrait migration 00094)', () => {
    const parsed = paramsSchemaSchema.parse({
      staleDays: {
        type: 'integer',
        min: 30,
        max: 365,
        default: 90,
        label_fr: 'Seuil peremption (jours)',
      },
    });
    expect(parsed.staleDays?.default).toBe(90);
    expect(parsed.staleDays?.type).toBe('integer');
  });
});

describe('effectiveRuleSchema (output RPC get_effective_rule)', () => {
  it('parse une response valide', () => {
    const parsed = effectiveRuleSchema.parse({
      rule_code: 'VALUATION_STALE_BLOCKING',
      scope: 'valuation',
      is_active: true,
      effective_severity: 'error',
      effective_params: { staleDays: 60 },
      cta_url_template: '/dashboard/plans/{planId}/valuations',
    });
    expect(parsed.is_active).toBe(true);
    expect(parsed.effective_params.staleDays).toBe(60);
  });

  it('accepte cta_url_template null', () => {
    const r = effectiveRuleSchema.safeParse({
      rule_code: 'POOL_AVAILABLE',
      scope: 'award',
      is_active: true,
      effective_severity: 'error',
      effective_params: {},
      cta_url_template: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejette severity invalide (BLOCKING)', () => {
    const r = effectiveRuleSchema.safeParse({
      rule_code: 'VALUATION_STALE_BLOCKING',
      scope: 'valuation',
      is_active: true,
      effective_severity: 'BLOCKING',
      effective_params: {},
      cta_url_template: null,
    });
    expect(r.success).toBe(false);
  });

  it('rejette scope invalide', () => {
    const r = effectiveRuleSchema.safeParse({
      rule_code: 'VALUATION_STALE_BLOCKING',
      scope: 'unknown_scope',
      is_active: true,
      effective_severity: 'error',
      effective_params: {},
      cta_url_template: null,
    });
    expect(r.success).toBe(false);
  });

  it('rejette rule_code inconnu', () => {
    const r = effectiveRuleSchema.safeParse({
      rule_code: 'NOT_A_RULE',
      scope: 'valuation',
      is_active: true,
      effective_severity: 'error',
      effective_params: {},
      cta_url_template: null,
    });
    expect(r.success).toBe(false);
  });
});

describe('effectiveRuleFullSchema (extension UI listage)', () => {
  it('parse une row complete de effective_compliance_rules', () => {
    const parsed = effectiveRuleFullSchema.parse({
      rule_code: 'VALUATION_STALE_BLOCKING',
      scope: 'valuation',
      is_active: true,
      effective_severity: 'error',
      effective_params: { staleDays: 90 },
      cta_url_template: '/dashboard/plans/{planId}/valuations',
      description_fr: 'Valorisation IFRS 2 datée de moins de N jours obligatoire',
      description_en: null,
      severity_default: 'error',
      is_severity_overridable: false,
      default_params: { staleDays: 90 },
      params_schema: {
        staleDays: {
          type: 'integer',
          min: 30,
          max: 365,
          default: 90,
          label_fr: 'Seuil',
        },
      },
      documentation_url: null,
      is_overridden: false,
      override_notes: null,
      params_override: null,
      override_updated_at: null,
      override_updated_by: null,
    });
    expect(parsed.is_overridden).toBe(false);
    expect(parsed.params_schema.staleDays?.default).toBe(90);
  });
});

describe('complianceRuleOverrideInputSchema (input updateOverride SA)', () => {
  it('happy path : isActive + paramsOverride avec staleDays=60', () => {
    const parsed = complianceRuleOverrideInputSchema.parse({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      paramsOverride: { staleDays: 60 },
      notes: 'Durci à 60j sur demande comité audit 2026-Q1',
    });
    expect(parsed.paramsOverride.staleDays).toBe(60);
  });

  it('default paramsOverride={}, notes=null si non fournis', () => {
    const parsed = complianceRuleOverrideInputSchema.parse({
      ruleCode: 'POOL_AVAILABLE',
      isActive: false,
    });
    expect(parsed.paramsOverride).toEqual({});
    expect(parsed.notes).toBeNull();
  });

  it('rejette ruleCode inconnu', () => {
    const r = complianceRuleOverrideInputSchema.safeParse({
      ruleCode: 'NOT_A_RULE',
      isActive: true,
    });
    expect(r.success).toBe(false);
  });

  it('rejette notes > 2000 chars', () => {
    const r = complianceRuleOverrideInputSchema.safeParse({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      isActive: true,
      notes: 'x'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it('accepte paramsOverride avec types mixtes (number/boolean/string)', () => {
    const parsed = complianceRuleOverrideInputSchema.parse({
      ruleCode: 'HIRE_DATE_REASONABLE',
      isActive: true,
      paramsOverride: { minYear: 1950, maxFutureMonths: 6, label: 'strict' },
    });
    expect(parsed.paramsOverride.minYear).toBe(1950);
    expect(parsed.paramsOverride.maxFutureMonths).toBe(6);
  });
});

describe('simulationResultSchema (output simulateChange B4)', () => {
  it('parse une response valide', () => {
    const parsed = simulationResultSchema.parse({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      passingCount: 12,
      failingCount: 3,
      notEvaluableCount: 0,
      impactedSampleIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    });
    expect(parsed.failingCount).toBe(3);
    expect(parsed.impactedSampleIds).toHaveLength(2);
  });

  it('rejette counts negatifs', () => {
    const r = simulationResultSchema.safeParse({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      passingCount: -1,
      failingCount: 0,
      notEvaluableCount: 0,
      impactedSampleIds: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejette > 10 sample IDs (cap V1)', () => {
    const r = simulationResultSchema.safeParse({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      passingCount: 0,
      failingCount: 11,
      notEvaluableCount: 0,
      impactedSampleIds: Array.from(
        { length: 11 },
        (_, i) => `${'1'.repeat(8)}-1111-4111-8111-${i.toString().padStart(12, '0')}`,
      ),
    });
    expect(r.success).toBe(false);
  });

  it('rejette UUID malforme dans impactedSampleIds', () => {
    const r = simulationResultSchema.safeParse({
      ruleCode: 'VALUATION_STALE_BLOCKING',
      passingCount: 0,
      failingCount: 1,
      notEvaluableCount: 0,
      impactedSampleIds: ['not-a-uuid'],
    });
    expect(r.success).toBe(false);
  });
});

describe('complianceRuleDefinitionSchema (admin debug + listage)', () => {
  it('parse une definition complete', () => {
    const parsed = complianceRuleDefinitionSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      rule_code: 'VALUATION_STALE_BLOCKING',
      scope: 'valuation',
      severity_default: 'error',
      description_fr: 'Valorisation IFRS 2 datée de moins de N jours obligatoire',
      description_en: null,
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
      is_active_by_default: true,
      is_severity_overridable: false,
      cta_url_template: '/dashboard/plans/{planId}/valuations',
      documentation_url: null,
      created_at: '2026-05-04T18:00:00.000Z',
    });
    expect(parsed.rule_code).toBe('VALUATION_STALE_BLOCKING');
    expect(parsed.is_active_by_default).toBe(true);
  });
});
