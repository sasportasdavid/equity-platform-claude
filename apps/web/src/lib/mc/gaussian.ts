/**
 * Box-Muller polaire — tire 2 N(0,1) à chaque appel, cache le 2nd.
 *
 * Plus rapide que la version trigonométrique car évite cos/sin (boucle
 * de rejet acceptée pour 1 - π/4 ≈ 21 % des paires).
 */

import type { Pcg32 } from './prng';

export type GaussianSampler = () => number;

export function createGaussian(prng: Pcg32): GaussianSampler {
  let cached: number | null = null;

  return function gaussian(): number {
    if (cached !== null) {
      const v = cached;
      cached = null;
      return v;
    }
    let u1: number;
    let u2: number;
    let s: number;
    do {
      u1 = prng.nextFloat01() * 2 - 1;
      u2 = prng.nextFloat01() * 2 - 1;
      s = u1 * u1 + u2 * u2;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    cached = u2 * factor;
    return u1 * factor;
  };
}
