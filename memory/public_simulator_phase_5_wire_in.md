# Public Monte Carlo Simulator — Phase 5 Wire-in

**Branche** : `feat/public-mc-simulator` (PR #51 draft)
**Commit** : `feat(public-simulator): wire-in homepage + page produit (Phase 5)`
**Date** : 2026-05-07

## Recon trouvé

`grep -r "MonteCarloViewer" apps/web/src/` retourne 2 fichiers (hors `/dev/` et `/dashboard/`) :

1. **`apps/web/src/app/page.tsx`** ligne 16 + 163 :
   - Pilier ii Valorisation IFRS 2 dans `MktPillar` → `visual={<MonteCarloViewerCompact />}` (reverse layout, visual à gauche)

2. **`apps/web/src/app/produit/valorisation-ifrs2/page.tsx`** :
   - Ligne 32 : `<MonteCarloViewer />` (full mockup) dans la `customSection ReplayViewerSection`, sous le titre `Replay viewer · Module 11 · Le viewer Monte Carlo tel que vos auditeurs le voient`
   - Ligne 141 : `visual: <MonteCarloViewerCompact />` dans le bigFeature `Visualisation Monte Carlo native, pas un PDF mort` (ProductPage layout)

## Décisions

| Bloc                                       | Décision                                                                                | Justification                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage pilier ii                         | → `<McSimulatorLazy variant="compact" />`                                               | Variant compact non-interactif + CTA "Essayer →"                                                                                                                                                                                                                                                |
| Page produit `ReplayViewerSection` (l. 32) | → `<McSimulatorLazy variant="full" />` wrappé dans `<div id="simulateur" scroll-mt-24>` | Le visuel principal de la page, full interactif                                                                                                                                                                                                                                                 |
| Page produit BigFeature (l. 141)           | **Garde** `<MonteCarloViewerCompact />` legacy                                          | Si on met deux simulateurs lazy, deux Workers à instancier — gaspillage. Le BigFeature est un teaser plus haut, le full simulateur est le vrai outil interactif plus bas dans la page. Marqué `@deprecated` dans le source du composant — refactoré en Phase 6 (mini-mockup SVG ou simple PNG). |

## Refactor `McSimulator.tsx`

Prop `variant?: 'full' | 'compact'` (default `'full'`). Le variant `compact` :

- Masque PresetSelector, TweaksPanel, bouton "Nouveau seed", description italique
- KPICards : `variant="compact"` masque la grille 2x2 (Hit/Forfeited/ITM/Paths) — garde uniquement la card principale Juste Valeur 56px
- Layout simplifié : canvas (8fr) + KPI/CTA (5fr) au lieu de canvas (8/12) + sidebar (4/12)
- Hauteur canvas réduite : `h-[280px] sm:h-[320px] lg:h-[340px]` (vs `h-[400px] sm:h-[440px] lg:h-[500px]` en full)
- Header titre `[28px] md:[36px]` (vs `[36px] md:[44px]`)
- AuditPanel + AuditFooter conservés
- **CTA brass** "Essayer le simulateur →" → `/produit/valorisation-ifrs2#simulateur` (anchor)

## Lazy mount via IntersectionObserver

`McSimulatorLazy` wrap le simulateur. `rootMargin: '200px 0px'` pour pré-mount juste avant l'entrée en viewport. Worker + engine pas instanciés au mount du document — gain LCP/TBT homepage. Skeleton pulse marine (`McSimulatorSkeleton`) avec dimensions identiques pour zéro layout shift.

Fallback `IntersectionObserver === undefined` (jsdom / vieux nav) : mount direct via `queueMicrotask` (évite le warning ESLint `set-state-in-effect`).

## Bug grid `1.6fr_1fr` corrigé

**Symptôme** : `getComputedStyle(grid).gridTemplateColumns` retournait `15720px 151px` au lieu d'un ratio 1.6:1. Le canvas interne s'auto-expandait (pas de `min-width: 0` sur la column flex/grid → la column grandit à la taille intrinsèque du canvas).

**Fix** :

- `lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]` — `minmax(0, ...)` garantit que les fr unities ne grandissent pas au-delà de la largeur partagée
- `min-w-0` sur la column wrapper canvas pour autoriser le shrink en dessous de l'intrinsèque

Vérifié : grid cols = `296.6px 185.4px` (ratio ~1.6:1) au lieu de `15720px 151px`.

## Comparaison visuelle

|                                  | Avant (Phase 2.1)                                              | Après (Phase 5)                                                            |
| -------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Homepage pilier ii               | `MonteCarloViewerCompact` mockup statique (SVG inline 826 LOC) | `McSimulatorLazy variant=compact` interactif lazy-mount + CTA brass anchor |
| Page produit ReplayViewerSection | `MonteCarloViewer` mockup statique full                        | `McSimulatorLazy variant=full` interactif lazy-mount, anchor `#simulateur` |
| Page produit BigFeature teaser   | `MonteCarloViewerCompact` (encore)                             | `MonteCarloViewerCompact` (encore — Phase 6)                               |

## Captures runtime confirmées

**Homepage pilier ii** (1400×900 viewport) :

- Visual column 560px wide (côté gauche, reverse layout)
- Header italique "PSP barrière · simulateur IFRS 2" (28-36px responsive)
- Canvas 296px × 340px à gauche, KPI Juste Valeur + CTA "Essayer le simulateur →" 185px à droite
- Audit panel `seed XXXXXXXX · hash 0xXXXXXXXX · runtime XXX ms · 60k paths`
- Footer "moteur · GBM Box-Muller..."

**Page produit `#simulateur`** (1400×900 viewport) :

- Wrapper full-width 1305px wide (max-w-[1400px])
- 5 boutons preset (PSP barrière | AGA classique | BSPCE | Stock Options | TSR peer)
- 3 sliders Volatilité σ / Barrière B / Maturité T
- Bouton "↻ Nouveau seed"
- Anchor scroll au top viewport (`scroll-mt-24` sur le wrapper)

**CTA scroll homepage → page produit** : confirmé fonctionnel via `<Link href="/produit/valorisation-ifrs2#simulateur">` Next.js. Le `scroll-mt-24` sur le wrapper `#simulateur` garantit le scroll en évitant le sticky header.

## Composant legacy `monte-carlo-viewer.tsx`

**Pas supprimé Phase 5** — toujours utilisé par le BigFeature page produit. Marqué `@deprecated` dans la JSDoc en tête de fichier avec note de roadmap Phase 6 :

```ts
/**
 * @deprecated Phase 5 — Remplacer par McSimulator (variant compact ou full).
 * Encore utilisé en Phase 5 par produit/valorisation-ifrs2/page.tsx BigFeature
 * "Visualisation Monte Carlo native, pas un PDF mort" → MonteCarloViewerCompact.
 * À retirer en Phase 6 quand le BigFeature sera refactoré.
 */
```

## Quality gates

- ✅ `pnpm typecheck` clean
- ✅ `pnpm test` : 1295/1295 (1287 baseline + 8 hook tests Phase 2)
- ✅ `pnpm lint` : baseline 55/41/14 préservée
- ✅ Cache Turbopack purgé (`.next/` corrompu après long dev — fix `rm -rf .next`)
- ✅ Pages homepage + page produit servent en 200, simulateur lazy mount fonctionnel

## Hors scope Phase 5

- ❌ Phase 3 (Greeks panel + Convergence chart + Distribution payoffs / S(T) / hit-time histograms — data déjà calculée dans `result`)
- ❌ Phase 4 (Sensibilités barrière + volatilité — `runSensitivities` déjà disponible côté lib)
- ❌ Refactor du BigFeature teaser page produit (Phase 6)

## Prêt pour Phase 3

Le simulateur est désormais en production sur les 2 pages publiques cibles. Phase 3 pourra ajouter directement les composants secondaires sur le simulateur live (le hook expose déjà `result` avec convergenceCurve, payoffHistogram, terminalHistogram, hitTimeHistogram, et delta/vega/rho).
