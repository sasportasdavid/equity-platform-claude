import { describe, expect, it } from 'vitest';
import { resolveTemplateCodeFromPlanType, SUPPORTED_TEMPLATE_CODES } from '../template-resolver';

/**
 * Tests `resolveTemplateCodeFromPlanType` (pure function, sync).
 *
 * Le test du `renderPdfFromTemplate` (render réel via @react-pdf) est skippé
 * en Vitest pur car il nécessite un environnement Node complet avec accès au
 * filesystem (fonts) — testé via la sandbox /dev/document-engine en E2E manuel.
 */

describe('SUPPORTED_TEMPLATE_CODES', () => {
  it('expose les 7 templates V1.1 (5 award + 2 exercise)', () => {
    expect(SUPPORTED_TEMPLATE_CODES).toEqual(
      expect.arrayContaining([
        'BSPCE_GRANT_LETTER',
        'AGA_GRANT_LETTER',
        'SO_GRANT_LETTER',
        'RSU_GRANT_LETTER',
        'BSA_GRANT_LETTER',
        'EXERCISE_NOTIFICATION',
        'SUBSCRIPTION_BULLETIN',
      ]),
    );
    expect(SUPPORTED_TEMPLATE_CODES).toHaveLength(7);
  });
});

describe('resolveTemplateCodeFromPlanType', () => {
  it('BSPCE → BSPCE_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('BSPCE')).toBe('BSPCE_GRANT_LETTER');
  });

  it('AGA → AGA_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('AGA')).toBe('AGA_GRANT_LETTER');
  });

  it('AGA_PERFORMANCE → AGA_GRANT_LETTER (même template, conditions perf injectées)', () => {
    expect(resolveTemplateCodeFromPlanType('AGA_PERFORMANCE')).toBe('AGA_GRANT_LETTER');
  });

  it('STOCK_OPTION → SO_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('STOCK_OPTION')).toBe('SO_GRANT_LETTER');
  });

  it('V1.1 : RSU → RSU_GRANT_LETTER, BSA → BSA_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('RSU')).toBe('RSU_GRANT_LETTER');
    expect(resolveTemplateCodeFromPlanType('BSA')).toBe('BSA_GRANT_LETTER');
  });

  it('plan_type sans template V1 → null (PHANTOM, ESOP, SAR, PERFORMANCE_SHARE, UNKNOWN)', () => {
    expect(resolveTemplateCodeFromPlanType('PHANTOM')).toBeNull();
    expect(resolveTemplateCodeFromPlanType('ESOP')).toBeNull();
    expect(resolveTemplateCodeFromPlanType('SAR')).toBeNull();
    expect(resolveTemplateCodeFromPlanType('PERFORMANCE_SHARE')).toBeNull();
    expect(resolveTemplateCodeFromPlanType('UNKNOWN')).toBeNull();
  });
});
