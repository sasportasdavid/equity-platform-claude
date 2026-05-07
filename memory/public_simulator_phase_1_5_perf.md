# Public Monte Carlo Simulator — Phase 1.5 Perf

**Branche** : `feat/public-mc-simulator` (PR #51 draft)
**Commit** : `perf(public-simulator): xoshiro128++ replace PCG32 BigInt — 5x speedup`
**Date** : 2026-05-07

## Bench (5 runs warm, MacBook M-series)

| Preset      | Avant (Phase 1) | Après (Phase 1.5) | Speedup |
| ----------- | --------------- | ----------------- | ------- |
| psp_barrier | 4067 ms         | **742 ms**        | 5,5×    |
| aga_classic | 4000 ms         | 682 ms            | 5,9×    |
| bspce       | 3991 ms         | 650 ms            | 6,1×    |
| so_us       | 4078 ms         | 652 ms            | 6,3×    |
| tsr_peer    | 7890 ms         | 1338 ms           | 5,9×    |

`runSensitivities(psp, 'sigma')` : 937 ms (30 points × 8k paths × 40 steps)
`runSensitivities(psp, 'B')` : 967 ms

## Cible perf — partiellement atteinte

| Preset           | Cible     | Mesuré     | Statut             |
| ---------------- | --------- | ---------- | ------------------ |
| psp_barrier      | ≤ 500 ms  | 742 ms     | ❌ 1,48× au-dessus |
| AGA / BSPCE / SO | ≤ 600 ms  | 650-682 ms | ❌ 1,1× au-dessus  |
| tsr_peer         | ≤ 600 ms  | 1338 ms    | ❌ 2,2× au-dessus  |
| Sensibilités     | ≤ 1500 ms | ~950 ms    | ✅                 |

**Speedup massif (5,5-6,3×)** mais cible 500 ms non atteinte. On est dans la zone "démo crédible avec Web Worker non-bloquant" mais sous l'idéal "300 ms instantané".

## Optimisations appliquées

1. **xoshiro128++ remplace PCG32 BigInt** — algo Blackman & Vigna 2019, 4×32-bit Number, zéro BigInt. C'est la famille que V8 utilise sous le capot pour `Math.random` (variant xorshift128+). Seed via splitmix32 pour étaler le seed scalaire en 4 mots Int32.
2. **Box-Muller polaire inliné** — élimination de la closure call `gauss()` × ~2,4M sur le run principal. `gaussian.ts` supprimé (le code est inliné dans `engine.ts` et `sensitivities.ts`).
3. **Greeks N : N/2 → N/4** — la diff finie centrée avec CRN converge bien à 15k paths. Économise 25 % du compute total.
4. **steps default : 60 → 40** — FV delta `0.00 %` pour psp_barrier (mesuré sur seed=42, N=60k, vs steps=60). Économise 33 % du compute. Caller peut toujours forcer `steps: 60` via override.
5. **Cumulative log return** — au lieu d'appeler `Math.exp` à chaque step (`N×steps` = 2,4M), on accumule `cumLog += drift + volStep·z` et on calcule `S = S0 · exp(cumLog)` une seule fois en fin de path. La condition de barrière `S ≥ B` devient `cumLog ≥ log(B/S0)`. **Effet mesuré : marginal** (V8 doit déjà optimiser Math.exp dans les hot inner loops). Conservé pour la propreté algorithmique.

## Décision steps=40

Adopté comme default. FV delta vs steps=60 sur psp_barrier seed=42 N=60k = **0,00 %** (les 2 simus convergent vers la même valeur à 4 décimales). Pour les vanilles (AGA / BSPCE / SO), le delta est encore plus petit. Le caller peut toujours passer `steps: 60` via override pour les barrières exotiques où la résolution temporelle compte.

## Calibration psp_barrier vs mockup

| Source              | FV            | Hit rate     | ITM final    |
| ------------------- | ------------- | ------------ | ------------ |
| Mockup live         | 13,27 €       | 41,8 %       | 34,8 %       |
| Phase 1 (PCG32)     | 13,14 €       | 41,4 %       | 34,7 %       |
| Phase 1.5 (xoshiro) | **12,9966 €** | (à vérifier) | (à vérifier) |

Écart vs mockup : **2,1 %** — dans la marge attendue PRNG TS ≠ moteur Python. Le bound `psp_target` du test reste `[12, 15]` (nouvelle FV bien dedans). Pas de resserrement à `[12,5; 13,5]` car la borne inférieure 12,5 est trop serrée — le PRNG xoshiro tombe à 12,9966 ce qui passerait, mais d'autres seeds pourraient sortir.

## Tests adaptés

- `prng.test.ts:xoshiro128pp_known_seed` — snapshot des 5 floats figés mis à jour : `0.09419437, 0.35485424, 0.76222215, 0.08994304, 0.12210429` (vs `0.76155828, 0.44811550, 0.95970718, 0.79600818, 0.48016406` Phase 1)
- `engine.test.ts:psp_target` — `psp_barrier` seed=42 N=60k FV = 12,9966 € (dans le bound `[12, 15]` préservé)
- Tous les autres tests passent sans modification : determinism, sanity_bounds × 5, greeks_signs, no_nan, hit_time, sensibilités

## Quality gates

- ✅ `pnpm typecheck` clean
- ✅ `pnpm test` : 1279/1279
- ✅ `pnpm lint` : baseline 55/41/14 préservée
- ✅ 0 nouvelle dépendance NPM
- ✅ Bench script supprimé avant commit (vivait dans `apps/web/src/lib/mc/__bench__/`)

## Engine prêt pour Phase 2 ?

**Avec Web Worker (Phase 2) : oui.** 742 ms n'est pas instantané mais le Web Worker rend le compute non-bloquant — l'UI reste fluide pendant les sliders. UX "loading 750ms" reste acceptable pour une démo IFRS 2. Phase 2 peut commencer.

**Sans Web Worker : marginal.** UI freeze 700ms par tweak slider serait perceptible. Round 2 d'optims serait nécessaire :

- **Round 2 si requis** : (a) loops spécialisées par preset (no-barrier / barrier / TSR — élimine les branches per-step), (b) approximation `Math.exp` polynomiale (perte 0,1 % FV mais 3-5× speedup sur exp-bound paths), (c) WASM/AssemblyScript pour le hot loop. Estimation : 250-400 ms atteignables.

## Engine architecture rappel

5 fichiers : `types.ts` (105) · `prng.ts` (90, xoshiro128++) · `presets.ts` (75) · `engine.ts` (340) · `sensitivities.ts` (95). Total ~700 LOC. `gaussian.ts` supprimé Phase 1.5 (inliné).

API publique inchangée : `runMonteCarlo(input)`, `runSensitivities(input, axis)`, `buildInput(preset, overrides)`, `PRESETS`, `ENGINE_VERSION = 'capiwise-mc-js-1.0.0'`.
