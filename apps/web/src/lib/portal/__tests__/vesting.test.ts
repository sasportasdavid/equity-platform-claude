import { describe, expect, it } from 'vitest';
import { buildVestingTimeline, computeCumulativeUnits, computeVestedPercentage } from '../vesting';
import type { PortalVestingEvent, PortalVestingScheduleSnapshot } from '@equity/shared';

const FIXED_TODAY = new Date('2026-05-01T00:00:00Z');

const sampleSnapshot: PortalVestingScheduleSnapshot = {
  schedule: { vesting_type: 'cliff_linear', total_months: 48 },
  tranches: [
    { vesting_date: '2025-12-01', percentage_of_award: 25 },
    { vesting_date: '2026-03-01', percentage_of_award: 25 },
    { vesting_date: '2026-09-01', percentage_of_award: 25 },
    { vesting_date: '2027-03-01', percentage_of_award: 25 },
  ],
};

const eventsTimeline: PortalVestingEvent[] = [
  {
    id: 'e1',
    scheduled_date: '2025-12-01',
    effective_date: '2025-12-01',
    units_to_vest: 250,
    units_vested: 250,
    performance_multiplier: 1,
    status: 'VESTED',
  },
  {
    id: 'e2',
    scheduled_date: '2026-03-01',
    effective_date: '2026-03-01',
    units_to_vest: 250,
    units_vested: 250,
    performance_multiplier: 1,
    status: 'VESTED',
  },
  {
    id: 'e3',
    scheduled_date: '2026-09-01',
    effective_date: null,
    units_to_vest: 250,
    units_vested: 0,
    performance_multiplier: 1,
    status: 'PENDING',
  },
];

describe('buildVestingTimeline — Cas A (vesting_events présents)', () => {
  it('utilise les events tels quels et trie par date', () => {
    const reversed = [...eventsTimeline].reverse();
    const out = buildVestingTimeline(1000, reversed, null, FIXED_TODAY);
    expect(out).toHaveLength(3);
    expect(out[0]?.date).toBe('2025-12-01');
    expect(out[2]?.date).toBe('2026-09-01');
    expect(out.every((e) => !e.fromSnapshot)).toBe(true);
  });

  it('préserve les status des events', () => {
    const out = buildVestingTimeline(1000, eventsTimeline, null, FIXED_TODAY);
    expect(out[0]?.status).toBe('VESTED');
    expect(out[2]?.status).toBe('PENDING');
  });

  it('respecte performance_multiplier (default 1.0 si null)', () => {
    const evs: PortalVestingEvent[] = [
      { ...eventsTimeline[0]!, performance_multiplier: 0.7 },
      { ...eventsTimeline[1]!, performance_multiplier: null },
    ];
    const out = buildVestingTimeline(1000, evs, null, FIXED_TODAY);
    expect(out[0]?.performanceMultiplier).toBe(0.7);
    expect(out[1]?.performanceMultiplier).toBe(1.0);
  });
});

describe('buildVestingTimeline — Cas B (fallback snapshot)', () => {
  it('génère timeline depuis snapshot quand events vides', () => {
    const out = buildVestingTimeline(1000, null, sampleSnapshot, FIXED_TODAY);
    expect(out).toHaveLength(4);
    expect(out.every((e) => e.fromSnapshot)).toBe(true);
  });

  it('génère timeline depuis snapshot quand events est tableau vide', () => {
    const out = buildVestingTimeline(1000, [], sampleSnapshot, FIXED_TODAY);
    expect(out).toHaveLength(4);
  });

  it('marque tranches passées VESTED, futures PENDING (today=2026-05-01)', () => {
    const out = buildVestingTimeline(1000, null, sampleSnapshot, FIXED_TODAY);
    expect(out[0]?.status).toBe('VESTED'); // 2025-12-01 (passé)
    expect(out[1]?.status).toBe('VESTED'); // 2026-03-01 (passé)
    expect(out[2]?.status).toBe('PENDING'); // 2026-09-01 (futur)
    expect(out[3]?.status).toBe('PENDING'); // 2027-03-01 (futur)
  });

  it('convertit percentage_of_award en units arrondis', () => {
    const out = buildVestingTimeline(1000, null, sampleSnapshot, FIXED_TODAY);
    // 25% de 1000 = 250
    expect(out[0]?.unitsToVest).toBe(250);
    expect(out[0]?.unitsVested).toBe(250); // VESTED → vested = toVest
    expect(out[2]?.unitsVested).toBe(0); // PENDING → vested = 0
  });

  it('gère arrondi sur units_granted impair (% non entier)', () => {
    const odd: PortalVestingScheduleSnapshot = {
      schedule: {},
      tranches: [
        { vesting_date: '2025-01-01', percentage_of_award: 33.33 },
        { vesting_date: '2025-02-01', percentage_of_award: 33.33 },
        { vesting_date: '2025-03-01', percentage_of_award: 33.34 },
      ],
    };
    const out = buildVestingTimeline(100, null, odd, FIXED_TODAY);
    // 33.33 * 100 / 100 = 33.33 → arrondi 33 ; 33.34 * 100 / 100 = 33.34 → arrondi 33
    expect(out[0]?.unitsToVest).toBe(33);
    expect(out[2]?.unitsToVest).toBe(33);
  });

  it("retourne tableau vide si pas de tranches et pas d'events", () => {
    expect(buildVestingTimeline(1000, null, null)).toEqual([]);
    expect(buildVestingTimeline(1000, [], null)).toEqual([]);
    expect(buildVestingTimeline(1000, null, { schedule: {}, tranches: [] })).toEqual([]);
  });

  it('cliff non atteint : tout PENDING', () => {
    const future: PortalVestingScheduleSnapshot = {
      schedule: {},
      tranches: [{ vesting_date: '2030-01-01', percentage_of_award: 100 }],
    };
    const out = buildVestingTimeline(1000, null, future, FIXED_TODAY);
    expect(out[0]?.status).toBe('PENDING');
    expect(out[0]?.unitsVested).toBe(0);
  });

  it('100% acquis : toutes tranches dans le passé', () => {
    const allPast: PortalVestingScheduleSnapshot = {
      schedule: {},
      tranches: [
        { vesting_date: '2020-01-01', percentage_of_award: 50 },
        { vesting_date: '2020-06-01', percentage_of_award: 50 },
      ],
    };
    const out = buildVestingTimeline(1000, null, allPast, FIXED_TODAY);
    expect(out.every((e) => e.status === 'VESTED')).toBe(true);
    const totalVested = out.reduce((acc, e) => acc + e.unitsVested, 0);
    expect(totalVested).toBe(1000);
  });
});

describe('computeCumulativeUnits', () => {
  it('cumulative monotone croissante (prévu)', () => {
    const out = computeCumulativeUnits(
      buildVestingTimeline(1000, null, sampleSnapshot, FIXED_TODAY),
    );
    expect(out.map((p) => p.cumulative)).toEqual([250, 500, 750, 1000]);
  });

  it("cumulativeVested progresse jusqu'à today puis stagne", () => {
    const out = computeCumulativeUnits(
      buildVestingTimeline(1000, null, sampleSnapshot, FIXED_TODAY),
    );
    // 2 tranches passées (250 + 250), 2 à venir (0 + 0)
    expect(out.map((p) => p.cumulativeVested)).toEqual([250, 500, 500, 500]);
  });

  it('tableau vide en entrée → tableau vide en sortie', () => {
    expect(computeCumulativeUnits([])).toEqual([]);
  });
});

describe('computeVestedPercentage', () => {
  it('calcule % arrondi', () => {
    expect(computeVestedPercentage(250, 1000)).toBe(25);
    expect(computeVestedPercentage(333, 1000)).toBe(33);
    expect(computeVestedPercentage(666, 1000)).toBe(67);
  });

  it('retourne 0 si units_granted=0 (no division by zero)', () => {
    expect(computeVestedPercentage(0, 0)).toBe(0);
    expect(computeVestedPercentage(50, 0)).toBe(0);
  });

  it('retourne 100 si tout acquis', () => {
    expect(computeVestedPercentage(1000, 1000)).toBe(100);
  });
});
