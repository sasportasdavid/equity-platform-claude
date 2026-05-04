import { describe, expect, it } from 'vitest';
import type { PathSampleMetadata } from '@equity/shared';
import {
  PATH_COLORS,
  buildHistogramSeries,
  colorForPath,
  computeBounds,
  computeHitRate,
  easeOutCubic,
} from '../helpers';

/**
 * Module 11 B3 — Tests pure helpers du viewer Monte Carlo.
 *
 * Couvre les fonctions extraites des composants UI pour permettre les tests
 * Vitest sans jsdom. Les composants UI eux-mêmes sont validés via la
 * sandbox `/dev/monte-carlo-replay` (visual smoke test).
 */

function makeMeta(overrides: Partial<PathSampleMetadata> = {}): PathSampleMetadata {
  return {
    sim_id: 0,
    final_value: 50,
    max_value: 60,
    min_value: 40,
    final_itm: false,
    achieved_vesting: false,
    payoff_discounted: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// colorForPath
// ---------------------------------------------------------------------------

describe('colorForPath', () => {
  it('returns achievedItm color for vested + ITM', () => {
    const meta = makeMeta({ achieved_vesting: true, final_itm: true });
    expect(colorForPath(meta)).toBe(PATH_COLORS.achievedItm);
  });

  it('returns achievedOtm color for vested but OTM', () => {
    const meta = makeMeta({ achieved_vesting: true, final_itm: false });
    expect(colorForPath(meta)).toBe(PATH_COLORS.achievedOtm);
  });

  it('returns notAchieved color for not vested (regardless of ITM)', () => {
    expect(colorForPath(makeMeta({ achieved_vesting: false, final_itm: true }))).toBe(
      PATH_COLORS.notAchieved,
    );
    expect(colorForPath(makeMeta({ achieved_vesting: false, final_itm: false }))).toBe(
      PATH_COLORS.notAchieved,
    );
  });

  it('handles undefined meta as notAchieved (defensive)', () => {
    expect(colorForPath(undefined)).toBe(PATH_COLORS.notAchieved);
  });
});

// ---------------------------------------------------------------------------
// computeBounds
// ---------------------------------------------------------------------------

describe('computeBounds', () => {
  it('returns 0/1 default for empty paths', () => {
    expect(computeBounds([])).toEqual({ yMin: 0, yMax: 1 });
  });

  it('computes min/max with ±10% margin', () => {
    const paths = [
      [50, 60, 70, 100],
      [50, 40, 30, 20],
    ];
    const { yMin, yMax } = computeBounds(paths);
    // min = 20 → 20 * 0.9 = 18
    expect(yMin).toBeCloseTo(18, 5);
    // max = 100 → 100 * 1.1 = 110
    expect(yMax).toBeCloseTo(110, 5);
  });

  it('handles single path', () => {
    const { yMin, yMax } = computeBounds([[50, 50, 50]]);
    expect(yMin).toBeCloseTo(45, 5); // 50 × 0.9
    expect(yMax).toBeCloseTo(55, 5); // 50 × 1.1
  });

  it('falls back to 0/1 if no finite values', () => {
    expect(computeBounds([[]])).toEqual({ yMin: 0, yMax: 1 });
  });
});

// ---------------------------------------------------------------------------
// easeOutCubic
// ---------------------------------------------------------------------------

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('returns 0.875 at t=0.5 (1 - 0.5³)', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
  });

  it('clamps t < 0 to 0', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
  });

  it('clamps t > 1 to 1', () => {
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('is monotonically increasing on [0, 1]', () => {
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

// ---------------------------------------------------------------------------
// computeHitRate
// ---------------------------------------------------------------------------

describe('computeHitRate', () => {
  it('returns null for empty metadata', () => {
    expect(computeHitRate([])).toBeNull();
  });

  it('returns 1.0 if all paths achieved vesting', () => {
    const metas = [
      makeMeta({ achieved_vesting: true }),
      makeMeta({ achieved_vesting: true }),
      makeMeta({ achieved_vesting: true }),
    ];
    expect(computeHitRate(metas)).toBe(1);
  });

  it('returns 0 if no paths achieved vesting', () => {
    const metas = [makeMeta({ achieved_vesting: false }), makeMeta({ achieved_vesting: false })];
    expect(computeHitRate(metas)).toBe(0);
  });

  it('returns ratio for partial achievement', () => {
    const metas = [
      makeMeta({ achieved_vesting: true }),
      makeMeta({ achieved_vesting: false }),
      makeMeta({ achieved_vesting: true }),
      makeMeta({ achieved_vesting: false }),
      makeMeta({ achieved_vesting: false }),
    ];
    // 2 / 5 = 0.4
    expect(computeHitRate(metas)).toBeCloseTo(0.4, 5);
  });
});

// ---------------------------------------------------------------------------
// buildHistogramSeries
// ---------------------------------------------------------------------------

describe('buildHistogramSeries', () => {
  it('returns empty array for empty histogram', () => {
    expect(buildHistogramSeries({ bins: [], counts: [] })).toEqual([]);
  });

  it('treats bins as centers when bins.length === counts.length', () => {
    const series = buildHistogramSeries({ bins: [0, 50, 100], counts: [10, 5, 1] });
    expect(series).toHaveLength(3);
    expect(series[0]?.binValue).toBe(0);
    expect(series[1]?.binValue).toBe(50);
    expect(series[2]?.binValue).toBe(100);
  });

  it('uses mid-bin when bins.length === counts.length + 1', () => {
    const series = buildHistogramSeries({ bins: [0, 50, 100], counts: [10, 5] });
    expect(series).toHaveLength(2);
    expect(series[0]?.binValue).toBe(25); // mid (0, 50)
    expect(series[1]?.binValue).toBe(75); // mid (50, 100)
  });

  it('flags isZero on bins centered on 0', () => {
    const series = buildHistogramSeries({ bins: [0, 100, 200], counts: [50, 10, 1] });
    expect(series[0]?.isZero).toBe(true);
    expect(series[1]?.isZero).toBe(false);
    expect(series[2]?.isZero).toBe(false);
  });

  it('uses default EUR formatter when none provided', () => {
    const series = buildHistogramSeries({ bins: [50], counts: [1] });
    // Le formatteur par défaut produit "50 €" (currency EUR, max fraction 0)
    expect(series[0]?.binLabel).toContain('€');
  });

  it('accepts custom formatter override', () => {
    const series = buildHistogramSeries({ bins: [50], counts: [1] }, (v) => `$${v}`);
    expect(series[0]?.binLabel).toBe('$50');
  });
});
