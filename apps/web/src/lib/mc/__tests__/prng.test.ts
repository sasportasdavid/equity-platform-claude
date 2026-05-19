import { describe, expect, it } from 'vitest';
import { createPcg32 } from '@/lib/mc/prng';

describe('xoshiro128++', () => {
  it('xoshiro128pp_known_seed — seed=42, 5 premiers floats sont déterministes', () => {
    const prng = createPcg32(42);
    const samples = [
      prng.nextFloat01(),
      prng.nextFloat01(),
      prng.nextFloat01(),
      prng.nextFloat01(),
      prng.nextFloat01(),
    ];
    // Toutes les valeurs ∈ [0, 1)
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
    // Régression : valeurs ancrées xoshiro128++ seed=42 (Phase 1.5).
    // L'ancien snapshot PCG32 BigInt était figé à
    // "0.76155828,0.44811550,0.95970718,0.79600818,0.48016406".
    // Si ces valeurs changent à nouveau, c'est une rupture API du PRNG.
    const fingerprint = samples.map((s) => s.toFixed(8)).join(',');
    expect(fingerprint).toMatchInlineSnapshot(
      `"0.09419437,0.35485424,0.76222215,0.08994304,0.12210429"`,
    );
  });

  it('determinism — 2 PRNG mêmes seeds → même séquence', () => {
    const a = createPcg32(123);
    const b = createPcg32(123);
    for (let i = 0; i < 20; i++) {
      expect(a.nextFloat01()).toBe(b.nextFloat01());
    }
  });

  it('uniformity_smoke — 100k tirages, mean ∈ [0.495, 0.505]', () => {
    const prng = createPcg32(7);
    let sum = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) sum += prng.nextFloat01();
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.495);
    expect(mean).toBeLessThan(0.505);
  });

  it('nextU32 retourne un uint32 (≥ 0, < 2^32)', () => {
    const prng = createPcg32(1);
    for (let i = 0; i < 100; i++) {
      const u = prng.nextU32();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(2 ** 32);
      expect(Number.isInteger(u)).toBe(true);
    }
  });
});
