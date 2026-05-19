import { describe, expect, it } from 'vitest';
import { runSensitivities } from '@/lib/mc/sensitivities';
import { buildInput } from '@/lib/mc/presets';

describe('sensitivities', () => {
  it('barrier_skip_when_null — aga_classic axis=B → []', () => {
    const input = buildInput('aga_classic', { seed: 42 });
    const points = runSensitivities(input, 'B');
    expect(points).toEqual([]);
  });

  it('barrier_monotone — psp_barrier axis=B → FV décroissant en B', () => {
    const input = buildInput('psp_barrier', { seed: 42 });
    const points = runSensitivities(input, 'B');
    expect(points.length).toBeGreaterThan(20);
    // Bord à bord : FV(B=55) doit être >> FV(B=120) (barrière plus haute = moins probable touchée)
    const first = points[0]!;
    const last = points[points.length - 1]!;
    expect(first.fv).toBeGreaterThan(last.fv);
    // Vérifier monotonicité approximative : pas de remontée majeure
    // (on tolère du bruit MC sur 8k paths). On compte les inversions
    // significatives (> 0.5€) ; on en accepte ≤ 4 sur 30 points.
    let inversions = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i]!.fv - points[i - 1]!.fv > 0.5) inversions++;
    }
    expect(inversions).toBeLessThanOrEqual(4);
  }, 30_000);

  it('vol_monotone — bspce axis=sigma → FV croissant en σ', () => {
    const input = buildInput('bspce', { seed: 42 });
    const points = runSensitivities(input, 'sigma');
    expect(points.length).toBeGreaterThan(20);
    const first = points[0]!;
    const last = points[points.length - 1]!;
    // FV(σ=0.10) < FV(σ=0.60) — la valeur d'un call croît avec la volatilité
    expect(last.fv).toBeGreaterThan(first.fv);
    // Monotonicité approximative avec tolérance de bruit MC
    let inversions = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i]!.fv - points[i - 1]!.fv < -0.3) inversions++;
    }
    expect(inversions).toBeLessThanOrEqual(4);
  }, 30_000);

  it('output shape — points ont x et fv finis', () => {
    const points = runSensitivities(buildInput('psp_barrier'), 'B');
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.fv)).toBe(true);
      expect(p.fv).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);
});
