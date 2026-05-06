import { describe, expect, it } from 'vitest';
import {
  assertExercisableType,
  composeAddressLines,
  composeFullName,
  EXERCISABLE_PLAN_TYPES,
  LEGAL_MENTIONS,
} from '../exercise-template-helpers';
import {
  isExerciseTemplateCode,
  resolveTemplateCodeFromPlanType,
  SUPPORTED_AWARD_TEMPLATE_CODES,
  SUPPORTED_EXERCISE_TEMPLATE_CODES,
  SUPPORTED_TEMPLATE_CODES,
} from '../template-resolver';

/**
 * Module 9 B5 — Tests purs pour les helpers exercise PDF.
 *
 * Le rendu réel via @react-pdf est skippé (besoin Helvetica + filesystem
 * Node — testé via la sandbox /dev/document-engine en E2E manuel).
 *
 * Ces tests couvrent :
 *  1. Resolver étendu avec EXERCISE_NOTIFICATION + SUBSCRIPTION_BULLETIN
 *  2. assertExercisableType — throws sur AGA, OK sur BSPCE/SO/BSA
 *  3. composeFullName / composeAddressLines — gestion des null/empty
 *  4. LEGAL_MENTIONS — contiennent les références CGI / Code de commerce
 */

describe('SUPPORTED_*_TEMPLATE_CODES — extension V1.1 PR #49', () => {
  it('SUPPORTED_AWARD_TEMPLATE_CODES = 5 codes (3 Module 6 + 2 V1.1 RSU/BSA)', () => {
    expect(SUPPORTED_AWARD_TEMPLATE_CODES).toEqual([
      'BSPCE_GRANT_LETTER',
      'AGA_GRANT_LETTER',
      'SO_GRANT_LETTER',
      'RSU_GRANT_LETTER',
      'BSA_GRANT_LETTER',
    ]);
  });

  it('SUPPORTED_EXERCISE_TEMPLATE_CODES expose 2 codes Module 9 B5', () => {
    expect(SUPPORTED_EXERCISE_TEMPLATE_CODES).toEqual([
      'EXERCISE_NOTIFICATION',
      'SUBSCRIPTION_BULLETIN',
    ]);
  });

  it('SUPPORTED_TEMPLATE_CODES = union des 7 codes (5 + 2)', () => {
    expect(SUPPORTED_TEMPLATE_CODES).toHaveLength(7);
    expect(SUPPORTED_TEMPLATE_CODES).toContain('BSPCE_GRANT_LETTER');
    expect(SUPPORTED_TEMPLATE_CODES).toContain('RSU_GRANT_LETTER');
    expect(SUPPORTED_TEMPLATE_CODES).toContain('BSA_GRANT_LETTER');
    expect(SUPPORTED_TEMPLATE_CODES).toContain('EXERCISE_NOTIFICATION');
    expect(SUPPORTED_TEMPLATE_CODES).toContain('SUBSCRIPTION_BULLETIN');
  });

  it('isExerciseTemplateCode discriminant', () => {
    expect(isExerciseTemplateCode('EXERCISE_NOTIFICATION')).toBe(true);
    expect(isExerciseTemplateCode('SUBSCRIPTION_BULLETIN')).toBe(true);
    expect(isExerciseTemplateCode('BSPCE_GRANT_LETTER')).toBe(false);
    expect(isExerciseTemplateCode('UNKNOWN')).toBe(false);
  });

  it('resolveTemplateCodeFromPlanType inchangé (mapping award uniquement)', () => {
    expect(resolveTemplateCodeFromPlanType('BSPCE')).toBe('BSPCE_GRANT_LETTER');
    expect(resolveTemplateCodeFromPlanType('AGA')).toBe('AGA_GRANT_LETTER');
    expect(resolveTemplateCodeFromPlanType('STOCK_OPTION')).toBe('SO_GRANT_LETTER');
  });
});

describe('assertExercisableType', () => {
  it('passe pour BSPCE / STOCK_OPTION / BSA', () => {
    for (const t of EXERCISABLE_PLAN_TYPES) {
      expect(() => assertExercisableType(t)).not.toThrow();
    }
  });

  it("throws sur AGA (les actions gratuites ne s'exercent pas)", () => {
    expect(() => assertExercisableType('AGA')).toThrow(
      /AGA plans cannot exercise — invalid template usage/,
    );
  });

  it('throws sur AGA_PERFORMANCE (variante AGA)', () => {
    expect(() => assertExercisableType('AGA_PERFORMANCE')).toThrow(/AGA plans cannot exercise/);
  });

  it('throws sur plan_type inconnu', () => {
    expect(() => assertExercisableType('PHANTOM')).toThrow(/Unknown exercisable plan_type=PHANTOM/);
    expect(() => assertExercisableType('')).toThrow(/Unknown exercisable plan_type/);
  });
});

describe('composeFullName', () => {
  it('first + last → "First Last"', () => {
    expect(composeFullName('Sophie', 'Bernard')).toBe('Sophie Bernard');
  });

  it('null/null → tiret', () => {
    expect(composeFullName(null, null)).toBe('—');
    expect(composeFullName(undefined, undefined)).toBe('—');
  });

  it('partial : juste first → "First"', () => {
    expect(composeFullName('Sophie', null)).toBe('Sophie');
    expect(composeFullName(null, 'Bernard')).toBe('Bernard');
  });

  it('empty string traité comme falsy', () => {
    expect(composeFullName('', '')).toBe('—');
  });
});

describe('composeAddressLines', () => {
  it('full address → 4 lignes', () => {
    const lines = composeAddressLines({
      address_line_1: '11 Allée des Sapins',
      address_line_2: 'Bât. B',
      postal_code: '93340',
      city: 'Le Raincy',
      country: 'FR',
    });
    expect(lines).toEqual(['11 Allée des Sapins', 'Bât. B', '93340 Le Raincy', 'FR']);
  });

  it('postal_code seul sans city → ligne avec espace trim', () => {
    const lines = composeAddressLines({
      address_line_1: '1 rue Test',
      postal_code: '75001',
      city: null,
      country: 'FR',
    });
    expect(lines).toEqual(['1 rue Test', '75001', 'FR']);
  });

  it('all null → empty array', () => {
    expect(composeAddressLines({})).toEqual([]);
    expect(
      composeAddressLines({
        address_line_1: null,
        postal_code: null,
        city: null,
        country: null,
      }),
    ).toEqual([]);
  });

  it('address_line_2 omis si null', () => {
    const lines = composeAddressLines({
      address_line_1: '1 rue Test',
      postal_code: '75001',
      city: 'Paris',
      country: 'FR',
    });
    expect(lines).toEqual(['1 rue Test', '75001 Paris', 'FR']);
  });
});

describe('LEGAL_MENTIONS — références CGI / Code de commerce', () => {
  it('EXERCISE_NOTIFICATION contient L228-91 + 163 bis G + L225-177', () => {
    expect(LEGAL_MENTIONS.EXERCISE_NOTIFICATION).toContain('L228-91');
    expect(LEGAL_MENTIONS.EXERCISE_NOTIFICATION).toContain('163 bis G');
    expect(LEGAL_MENTIONS.EXERCISE_NOTIFICATION).toContain('L225-177');
    expect(LEGAL_MENTIONS.EXERCISE_NOTIFICATION).toContain(
      'ne constitue ni un titre, ni un certificat',
    );
  });

  it('SUBSCRIPTION_BULLETIN contient L228-7 + L228-1 + nominatives + V2 placeholder', () => {
    expect(LEGAL_MENTIONS.SUBSCRIPTION_BULLETIN).toContain('L228-7');
    expect(LEGAL_MENTIONS.SUBSCRIPTION_BULLETIN).toContain('L228-1');
    expect(LEGAL_MENTIONS.SUBSCRIPTION_BULLETIN).toContain('nominatives');
    // V2 placeholder explicite (dette #110 — validation avocat)
    expect(LEGAL_MENTIONS.SUBSCRIPTION_BULLETIN).toContain('#110');
  });
});
