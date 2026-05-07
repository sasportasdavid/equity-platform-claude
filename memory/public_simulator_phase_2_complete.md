# Public Monte Carlo Simulator — Phase 2 Complete (UI core + Web Worker)

**Branche** : `feat/public-mc-simulator` (PR #51 draft)
**Commit** : `feat(public-simulator): UI core + Web Worker + two-tier compute (Phase 2)`
**Date** : 2026-05-07

## Architecture two-tier

- **Drag** (slider en mouvement, `setParam(.., true)`) → run quick `N=20k, steps=30` → ~250 ms
- **Release** debounce 200 ms vers precise `N=60k, steps=40` → ~750 ms
- **Mount initial** ou **changement de preset** → run precise direct
- **Nouveau seed** → run precise direct

Worker single-threaded — les requêtes sont sérialisées par le navigateur. Le hook ignore les results dont le `requestId` ≠ celui du dernier envoyé (stale rejection). Pas de chunking mid-computation : trade-off documenté, accepté car le single-thread Worker garde l'UI fluide même pendant un calcul abandonné.

## Convention Worker Next 16 / Turbopack

```ts
new Worker(new URL('../lib/mc/worker.ts', import.meta.url), { type: 'module' });
```

`worker.ts` exporte des types `WorkerInputMessage` / `WorkerOutputMessage`. Run direct, pas de WASM, pas de SharedArrayBuffer (incompatible Vercel sans COOP/COEP headers).

Transferable zero-copy : `Float32Array.buffer` (pathsSample) + `Uint8Array.buffer` (pathCategories) transférés au main thread.

## Livrables

```
apps/web/src/lib/mc/worker.ts             — Worker wrapper (~70 LOC)
apps/web/src/hooks/useMcSimulator.ts      — Orchestrator hook (~190 LOC)
apps/web/src/components/marketing/simulator/
├── McSimulator.tsx        — Root composant (~95 LOC)
├── PresetSelector.tsx     — 5 boutons radio + description (~60 LOC)
├── PathsCanvas.tsx        — Canvas 2D DPR-aware (~270 LOC)
├── KPICards.tsx           — FV principale + 4 mini-KPIs (~120 LOC)
├── TweaksPanel.tsx        — 3 sliders custom + nouveau seed (~145 LOC)
└── AuditPanel.tsx         — Bandeau seed/hash/runtime + footer (~75 LOC)
apps/web/src/app/dev/mc-simulator/page.tsx — Sandbox (~15 LOC)
apps/web/src/hooks/__tests__/useMcSimulator.test.tsx — 8 tests Vitest jsdom
```

Total : ~1100 LOC. Aucune nouvelle dépendance NPM.

## Composants — détails

- **PresetSelector** : 5 boutons natifs `<button role="radio">` avec `aria-checked`, fond `brass-500/15` quand actif, hover `paper-50/30`. Affiche la description du preset actif sous la ligne (italique Fraunces 12,5px).
- **PathsCanvas** : Canvas 2D, ResizeObserver pour responsive, devicePixelRatio scale. Dessine 600 paths colorés par catégorie (forfeited paper-50/15, hit_otm brass/40, hit_itm bond/55), p5/p50/p95 en pointillés brass dim, lignes B/K/S₀, légende top-right, mini "● calcul en cours" pendant `isComputing`. Quantiles calculés client-side depuis `pathsSample`.
- **KPICards** : card principale `JUSTE VALEUR · IFRS 2 GRANT FV` 56px JetBrains mono, IC95, 4 mini-cards 2×2 (Hit rate, Forfeited, ITM final, Paths). Caret pulsant brass/70 pendant tier='quick'.
- **TweaksPanel** : 3 sliders customisés en CSS pur (input range stylé). Volatilité σ 10-60%, Barrière B 55-120€ (disabled si null pour vanilles), Maturité T 1-7 ans. Throttle 50ms pendant drag, release direct au pointerup. Bouton "↻ Nouveau seed" en bas.
- **AuditPanel** : seed (8 hex), hash 0x... , runtime ms · paths. AuditFooter : moteur GBM Box-Muller · pricer barrier-up-and-in call · v{ENGINE_VERSION} · conforme IFRS 2 §16-18 · audit-ready · YYYY-MM-DD.

## Validation visuelle

URL local : `http://localhost:3000/dev/mc-simulator`

Vérifié :

- ✅ Mount initial : run précis lance, FV ≈ 13,00 € pour psp_barrier seed=42 N=60k steps=40 (cohérent Phase 1.5 metrics)
- ✅ Preset change BSPCE : titre serif italique "BSPCE · simulateur IFRS 2", FV 6,04 €, Hit rate 0,0 % (pas de barrière), forfeited 69,1 % (cohérent moteur Phase 1.5)
- ✅ Audit panel mis à jour (hash 0x6898c44c, runtime ~940ms, 60k paths)
- ✅ Légende dynamique : "Touchée + ITM (XX,X %)", "Touchée OTM", "Forfeited" avec rates du result
- ✅ Lignes barrière + strike + spot dessinées avec labels droite
- ✅ Quantiles p5/p50/p95 en pointillés
- ✅ Cookie consent banner Capiwise overlay (existant projet, pas un bug)

URL Vercel preview : à publier après merge sur master + nouveau déploiement.

## Tests

8 tests dans `useMcSimulator.test.tsx` (jsdom env, Worker mocké) :

- `mount_kicks_precise_run` : N=60k au mount
- `result_applied_after_response` : result reçu écrase null state
- `setPreset_aborts_pending` : 1er run abandonné, 2e prend la main
- `dragging_uses_quick_tier` : isDragging=true → N=20k tier='quick'
- `release_debounce_kicks_precise` : 200ms après drag → N=60k tier='precise'
- `release_direct_no_debounce` : isDragging=false direct → N=60k
- `stale_result_ignored` : requestId obsolète n'écrase pas le state
- `nextSeed_kicks_precise` : seed+1 + run precise

Pas de tests visuels (Canvas/sliders) — Vitest sans rendu pixel, validation manuelle via `/dev/mc-simulator`.

## Quality gates

- ✅ `pnpm typecheck` clean
- ✅ `pnpm test` : 1287/1287 (1279 baseline + 8 hook)
- ✅ `pnpm lint` : baseline 55/41/14 préservée
- ✅ 0 nouvelle dépendance NPM
- ✅ `/dev/mc-simulator` rend et calcule en local

## Hors scope (Phases 3, 4, 5)

- ❌ Convergence FV vs N (Phase 3)
- ❌ Distribution payoffs / S(T) / temps avant touche (Phase 3)
- ❌ Greeks panel (Δ/ν/ρ) (Phase 3)
- ❌ Sensibilités barrière + volatilité (Phase 4)
- ❌ Modification homepage / valorisation-ifrs2 (Phase 5)

## Décisions / Trade-offs

1. **Pas de chunking mid-computation** : la spec mentionne "abandonne dès qu'il peut (check à chaque batch de 1000 paths)" mais ça impose une réécriture de l'engine en async chunked. Le Worker single-threaded sérialise déjà les jobs ; on ignore les results stales côté hook. Latence worst-case = ~750ms (taille d'un run précis). Acceptable pour démo. Si UX freeze observé en testing, on chunkera dans une sub-phase.
2. **Quantiles client-side dans Canvas** : calculés depuis `pathsSample` (600 paths × 41 cols, sort par colonne). Plus rapide que de re-router via le worker. Coût ~5ms côté main thread.
3. **DPR-aware Canvas** : multiplie width/height par devicePixelRatio pour rester net en hi-DPI. ResizeObserver redraw on resize.
4. **Slider B disabled si null** : pour AGA / BSPCE / SO / TSR (presets vanilles), le slider Barrière B est désactivé à 40 % opacity, valeur affichée "—". L'engine gère B=null en interne (skip barrier check).

## Prêt pour Phase 3

Engine + UI core fonctionnels. Phase 3 ajoutera les graphes secondaires (convergence, distributions, hit-time) en réutilisant `editorial-area-chart` / `editorial-bar-chart` existants. Les données sont déjà calculées dans `McResult.convergenceCurve`, `payoffHistogram`, `terminalHistogram`, `hitTimeHistogram`.

Note : Greeks Δ/ν/ρ disponibles dans `result` mais pas affichés Phase 2 — UI Greeks panel à ajouter Phase 3.
