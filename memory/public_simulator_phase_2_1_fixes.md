# Public Monte Carlo Simulator — Phase 2.1 Visual Fixes

**Branche** : `feat/public-mc-simulator` (PR #51 draft)
**Commit** : `fix(public-simulator): 6 visual fixes + canvas redraw bug (Phase 2.1)`
**Date** : 2026-05-07

## Diagnostic du bug critique canvas redraw

**Cause racine** : le `useEffect` avait bien les bonnes deps (`[result, params]`), et `clearRect` était appelé. Mais le `if (canvas.width !== cssW * dpr) canvas.width = cssW * dpr;` court-circuitait la réassignation des dimensions du canvas quand celles-ci ne changeaient pas. Or, **réassigner `canvas.width` auto-clear le buffer GPU** — c'est un nettoyage plus robuste que `clearRect` (qui peut laisser persister des artefacts si la transform matrix n'est pas reset).

**Fix appliqué** : `canvas.width = targetW; canvas.height = targetH;` **unconditionnellement** à chaque draw, en plus du `clearRect`. Ceinture + bretelles. Plus une dep défensive supplémentaire `result?.inputHash` + `result?.runtimeMs` dans le useEffect — strings/numbers qui changent à chaque run, garantit l'invalidation même si React équivait par référence sur les Float32Array transferred (théoriquement neufs à chaque worker postMessage avec transferable, mais on ne prend pas le risque).

Vérifié : un click sur "Nouveau seed" change seed 0000002a → 0000002b, hash 0x5003c490 → 0x614e3a72, FV 13,00 → 13,03 €, et les paths sont **visiblement** redessinés (trajectoires différentes, p95 différent).

## 6 Fixes appliqués

### Fix #1 — Coloration et tri des paths

`PathsCanvas.tsx` :

- Tri par catégorie ASC avant draw (forfeited en arrière-plan, ITM dessiné en dernier au-dessus)
- Opacités calibrées : forfeited `rgba(240,234,216,0.08)` (paper-50 dim, presque invisible), hit_otm `rgba(212,160,106,0.30)` (brass médium), hit_itm `rgba(79,181,138,0.55)` (bond dominant)
- Stroke widths : 0.6 / 0.7 / 0.8 par catégorie
- 1 `ctx.beginPath()` par catégorie (optimisation : groupe les paths de même style en un seul stroke)

### Fix #2 — Clip axe Y

Calcul du range Y :

- `p1` et `p99` calculés sur les prix terminaux des paths sample
- `yMax = min(p99 × 1.10, S0 × 2.8)` — cap les outliers
- `yMin = max(p1 × 0.90, S0 × 0.20)` — borne basse
- Inclusion forcée : barrière B, strike K, spot S0 dans la fenêtre visible

`ctx.save() / ctx.beginPath() / ctx.rect / ctx.clip()` autour du bloc de paths → débordements rognés au-delà des bordures.

### Fix #3 — seed ≠ hash

`AuditPanel` prend désormais `seed: number` en prop séparée de `result`. Affichage :

- `seed` ligne : `(seed >>> 0).toString(16).padStart(8, '0')` → ex `0000002a` pour seed=42
- `hash` ligne : `'0x' + result.inputHash` → SHA-256 truncated des inputs canonicalisés

Vérifié en runtime : tweak Vol/B/T change le hash, garde le seed. Click "Nouveau seed" incrémente le seed.

### Fix #4 — Slider thumb brass

Tailwind 4 arbitrary variants directement sur l'`<input type="range">` :

```
[&::-webkit-slider-thumb]:appearance-none
[&::-webkit-slider-thumb]:size-3.5
[&::-webkit-slider-thumb]:rounded-full
[&::-webkit-slider-thumb]:bg-[#D4A06A]
[&::-webkit-slider-thumb]:border-2
[&::-webkit-slider-thumb]:border-[#0B1124]
[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(212,160,106,0.3)]
[&::-moz-range-thumb]:size-3.5 ...
```

Plus disabled state à 30 % opacity. Reste dans la convention Tailwind du repo, pas de CSS séparé.

### Fix #5 — Annotations en bout de ligne

Pour chaque ligne horizontale (B, K, S₀, p5, p50, p95) le label est positionné à `x = canvas.width - PADDING.right + 6`, `y = ligne_y`.

Anti-overlap : tri des labels par y, écart minimum 13 px entre labels — décalage automatique des suivants si trop proches. Clipping dans la fenêtre canvas pour éviter sortie haut/bas.

**Fusion K/S₀** : si K === S0 (cas presets vanille où K=S₀=50), label fusionné `S₀ · STRIKE · 50 €` au lieu de deux lignes overlap.

### Fix #6 — Mini-card Paths

Sub-line passe de `60 000 simulés` à `40 pas · dt 0,087a` (steps=40, T=3.5y → dt=0.087y).

Pour ça, ajout de `N: number` et `steps: number` au type `McResult` (déjà disponibles en interne dans l'engine, juste exposés). `KPICards` prend `T` en prop, calcule `dt = T/steps` côté UI.

## Comparaison avec mockup d'origine — fidélité

| Élément                                                 | Mockup | Phase 2.1                            | Statut |
| ------------------------------------------------------- | ------ | ------------------------------------ | ------ |
| Titre serif italique "PSP barrière · simulateur IFRS 2" | ✅     | ✅                                   | ✅     |
| KPI principale FV 13,XX € avec IC95                     | ✅     | ✅ (13,00 €)                         | ✅     |
| 3 catégories de paths visuellement distinctes           | ✅     | ✅ (opacités 0.08/0.30/0.55)         | ✅     |
| Annotations p5/p50/p95/B/K/S₀ en bout de ligne          | ✅     | ✅ + anti-overlap auto + fusion K/S₀ | ✅     |
| Slider thumb brass sur track brass dim                  | ✅     | ✅ (Tailwind arbitrary variants)     | ✅     |
| Audit panel seed ≠ hash                                 | ✅     | ✅ (seed=0000002a, hash=0x5003c490)  | ✅     |
| Footer "moteur GBM · audit-ready · IFRS 2 §16-18"       | ✅     | ✅                                   | ✅     |

5/5 points de fidélité confirmés visuellement.

## Captures

État stable (psp_barrier seed=42, mount initial) :

- Titre `PSP barrière · simulateur IFRS 2` en Fraunces italique 44px
- KPI FV `13,00 €` Mono 56px, IC95 [12,78 ; 13,21]
- Audit `seed 0000002a · hash 0x5003c490 · runtime 916 ms · 60k paths`
- Canvas avec ~250 paths ITM verts visibles, ~50 OTM brass, 300 forfeited très subtils, p95 à 127 €, p50 à 46 €, BARRIÈRE 75 €, S₀·STRIKE 50 €
- 3 sliders avec thumbs brass-500 (Volatilité σ 32 %, Barrière B 75 €, Maturité T 3,50 ans)

Après "Nouveau seed" :

- seed `0000002b` (= 43), hash `0x614e3a72`, runtime 990 ms
- FV 13,03 €, hit 40,3 %, paths visiblement différents (canvas a redraw)

## Quality gates

- ✅ `pnpm typecheck` clean
- ✅ `pnpm test` : 1287/1287 (le mock McResult enrichi de `N: 60_000, steps: 40`)
- ✅ `pnpm lint` : baseline 55/41/14 préservée
- ✅ Bug canvas redraw : reproduit avant fix (seed change → canvas reste figé), corrigé (canvas redessine sur chaque change)
- ✅ Visual fidélité 5/5 vs mockup d'origine

## Prêt pour Phase 3

Engine + UI core + visual polish complets. Phase 3 ajoutera :

- Greeks panel (Δ/ν/ρ déjà dans `result`)
- Convergence chart (`result.convergenceCurve`)
- Distribution payoffs / S(T) / hit-time histograms (data déjà calculée)
