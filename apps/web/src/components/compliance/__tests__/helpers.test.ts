import { describe, expect, it } from 'vitest';
import type { ParamField } from '@equity/shared';
import {
  computeParamsDiff,
  eventLabel,
  formatParamValue,
  isMixedSeverity,
  MIXED_SEVERITY_RULES,
  validateCrossField,
  validateField,
} from '../helpers';

/**
 * Module 12 B4 — Tests des pure helpers compliance UI.
 *
 * Couvre :
 *   - isMixedSeverity / MIXED_SEVERITY_RULES (anomalie HIRE_DATE_REASONABLE)
 *   - formatParamValue (number FR, boolean, null)
 *   - validateField (integer / number bornes + types)
 *   - validateCrossField (ESOP_PERCENT_BEST_PRACTICE minPct < maxPct)
 *   - eventLabel (mapping audit event_type → FR)
 *   - computeParamsDiff (record diff)
 *
 * Pattern : pure functions, pas de DOM.
 */

describe('isMixedSeverity / MIXED_SEVERITY_RULES', () => {
  it('contient HIRE_DATE_REASONABLE (V1 anomalie connue)', () => {
    expect(MIXED_SEVERITY_RULES.has('HIRE_DATE_REASONABLE')).toBe(true);
    expect(isMixedSeverity('HIRE_DATE_REASONABLE')).toBe(true);
  });

  it('retourne false pour les autres rules', () => {
    expect(isMixedSeverity('VALUATION_STALE_BLOCKING')).toBe(false);
    expect(isMixedSeverity('AGA_30_PERCENT_CAP')).toBe(false);
    expect(isMixedSeverity('NOT_A_RULE')).toBe(false);
  });
});

describe('formatParamValue', () => {
  it('formate un number en fr-FR avec séparateur milliers', () => {
    expect(formatParamValue(1234)).toMatch(/1\s*234/);
  });

  it('retourne "oui" / "non" pour boolean', () => {
    expect(formatParamValue(true)).toBe('oui');
    expect(formatParamValue(false)).toBe('non');
  });

  it('retourne "—" pour null/undefined', () => {
    expect(formatParamValue(null)).toBe('—');
    expect(formatParamValue(undefined)).toBe('—');
  });

  it('retourne string tel quel', () => {
    expect(formatParamValue('hello')).toBe('hello');
  });
});

describe('validateField — integer', () => {
  const intField: ParamField = {
    type: 'integer',
    min: 30,
    max: 365,
    default: 90,
    label_fr: 'Seuil',
  };

  it('accepte 90 (dans bornes)', () => {
    expect(validateField(intField, 90)).toBeNull();
    expect(validateField(intField, '90')).toBeNull();
  });

  it('rejette < min 30', () => {
    expect(validateField(intField, 10)).toMatch(/min 30/i);
  });

  it('rejette > max 365', () => {
    expect(validateField(intField, 500)).toMatch(/max 365/i);
  });

  it('rejette non-entier (5.5)', () => {
    expect(validateField(intField, 5.5)).toMatch(/entier/i);
  });

  it('rejette vide', () => {
    expect(validateField(intField, '')).toMatch(/requis/i);
    expect(validateField(intField, null)).toMatch(/requis/i);
  });
});

describe('validateField — number', () => {
  const numField: ParamField = {
    type: 'number',
    min: 1,
    max: 50,
    default: 15,
    label_fr: 'Pct',
  };

  it('accepte 15.5 (decimal autorisé)', () => {
    expect(validateField(numField, 15.5)).toBeNull();
  });

  it('rejette > max', () => {
    expect(validateField(numField, 100)).toMatch(/max 50/i);
  });

  it('rejette non-numérique', () => {
    expect(validateField(numField, 'abc')).toMatch(/nombre/i);
  });
});

describe('validateField — boolean / string', () => {
  it('boolean : accepte true/false, rejette autre', () => {
    expect(validateField({ type: 'boolean', default: false, label_fr: 'X' }, true)).toBeNull();
    expect(validateField({ type: 'boolean', default: false, label_fr: 'X' }, 'true')).toMatch(
      /booléen/i,
    );
  });

  it('string : accepte non-vide, rejette vide', () => {
    expect(validateField({ type: 'string', default: '', label_fr: 'X' }, 'ok')).toBeNull();
    expect(validateField({ type: 'string', default: '', label_fr: 'X' }, '')).toMatch(/requis/i);
  });
});

describe('validateCrossField — ESOP_PERCENT_BEST_PRACTICE', () => {
  it('passe si minPct < maxPct (5 < 15)', () => {
    expect(validateCrossField('ESOP_PERCENT_BEST_PRACTICE', { minPct: 5, maxPct: 15 })).toBeNull();
  });

  it('rejette si minPct >= maxPct (10 >= 10)', () => {
    expect(validateCrossField('ESOP_PERCENT_BEST_PRACTICE', { minPct: 10, maxPct: 10 })).toMatch(
      /Plancher.*<.*Plafond/i,
    );
  });

  it('rejette si minPct > maxPct (20 > 5)', () => {
    expect(validateCrossField('ESOP_PERCENT_BEST_PRACTICE', { minPct: 20, maxPct: 5 })).toMatch(
      /Plancher/,
    );
  });

  it('skip si values sont strings (validation field-level rejette avant)', () => {
    expect(
      validateCrossField('ESOP_PERCENT_BEST_PRACTICE', { minPct: '20', maxPct: '5' }),
    ).toBeNull();
  });

  it('retourne null pour les autres rules', () => {
    expect(validateCrossField('VALUATION_STALE_BLOCKING', { staleDays: 90 })).toBeNull();
    expect(validateCrossField('NOT_A_RULE', { foo: 'bar' })).toBeNull();
  });
});

describe('eventLabel', () => {
  it('mappe les 4 event types compliance.* en FR', () => {
    expect(eventLabel('compliance_rule.activated')).toBe('Activée');
    expect(eventLabel('compliance_rule.deactivated')).toBe('Désactivée');
    expect(eventLabel('compliance_rule.params_updated')).toBe('Paramètres modifiés');
    expect(eventLabel('compliance_rule.reset_all')).toBe('Réinitialisation globale');
  });

  it('retourne le code brut pour event type inconnu', () => {
    expect(eventLabel('compliance_rule.unknown')).toBe('compliance_rule.unknown');
  });
});

describe('computeParamsDiff', () => {
  it('détecte un seul changement', () => {
    const diff = computeParamsDiff({ staleDays: 90 }, { staleDays: 60 });
    expect(diff).toEqual({ staleDays: { from: 90, to: 60 } });
  });

  it('retourne {} si pas de changement', () => {
    expect(computeParamsDiff({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual({});
  });

  it("détecte ajout d'une clé", () => {
    const diff = computeParamsDiff({}, { newKey: 'v' });
    expect(diff).toEqual({ newKey: { from: undefined, to: 'v' } });
  });

  it("détecte suppression d'une clé", () => {
    const diff = computeParamsDiff({ oldKey: 'v' }, {});
    expect(diff).toEqual({ oldKey: { from: 'v', to: undefined } });
  });

  it('détecte changements multiples', () => {
    const diff = computeParamsDiff({ minPct: 5, maxPct: 20 }, { minPct: 10, maxPct: 15 });
    expect(diff).toEqual({
      minPct: { from: 5, to: 10 },
      maxPct: { from: 20, to: 15 },
    });
  });
});
