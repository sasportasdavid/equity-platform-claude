/**
 * xoshiro128++ — Permuted Linear Generator (state 4×32-bit, output 32-bit).
 *
 * L'API expose toujours `createPcg32` / `Pcg32` pour préserver la
 * compatibilité avec `engine.ts`, `gaussian.ts` et les tests Phase 1.
 * Seule l'implémentation interne change : on remplace PCG32 BigInt
 * (state 64-bit, ~5× plus lent en V8 à cause des allocations BigInt
 * par tirage) par xoshiro128++ Number (zéro BigInt, JIT-optimisable).
 *
 * Algorithme (Blackman & Vigna 2019) :
 *   state = (s0, s1, s2, s3) ∈ Uint32^4
 *   result = rotl(s0 + s3, 7) + s0
 *   t = s1 << 9
 *   s2 ^= s0
 *   s3 ^= s1
 *   s1 ^= s2
 *   s0 ^= s3
 *   s2 ^= t
 *   s3 = rotl(s3, 11)
 *
 * Period 2^128 - 1, passe BigCrush et PractRand. C'est la famille que
 * V8 utilise sous le capot pour `Math.random` (variant xorshift128+).
 *
 * Seed : splitmix32 (variant 32-bit du splitmix64 de Vigna) pour
 * étaler le seed scalaire en 4 mots Int32 sans corrélation triviale.
 *
 * Réf : https://prng.di.unimi.it/xoshiro128plusplus.c
 *       https://prng.di.unimi.it/splitmix64.c
 */

export type Pcg32 = {
  /** Tirage entier non-signé 32 bits. */
  nextU32: () => number;
  /** Tirage flottant uniforme dans [0, 1). 53 bits effectifs (27 + 26). */
  nextFloat01: () => number;
};

/** splitmix32 — étale un seed scalaire en séquence pseudo-aléatoire. */
function splitmix32(seed: number): () => number {
  let z = seed >>> 0;
  return function next(): number {
    z = (z + 0x9e3779b9) >>> 0;
    let x = z;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  };
}

/** Rotate-left 32 bits (équivalent C : `(x << k) | (x >> (32 - k))`). */
function rotl32(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export function createPcg32(seed: number): Pcg32 {
  // Seed les 4 mots state via splitmix32 — protège contre les seeds
  // corrélés (ex: seed=0 ne doit pas donner state tout-à-zéro).
  const sm = splitmix32(seed);
  let s0 = sm();
  let s1 = sm();
  let s2 = sm();
  let s3 = sm();
  // Garde-fou : si state tout-à-zéro (impossible en pratique avec
  // splitmix32 mais théoriquement possible si seed adverse), force
  // un mot non-nul.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  function nextU32(): number {
    // result = rotl(s0 + s3, 7) + s0
    const sum = (s0 + s3) >>> 0;
    const result = (rotl32(sum, 7) + s0) >>> 0;

    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl32(s3, 11);

    return result;
  }

  function nextFloat01(): number {
    // 53 bits = 27 high + 26 low de 2 tirages 32-bit, format double.
    const a = nextU32() >>> 5; // 27 bits
    const b = nextU32() >>> 6; // 26 bits
    return (a * 0x4000000 + b) / 0x20000000000000;
  }

  return { nextU32, nextFloat01 };
}
