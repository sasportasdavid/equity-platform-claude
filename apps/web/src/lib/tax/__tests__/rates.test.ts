import { describe, expect, it } from 'vitest';

import {
  PFU_IR_2026,
  PFU_TOTAL_2026,
  PS_CAPITAL_GAINS_2026,
  RATES_YEAR,
  TAX_BRACKETS_2026,
} from '../rates';

describe('rates 2026', () => {
  it('TAX_BRACKETS_2026 a 5 tranches avec les seuils officiels LF 2026', () => {
    expect(TAX_BRACKETS_2026).toHaveLength(5);
    expect(TAX_BRACKETS_2026[0]).toEqual({ min: 0, max: 11_600, rate: 0 });
    expect(TAX_BRACKETS_2026[1]).toEqual({
      min: 11_601,
      max: 29_579,
      rate: 0.11,
    });
    expect(TAX_BRACKETS_2026[2]).toEqual({
      min: 29_580,
      max: 84_577,
      rate: 0.3,
    });
    expect(TAX_BRACKETS_2026[3]).toEqual({
      min: 84_578,
      max: 181_917,
      rate: 0.41,
    });
    expect(TAX_BRACKETS_2026[4]).toEqual({
      min: 181_918,
      max: null,
      rate: 0.45,
    });
  });

  it('PFU 2026 = 31,4% (12,8 IR + 18,6 PS) — hausse CSG LFSS 2026', () => {
    expect(PFU_IR_2026).toBe(0.128);
    expect(PS_CAPITAL_GAINS_2026).toBe(0.186);
    // Compare avec tolérance car 0.128 + 0.186 = 0.31399999... en JS
    expect(PFU_TOTAL_2026).toBeCloseTo(0.314, 5);
    expect(RATES_YEAR).toBe(2026);
  });
});
