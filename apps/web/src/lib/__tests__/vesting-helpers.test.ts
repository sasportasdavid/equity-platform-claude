import { describe, expect, it } from 'vitest';
import {
  buildDefaultTicks,
  computeSegments,
  formatCumulativeLine,
  formatVestingDateLong,
  formatVestingDateShort,
  type VestingTranche,
} from '../vesting-helpers';

const BSPCE_VESTING_START = '2026-03-15';
const BSPCE_VESTING_END = '2030-03-15';
const BSPCE_TODAY = '2026-04-30';

/**
 * Construit les 37 tranches du plan BSPCE-2026-001 :
 * - 1 tranche cliff 25 % au 2027-03-15
 * - 35 tranches mensuelles linéaires entre 2027-04-15 et 2030-02-15
 * - 1 tranche finale au 2030-03-15
 *
 * Pour le mockup : 20 % final (= ~7 tranches) flagged hasPerformanceCondition.
 * On simplifie à 16 dernières mensuelles cond pour matcher 20 % cumul exact.
 */
function buildBspcePlan(opts: { conditionalPercentage?: number } = {}): VestingTranche[] {
  const tranches: VestingTranche[] = [];
  // Cliff 2027-03-15 → 25 %
  tranches.push({
    vestingDate: '2027-03-15',
    percentageOfAward: 25,
    hasPerformanceCondition: false,
    status: 'PENDING',
  });
  // 36 mensuelles linéaires de 2.083 % chacune (75 %/36) — 2027-04-15 → 2030-03-15
  const monthlyPct = 75 / 36;
  for (let i = 0; i < 36; i++) {
    const month = new Date(2027, 3 + i, 15);
    const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-15`;
    tranches.push({
      vestingDate: iso,
      percentageOfAward: monthlyPct,
      hasPerformanceCondition: false,
      status: 'PENDING',
    });
  }
  if (opts.conditionalPercentage != null) {
    // Marquer les N dernières tranches dont la somme est ≥ conditionalPercentage
    let acc = 0;
    for (let i = tranches.length - 1; i >= 0 && acc < opts.conditionalPercentage; i--) {
      tranches[i]!.hasPerformanceCondition = true;
      acc += tranches[i]!.percentageOfAward;
    }
  }
  return tranches;
}

describe('computeSegments (PR #38 B1)', () => {
  it('canonique mockup BSPCE-2026-001 au 30/04/2026 — segments 0/3.1/76.9/20', () => {
    const tranches = buildBspcePlan({ conditionalPercentage: 20 });
    const seg = computeSegments(tranches, BSPCE_VESTING_START, BSPCE_VESTING_END, BSPCE_TODAY);
    // span = 1461 jours, elapsed = 46 jours = 3.149 %
    expect(seg.acquired).toBe(0); // cliff non atteint
    expect(seg.live).toBeCloseTo(3.149, 1); // ≈ 3.1 %
    // 20 % conditionnel marqué sur les 16 dernières mensuelles (16 × 2.083 = 33.3 %, mais on s'arrête dès qu'on dépasse 20 → ~10 tranches = 20.83 %)
    expect(seg.cond).toBeGreaterThanOrEqual(20);
    expect(seg.cond).toBeLessThan(23);
    // future = 100 - 0 - 3.1 - cond
    expect(seg.acquired + seg.live + seg.future + seg.cond).toBeCloseTo(100, 1);
  });

  it('après cliff (today=2027-04-15) — acquired ≥ 25 %', () => {
    const tranches = buildBspcePlan({ conditionalPercentage: 20 });
    const seg = computeSegments(tranches, BSPCE_VESTING_START, BSPCE_VESTING_END, '2027-04-15');
    // Cliff 25 % + 1 tranche mensuelle 2.083 %
    expect(seg.acquired).toBeGreaterThanOrEqual(25);
    expect(seg.acquired).toBeLessThan(28); // <= 25 + 1 mensuelle
    expect(seg.cond).toBeGreaterThanOrEqual(20);
    // span 13 mois sur 48 mois ≈ 27 %, donc live = 27-acquired
    expect(seg.acquired + seg.live + seg.future + seg.cond).toBeCloseTo(100, 1);
  });

  it('vesting terminé (today=2030-04-15) — acquired ≈ 80 %, cond ≈ 20 %, live cappé', () => {
    const tranches = buildBspcePlan({ conditionalPercentage: 20 });
    const seg = computeSegments(tranches, BSPCE_VESTING_START, BSPCE_VESTING_END, '2030-04-15');
    // À cette date toutes les tranches sont passées. Cond ≈ 20 % préservés
    // (perf non atteinte). Acquired ≈ 80 %. Live cappé à 100-acquired-cond
    // ≈ 0 pour préserver l'invariant somme=100.
    expect(seg.acquired).toBeGreaterThanOrEqual(78);
    expect(seg.acquired).toBeLessThanOrEqual(82);
    expect(seg.cond).toBeGreaterThanOrEqual(20);
    expect(seg.future).toBe(0);
    // Invariant : somme exacte 100 (à epsilon près)
    expect(seg.acquired + seg.live + seg.future + seg.cond).toBeCloseTo(100, 1);
  });

  it('today < vestingStart — segments 0/0/100/0 sans cond', () => {
    const tranches = buildBspcePlan();
    const seg = computeSegments(tranches, BSPCE_VESTING_START, BSPCE_VESTING_END, '2025-12-01');
    expect(seg.acquired).toBe(0);
    expect(seg.live).toBe(0);
    expect(seg.future).toBeCloseTo(100, 1);
    expect(seg.cond).toBe(0);
  });

  it('today < vestingStart avec cond — segments 0/0/(100-cond)/cond', () => {
    const tranches = buildBspcePlan({ conditionalPercentage: 20 });
    const seg = computeSegments(tranches, BSPCE_VESTING_START, BSPCE_VESTING_END, '2025-12-01');
    expect(seg.acquired).toBe(0);
    expect(seg.live).toBe(0);
    expect(seg.cond).toBeGreaterThanOrEqual(20);
    expect(seg.future).toBeCloseTo(100 - seg.cond, 1);
  });

  it('today > vestingEnd sans cond — acquired=100, live=0, future=0, cond=0', () => {
    const tranches = buildBspcePlan();
    const seg = computeSegments(tranches, BSPCE_VESTING_START, BSPCE_VESTING_END, '2031-01-01');
    expect(seg.acquired).toBeCloseTo(100, 1);
    expect(seg.future).toBe(0);
    expect(seg.cond).toBe(0);
  });

  it('0 tranches → 0/0/100/0', () => {
    const seg = computeSegments([], BSPCE_VESTING_START, BSPCE_VESTING_END, BSPCE_TODAY);
    expect(seg.acquired).toBe(0);
    expect(seg.cond).toBe(0);
    // live = elapsedPct ≈ 3.1, future = 100 - live
    expect(seg.live).toBeCloseTo(3.149, 1);
    expect(seg.future).toBeCloseTo(96.85, 1);
  });

  it('vestingEnd === vestingStart — sécurité division par zéro, retourne 0', () => {
    const seg = computeSegments([], '2026-01-01', '2026-01-01', '2026-06-01');
    expect(seg.acquired).toBe(0);
    expect(seg.live).toBe(0);
    expect(seg.cond).toBe(0);
    expect(seg.future).toBeCloseTo(100, 1);
  });

  it('FORFEITED status → exclu de acquired même si vesting_date passée', () => {
    const tranches: VestingTranche[] = [
      { vestingDate: '2026-04-01', percentageOfAward: 50, status: 'FORFEITED' },
      { vestingDate: '2026-04-15', percentageOfAward: 50, status: 'PENDING' },
    ];
    const seg = computeSegments(tranches, '2026-01-01', '2026-12-31', '2026-05-01');
    // FORFEITED = exclu de acquired mais aussi exclu de cond (pas de hasPerformanceCondition)
    // → acquired = 50 (juste la 2nde, PENDING passée)
    expect(seg.acquired).toBe(50);
  });
});

describe('buildDefaultTicks', () => {
  it('5 ticks équidistants par défaut', () => {
    const ticks = buildDefaultTicks('2026-03-15', '2030-03-15');
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.label).toBe('15.03.2026');
    expect(ticks[4]?.label).toBe('15.03.2030');
  });

  it('sub-label cliff sur le tick le plus proche', () => {
    const ticks = buildDefaultTicks('2026-03-15', '2030-03-15', {
      cliffDate: '2027-03-15',
      cliffPct: 25,
    });
    expect(ticks).toHaveLength(5);
    // Tick 1 (2027-03-15) doit recevoir le sub-label cliff
    expect(ticks[1]?.subLabel).toBe('· cliff · 25 %');
    expect(ticks[0]?.subLabel).toBeUndefined();
    expect(ticks[2]?.subLabel).toBeUndefined();
  });

  it('format simplified avec formatLabel custom', () => {
    const ticks = buildDefaultTicks('2026-03-15', '2030-03-15', {
      formatLabel: formatVestingDateShort,
    });
    expect(ticks[0]?.label).toBe('Mar 2026');
    expect(ticks[4]?.label).toBe('Mar 2030');
  });
});

describe('formatVestingDateLong', () => {
  it('formate en JJ.MM.AAAA', () => {
    expect(formatVestingDateLong('2026-03-15')).toBe('15.03.2026');
    expect(formatVestingDateLong('2030-03-15')).toBe('15.03.2030');
  });
});

describe('formatVestingDateShort', () => {
  it("formate en 'Mois AAAA' court FR", () => {
    expect(formatVestingDateShort('2026-03-15')).toBe('Mar 2026');
    expect(formatVestingDateShort('2026-12-01')).toBe('Déc 2026');
  });
});

describe('formatCumulativeLine', () => {
  // Note : `Intl.NumberFormat('fr-FR')` utilise U+202F (narrow NBSP) comme
  // séparateur des milliers — typographie française canonique. Les tests
  // verrouillent ce caractère pour éviter les régressions silencieuses.
  const NBSP = ' ';

  it("default — '25 % · 1{NBSP}050 u.'", () => {
    expect(formatCumulativeLine(25, 1050)).toBe(`25 % · 1${NBSP}050 u.`);
    expect(formatCumulativeLine(50, 2100)).toBe(`50 % · 2${NBSP}100 u.`);
    expect(formatCumulativeLine(100, 4200)).toBe(`100 % · 4${NBSP}200 u.`);
  });

  it("simplified — '300 u. (25 %)' (ordre inversé)", () => {
    expect(formatCumulativeLine(25, 300, { simplified: true })).toBe('300 u. (25 %)');
    expect(formatCumulativeLine(100, 1200, { simplified: true })).toBe(`1${NBSP}200 u. (100 %)`);
  });

  it("0 % case — affiche juste '0' sans unité", () => {
    expect(formatCumulativeLine(0, 0)).toBe('0 %');
    expect(formatCumulativeLine(0, 0, { simplified: true })).toBe('0');
  });
});
