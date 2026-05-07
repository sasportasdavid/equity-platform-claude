import { describe, expect, it } from 'vitest';
import { runMonteCarlo, ENGINE_VERSION } from '@/lib/mc/engine';
import { buildInput, PRESETS } from '@/lib/mc/presets';
import type { PresetKey } from '@/lib/mc/types';

const ALL_PRESETS = Object.keys(PRESETS) as PresetKey[];

describe('engine — déterminisme & convergence', () => {
  it('determinism — 2 runs même seed → même FV', async () => {
    const input = buildInput('psp_barrier', { N: 5_000, steps: 40, seed: 42 });
    const a = await runMonteCarlo(input);
    const b = await runMonteCarlo(input);
    expect(a.fairValue).toBe(b.fairValue);
    expect(a.stdError).toBe(b.stdError);
    expect(a.delta).toBe(b.delta);
    expect(a.vega).toBe(b.vega);
    expect(a.rho).toBe(b.rho);
    expect(a.inputHash).toBe(b.inputHash);
  });

  it('engineVersion exposé', async () => {
    const input = buildInput('bspce', { N: 1000, steps: 20 });
    const r = await runMonteCarlo(input);
    expect(r.engineVersion).toBe(ENGINE_VERSION);
    expect(r.engineVersion).toBe('capiwise-mc-js-1.0.0');
  });

  it('convergence_psp — IC95 width / FV décroît en √N', async () => {
    // Spec initiale demandait < 1.5 % à N=10k mais c'est irréaliste pour
    // une option barrière (stdDev des payoffs ≈ 28 € sur FV ≈ 13 €,
    // ratio à 10k ≈ 8 %, il faudrait ~300k paths pour atteindre 1.5 %).
    // On vérifie plutôt la convergence en √N : doubler N doit diviser
    // l'IC width par ~√2.
    const input1 = buildInput('psp_barrier', { N: 10_000, steps: 60, seed: 42 });
    const input2 = buildInput('psp_barrier', { N: 40_000, steps: 60, seed: 42 });
    const r1 = await runMonteCarlo(input1);
    const r2 = await runMonteCarlo(input2);
    const w1 = r1.ic95[1] - r1.ic95[0];
    const w2 = r2.ic95[1] - r2.ic95[0];
    // Width @ 40k devrait être ~½ du width @ 10k (facteur √4 = 2). On
    // accepte un ratio empirique entre 1.5× et 3× pour absorber le bruit.
    const ratio = w1 / w2;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(3);
    // Bound réaliste à 40k : < 5 %
    expect(w2 / r2.fairValue).toBeLessThan(0.05);
  }, 30_000);
});

describe('engine — sanity bounds par preset', () => {
  it.each(ALL_PRESETS)('sanity_bounds — preset=%s', async (preset) => {
    const input = buildInput(preset, { N: 5_000, steps: 40, seed: 42 });
    const r = await runMonteCarlo(input);
    // FV ∈ [0, S0+10] (S0+10 pour les BSPCE qui peuvent osciller)
    expect(r.fairValue).toBeGreaterThanOrEqual(0);
    expect(r.fairValue).toBeLessThan(input.S0 + 10);
    // Pas de NaN / Infinity nulle part
    expect(Number.isFinite(r.fairValue)).toBe(true);
    expect(Number.isFinite(r.stdError)).toBe(true);
    expect(Number.isFinite(r.delta)).toBe(true);
    expect(Number.isFinite(r.vega)).toBe(true);
    expect(Number.isFinite(r.rho)).toBe(true);
    // Rates ∈ [0, 1]
    expect(r.hitRateBarrier).toBeGreaterThanOrEqual(0);
    expect(r.hitRateBarrier).toBeLessThanOrEqual(1);
    expect(r.forfeitedRate).toBeGreaterThanOrEqual(0);
    expect(r.forfeitedRate).toBeLessThanOrEqual(1);
    expect(r.itmFinalRate).toBeGreaterThanOrEqual(0);
    expect(r.itmFinalRate).toBeLessThanOrEqual(1);
    // forfeited + itmFinal = 1 (chaque path est soit ITM soit forfeited)
    const totalCat = r.forfeitedRate + r.itmFinalRate;
    expect(totalCat).toBeGreaterThan(0.999);
    expect(totalCat).toBeLessThan(1.001);
  });
});

describe('engine — Greeks signs (calls long → tous positifs)', () => {
  it.each(ALL_PRESETS)('greeks_signs — preset=%s', async (preset) => {
    // BSPCE strike = K = S0, peer/aga avec K=0 ou K>0 → tous calls long
    const input = buildInput(preset, { N: 8_000, steps: 40, seed: 42 });
    const r = await runMonteCarlo(input);
    // delta > 0 sauf pour AGA classique avec K=0 où delta ≈ exp(-q·T) ≈ 0.95 (toujours > 0)
    expect(r.delta).toBeGreaterThan(0);
    // vega > 0 sauf pour AGA classique sans optionalité (K=0) où vega ≈ 0
    if (preset === 'aga_classic') {
      expect(Math.abs(r.vega)).toBeLessThan(2); // borné autour de 0
    } else {
      expect(r.vega).toBeGreaterThan(0);
    }
    // rho > 0 pour les calls (les AGA classiques avec K=0 ont rho ≈ 0)
    if (preset !== 'aga_classic') {
      expect(r.rho).toBeGreaterThan(0);
    }
  });
});

describe('engine — no NaN', () => {
  it.each(ALL_PRESETS)('all_presets_no_nan — preset=%s', async (preset) => {
    const input = buildInput(preset, { N: 3_000, steps: 30, seed: 42 });
    const r = await runMonteCarlo(input);
    expect(Number.isNaN(r.fairValue)).toBe(false);
    expect(Number.isNaN(r.stdError)).toBe(false);
    expect(Number.isNaN(r.delta)).toBe(false);
    expect(Number.isNaN(r.vega)).toBe(false);
    expect(Number.isNaN(r.rho)).toBe(false);
    for (const p of r.convergenceCurve) {
      expect(Number.isFinite(p.fv)).toBe(true);
      expect(Number.isFinite(p.ic)).toBe(true);
    }
    for (let i = 0; i < r.pathsSample.length; i++) {
      expect(Number.isFinite(r.pathsSample[i])).toBe(true);
    }
  });
});

describe('engine — psp_barrier target', () => {
  it('psp_target — seed=42, N=60k, FV ∈ [12, 15]', async () => {
    const input = buildInput('psp_barrier', { N: 60_000, steps: 60, seed: 42 });
    const r = await runMonteCarlo(input);
    // Mockup affiche 13,27 € — calibration cible 12-15 € (PRNG différent
    // du Python d'origine donc tolérance large).
    expect(r.fairValue).toBeGreaterThanOrEqual(12);
    expect(r.fairValue).toBeLessThanOrEqual(15);
    // Hit rate cohérent avec mockup (~41,8 %)
    expect(r.hitRateBarrier).toBeGreaterThan(0.3);
    expect(r.hitRateBarrier).toBeLessThan(0.55);
  }, 30_000);
});

describe('engine — input hash', () => {
  it('hash 8 hex chars stable pour mêmes inputs', async () => {
    const input = buildInput('aga_classic', { N: 1000, steps: 20, seed: 42 });
    const a = await runMonteCarlo(input);
    const b = await runMonteCarlo(input);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.inputHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('hash diffère si seed diffère', async () => {
    const a = await runMonteCarlo(buildInput('bspce', { N: 1000, steps: 20, seed: 1 }));
    const b = await runMonteCarlo(buildInput('bspce', { N: 1000, steps: 20, seed: 2 }));
    expect(a.inputHash).not.toBe(b.inputHash);
  });
});

describe('engine — histograms', () => {
  it('payoffHistogram + terminalHistogram populated', async () => {
    const input = buildInput('psp_barrier', { N: 5_000, steps: 40, seed: 42 });
    const r = await runMonteCarlo(input);
    expect(r.payoffHistogram.bins.length).toBeGreaterThan(1);
    expect(r.payoffHistogram.counts.length).toBeGreaterThan(0);
    expect(r.payoffHistogram.pathsAtZero).toBeGreaterThanOrEqual(0);
    expect(r.terminalHistogram.bins.length).toBeGreaterThan(1);
    expect(r.terminalHistogram.median).toBeGreaterThan(0);
  });

  it('hitTimeHistogram empty pour preset sans barrière', async () => {
    const r = await runMonteCarlo(buildInput('aga_classic', { N: 2000, steps: 20, seed: 42 }));
    expect(r.hitTimeHistogram.bins).toEqual([]);
    expect(r.hitTimeHistogram.counts).toEqual([]);
    expect(r.hitTimeHistogram.mean).toBe(0);
  });

  it('hitTimeHistogram populated pour preset avec barrière', async () => {
    const r = await runMonteCarlo(buildInput('psp_barrier', { N: 5_000, steps: 40, seed: 42 }));
    expect(r.hitTimeHistogram.bins.length).toBeGreaterThan(1);
    expect(r.hitTimeHistogram.mean).toBeGreaterThan(0);
    expect(r.hitTimeHistogram.mean).toBeLessThan(4); // T = 3.5
  });
});
