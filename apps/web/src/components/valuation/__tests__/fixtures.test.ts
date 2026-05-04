import { describe, expect, it } from 'vitest';
import { generateFixture, PRESETS } from '../fixtures';

/**
 * Module 11 B3 — Tests fixtures pour la sandbox `/dev/monte-carlo-replay`.
 *
 * Vérifie que la génération GBM seed-based est :
 *   - Déterministe (re-runs identiques)
 *   - Cohérente structurellement (lengths alignés, FV finie, etc.)
 *   - Couvre les 4 presets prévus (PSP / BSPCE / AGA / peer group)
 */

describe('PRESETS export', () => {
  it('exports exactly 4 presets', () => {
    expect(PRESETS).toHaveLength(4);
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toContain('psp-barrier-75');
    expect(ids).toContain('bspce-simple');
    expect(ids).toContain('aga-tsr');
    expect(ids).toContain('peer-group');
  });

  it('every preset has positive S0, sigma, T, numPaths', () => {
    for (const p of PRESETS) {
      expect(p.inputs.S0).toBeGreaterThan(0);
      expect(p.inputs.sigma).toBeGreaterThan(0);
      expect(p.inputs.T).toBeGreaterThan(0);
      expect(p.inputs.numPaths).toBeGreaterThan(0);
      expect(p.numStepsTotal).toBeGreaterThan(0);
      expect(p.pathsToSample).toBeGreaterThan(0);
    }
  });
});

describe('generateFixture', () => {
  it('produces a deterministic visualization for a given preset (seed 42)', () => {
    const preset = PRESETS[0]!; // PSP barrière 75
    const a = generateFixture(preset);
    const b = generateFixture(preset);

    expect(a.fairValuePerUnit).toBe(b.fairValuePerUnit);
    expect(a.stdError).toBe(b.stdError);
    expect(a.visualization.paths_sample).toEqual(b.visualization.paths_sample);
    expect(a.visualization.paths_metadata).toEqual(b.visualization.paths_metadata);
  });

  it('paths_sample length matches preset.pathsToSample', () => {
    for (const preset of PRESETS) {
      const fix = generateFixture(preset);
      expect(fix.visualization.paths_sample).toHaveLength(preset.pathsToSample);
      expect(fix.visualization.paths_metadata).toHaveLength(preset.pathsToSample);
    }
  });

  it('each path has numSteps + 1 points (including S0)', () => {
    const preset = PRESETS[1]!; // BSPCE simple, 48 steps
    const fix = generateFixture(preset);
    expect(fix.visualization.paths_sample[0]).toHaveLength(preset.numStepsTotal + 1);
    expect(fix.visualization.num_steps).toBe(preset.numStepsTotal);
    expect(fix.visualization.sim_T).toBe(preset.inputs.T);
  });

  it('first point of every path equals S0 exactly', () => {
    const preset = PRESETS[2]!; // AGA TSR
    const fix = generateFixture(preset);
    for (const path of fix.visualization.paths_sample) {
      expect(path[0]).toBe(preset.inputs.S0);
    }
  });

  it('fair value is finite and non-negative', () => {
    for (const preset of PRESETS) {
      const fix = generateFixture(preset);
      expect(Number.isFinite(fix.fairValuePerUnit)).toBe(true);
      expect(fix.fairValuePerUnit).toBeGreaterThanOrEqual(0);
    }
  });

  it('std error is finite and non-negative', () => {
    for (const preset of PRESETS) {
      const fix = generateFixture(preset);
      expect(Number.isFinite(fix.stdError)).toBe(true);
      expect(fix.stdError).toBeGreaterThanOrEqual(0);
    }
  });

  it('greeks contains delta/gamma/vega/theta/rho', () => {
    const fix = generateFixture(PRESETS[0]!);
    expect(fix.greeks).toMatchObject({
      delta: expect.any(Number),
      gamma: expect.any(Number),
      vega: expect.any(Number),
      theta: expect.any(Number),
      rho: expect.any(Number),
    });
  });

  it('input_hash starts with 0x prefix', () => {
    const fix = generateFixture(PRESETS[0]!);
    expect(fix.inputHash).toMatch(/^0x/);
  });

  it('sample_size matches paths_sample.length, total_paths matches preset.numPaths', () => {
    const preset = PRESETS[3]!; // peer group
    const fix = generateFixture(preset);
    expect(fix.visualization.sample_size).toBe(fix.visualization.paths_sample.length);
    expect(fix.visualization.total_paths).toBe(preset.inputs.numPaths);
  });

  it('payoff_histogram has matching bins and counts (or +1)', () => {
    const fix = generateFixture(PRESETS[0]!);
    const hist = fix.visualization.payoff_histogram as { bins: number[]; counts: number[] };
    expect(hist.bins.length).toBeGreaterThan(0);
    expect(hist.counts.length).toBeGreaterThan(0);
    // Soit bins.length === counts.length (centres), soit +1 (bornes)
    expect([hist.counts.length, hist.counts.length + 1]).toContain(hist.bins.length);
  });

  it('convergence_curve is monotonically growing in N', () => {
    const fix = generateFixture(PRESETS[0]!);
    const curve = fix.visualization.convergence_curve;
    expect(curve.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < curve.length; i++) {
      const prev = curve[i - 1]!.n!;
      const curr = curve[i]!.n!;
      expect(curr).toBeGreaterThan(prev);
    }
  });
});
