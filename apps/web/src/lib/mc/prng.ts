/**
 * PCG32 — Permuted Congruential Generator (state 64 bits, output 32 bits).
 *
 * Choix vs Math.random() : seedable, déterministe, period 2^64, qualité
 * statistique correcte pour Monte Carlo grand public. Implémentation
 * naïve mais portable (BigInt pour la state, conversion Number 32-bit
 * en sortie). Pas de lib externe.
 *
 * Référence : https://www.pcg-random.org/
 */

const MULTIPLIER = 6364136223846793005n;
const INCREMENT = 1442695040888963407n;
const MASK_64 = 0xffffffffffffffffn;

export type Pcg32 = {
  /** Tirage entier non-signé 32 bits. */
  nextU32: () => number;
  /** Tirage flottant uniforme dans [0, 1). 53 bits effectifs (24 + 29). */
  nextFloat01: () => number;
};

/**
 * Crée un générateur PCG32 seedé par `seed` (entier 32-bit non-signé).
 * Le pas d'init avance la state d'un tirage pour éviter les corrélations
 * triviales entre seeds adjacents.
 */
export function createPcg32(seed: number): Pcg32 {
  let state = (BigInt(seed >>> 0) + INCREMENT) & MASK_64;
  // Burn-in : un tirage à vide pour mixer la seed.
  state = (state * MULTIPLIER + INCREMENT) & MASK_64;

  function nextU32(): number {
    const oldstate = state;
    state = (state * MULTIPLIER + INCREMENT) & MASK_64;
    // Output function : XOR-shift puis rotation.
    const xorshifted = Number(((oldstate >> 18n) ^ oldstate) >> 27n) & 0xffffffff;
    const rot = Number(oldstate >> 59n);
    const result = ((xorshifted >>> rot) | (xorshifted << (-rot & 31))) & 0xffffffff;
    return result >>> 0;
  }

  function nextFloat01(): number {
    // 53 bits = 26 high + 27 low de 2 tirages 32-bit.
    const a = nextU32() >>> 5; // 27 bits
    const b = nextU32() >>> 6; // 26 bits
    return (a * 0x4000000 + b) / 0x20000000000000;
  }

  return { nextU32, nextFloat01 };
}
