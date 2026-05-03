import { describe, expect, it } from 'vitest';

import {
  computeMaxUnitsAvailable,
  formatDateFr,
  formatEuro,
  formatPercent,
  formatTaxBreakdownForDisplay,
  formatUnits,
  regimeAccentColor,
  regimeLabel,
} from '../format-helpers';
import type { TaxBreakdown } from '@/lib/tax';

describe('formatEuro', () => {
  it('formatte 1234.56 en français', () => {
    // Espace insécable (  ou   selon implémentation)
    expect(formatEuro(1234.56)).toMatch(/1.234,56\s*€/);
  });

  it('formatte 0', () => {
    expect(formatEuro(0)).toMatch(/0,00\s*€/);
  });
});

describe('formatUnits', () => {
  it('formatte 1500 sans décimales', () => {
    expect(formatUnits(1500)).toMatch(/1.500/);
  });
});

describe('formatPercent', () => {
  it('formatte 0.314 en 31,4 %', () => {
    expect(formatPercent(0.314)).toMatch(/31,4\s*%/);
  });
});

describe('formatDateFr', () => {
  it('formatte une date ISO en DD/MM/YYYY', () => {
    expect(formatDateFr('2026-05-03')).toBe('03/05/2026');
  });

  it('renvoie un tiret pour null', () => {
    expect(formatDateFr(null)).toBe('—');
  });
});

describe('computeMaxUnitsAvailable', () => {
  it('renvoie units_granted - units_exercised si snapshot vide', () => {
    expect(computeMaxUnitsAvailable(1000, 100, null)).toBe(900);
  });

  it('utilise les tranches snapshot avec vesting_date past', () => {
    const snapshot = {
      tranches: [
        { vesting_date: '2024-01-01', percentage_of_award: 25 },
        { vesting_date: '2025-01-01', percentage_of_award: 25 },
        { vesting_date: '2027-01-01', percentage_of_award: 25 },
        { vesting_date: '2028-01-01', percentage_of_award: 25 },
      ],
    };
    // Sur date courante 2026-05-03 (current date), 2 tranches past = 50% = 500
    // moins 0 exercised = 500
    expect(computeMaxUnitsAvailable(1000, 0, snapshot)).toBe(500);
  });

  it('renvoie 0 si tout exercé', () => {
    expect(computeMaxUnitsAvailable(1000, 1000, null)).toBe(0);
  });
});

describe('regimeAccentColor', () => {
  it('BSPCE_3Y_PLUS = brass (PFU avantageux)', () => {
    expect(regimeAccentColor('BSPCE_3Y_PLUS')).toBe('brass');
  });

  it('BSPCE_3Y_LESS = warning (taxation majorée)', () => {
    expect(regimeAccentColor('BSPCE_3Y_LESS')).toBe('warning');
  });

  it('STOCK_OPTION_QUALIFIE = ink', () => {
    expect(regimeAccentColor('STOCK_OPTION_QUALIFIE')).toBe('ink');
  });

  it('STOCK_OPTION_NON_QUALIFIE = warning', () => {
    expect(regimeAccentColor('STOCK_OPTION_NON_QUALIFIE')).toBe('warning');
  });
});

describe('regimeLabel', () => {
  it('BSPCE_3Y_PLUS retourne le label FR', () => {
    expect(regimeLabel('BSPCE_3Y_PLUS')).toContain('BSPCE');
    expect(regimeLabel('BSPCE_3Y_PLUS')).toContain('3 ans');
  });

  it('AGA_POST_2018', () => {
    expect(regimeLabel('AGA_POST_2018')).toBe('AGA (post-2018)');
  });
});

describe('formatTaxBreakdownForDisplay', () => {
  it('extrait les chiffres clés et les formate', () => {
    const breakdown: TaxBreakdown = {
      regime: 'BSPCE_3Y_PLUS',
      grossExerciseAmount: 1000,
      grossSaleAmount: 25000,
      grossGainAmount: 24000,
      acquisitionTaxableBase: 0,
      acquisitionIncomeTax: 0,
      acquisitionSocialContributions: 0,
      cessionTaxableBase: 24000,
      cessionIncomeTax: 3072,
      cessionSocialContributions: 4464,
      totalTaxAmount: 7536,
      netGainAmount: 16464,
      effectiveTaxRate: 0.314,
      warnings: [],
      ratesYear: 2026,
      computedAt: '2026-05-03T10:00:00.000Z',
      sources: [],
    };
    const formatted = formatTaxBreakdownForDisplay(breakdown);
    expect(formatted.grossGain).toMatch(/24/);
    expect(formatted.netGain).toMatch(/16/);
    expect(formatted.effectiveRate).toMatch(/31,4\s*%/);
    expect(formatted.acquisitionTax).toBe(0);
    expect(formatted.cessionTax).toBe(7536);
  });
});
