---
name: Design System V1f — Vesting Timeline audit B0 (PR #38)
description: Audit pré-code de VestingTimeline — refonte vers la spec canonique cw-vt 4 segments agrégés (acquired/live/future/cond)
type: project
---

# B0 — Audit VestingTimeline (PR #38)

**Date** : 2026-05-05
**Branche** : `feat/design-system-v1f-vesting-timeline`
**Référence visuelle** : `Mockup_capiwise.pdf` page 2 (Plan detail "03 - Plan detail · Vesting Timeline")
**Sources canoniques** : `cw-screen-plan.jsx` (lignes 67-88) + `tokens.css` `.cw-vt*` + `docs/DESIGN_SYSTEM_V1_TERRACOTTA.md` §5.4
**Brief** : `docs/PR_38_BRIEF_VESTING_TIMELINE.md`

> **Scope** : refonte de `apps/web/src/components/awards/vesting-timeline.tsx` vers la spec canonique cw-vt — 4 segments **agrégés** par état (`acquired/live/future/cond`) en flex layout, repère TODAY avec label "AUJOURD'HUI", 5 ticks avec sub-label cliff, ligne cumulative 5 entrées, légende 4 swatches. Variant `simplified` pour portail bénéficiaire (ticks "Mar 2026" courts).

---

## 1. Composant existe — où, props actuels, qui le consomme ?

**OUI** — `apps/web/src/components/awards/vesting-timeline.tsx` (387 lignes, livré DS V1 Étape 9 commit `eaf2910` puis Plan detail Étape 13 `d67873b`).

**API actuelle** :

```ts
export type VestingTimelineTranche = {
  vestingDate: string; // ISO YYYY-MM-DD
  unitsToVest: number;
  cumulativePct: number;
  cumulativeUnits: number;
  status: 'VESTED' | 'PENDING' | 'FORFEITED';
  hasPerformanceCondition?: boolean;
  conditionLabel?: string;
};

export type VestingTimelineProps = {
  tranches: ReadonlyArray<VestingTimelineTranche>;
  vestingStart: string; // ISO YYYY-MM-DD
  vestingEnd: string; // ISO YYYY-MM-DD
  today?: string; // optional (default = today)
  simplified?: boolean; // portal mode
  theoreticalMode?: boolean; // mode plan vs award (Plan detail)
  unitsGranted: number;
  className?: string;
};
```

**Consommateurs réels** (3 emplacements, tous à re-tester après refonte) :

| Consumer                                   | Mode                   | Path                                                                 |
| ------------------------------------------ | ---------------------- | -------------------------------------------------------------------- |
| `EditorialSynthesisTab` (Plan detail)      | `theoreticalMode=true` | `apps/web/src/components/plans/detail/EditorialSynthesisTab.tsx:160` |
| `EditorialVestingSection` (Portail bénéf.) | `simplified=true`      | `apps/web/src/app/portal/components/EditorialVestingSection.tsx:71`  |
| Sandbox dev                                | divers presets         | `apps/web/src/app/dev/design/vesting-timeline/page.tsx`              |

**Conclusion** : conserver le **type `VestingTimelineTranche`** (déjà bien structuré), conserver les **props** principaux (`tranches/vestingStart/vestingEnd/today/simplified/theoreticalMode/unitsGranted`), mais **réécrire l'implémentation interne** pour matcher la structure canonique cw-vt (flex segments au lieu de layers absolus).

## 2. Logique actuelle — comment rend-il les zones ?

**Pas 37 stripes individuelles** — le brief PR #38 s'est trompé sur ce point. L'implémentation actuelle utilise déjà des layers agrégés mais en **positionnement absolu** :

- Layer 1 — fond "À acquérir" : `<div absolute inset-0>` avec `repeating-linear-gradient(45deg)` ink-300 (donne l'illusion de stripes mais c'est UN seul pattern)
- Layer 2 — zones "Conditionnel" : N `<div absolute>` superposées avec `repeating-linear-gradient(90deg)` brass + masque paper-100 dessous
- Layer 3 — "En cours" : `<div absolute>` gradient bond → ink
- Layer 4 — "Acquis" : `<div absolute left-0>` bond-500 plein avec animation `vesting-fill 800ms`
- Layer 5 — `<svg>` avec ticks fins ink-500 par tranche + ligne TODAY brass-500 pulse

Donc l'agrégation par % existe DÉJÀ, mais :

- **structure non-flex** : positionnement `left/width %` absolu (vs canonique flex avec 4 div consécutifs)
- **pas de label "AUJOURD'HUI"** — juste une ligne pulsante (le brief veut le mot "AUJOURD'HUI" mono brass-700 0.16em letter-spacing au-dessus)
- **pas de 5 ticks dates** intermédiaires — uniquement start + end (ligne 288-291)
- **pas de ligne cumulative 5 entrées** — uniquement "0%" et "100% · {N} u." (ligne 294-298)
- **pas de sub-label cliff** sur le 2e tick (le mockup veut "15.03.2027" + ligne du dessous "· cliff · 25 %" en brass-700 weight 600)
- **calcul `acquisEndPct/enCoursStartPct` from `tranches[i].xPct`** au lieu d'**agrégation explicite par état** — fonctionne mais moins lisible que la formule canonique du brief (`acquired = sum % vested non-cond`, `live = elapsedPct - acquired`, `cond = sum % cond non-vested`, `future = 100 - acquired - live - cond`).

**Décision V1f** : refactor en gardant la même API publique mais avec :

1. Helpers extraits dans `apps/web/src/lib/vesting-helpers.ts` :
   - `computeSegments(tranches, vestingStart, vestingEnd, today): { acquired, live, future, cond }` — formule du brief, **logique testable indépendamment du rendu**.
   - `buildDefaultTicks(vestingStart, vestingEnd, cliffDate?): TickConfig[]` — 5 ticks équidistants, marque cliff sur le 2e si fourni.
   - `formatVestingDateLong(iso)` — `15.03.2026`
   - `formatVestingDateShort(iso)` — `Mar 2026` (variant simplified)
   - `formatCumulativeLine(pct, units)` — `25 % · 1 050 u.`
2. Refonte du JSX pour matcher la structure cw-vt (`.cw-vt > .cw-vt-ticks + .cw-vt-bar (flex 4 segs) + .cw-vt-now + .cw-vt-cum + .cw-vt-legend`).
3. Ajout des classes CSS `cw-vt*` dans `globals.css` (selon brief §CSS).

## 3. Données — query retourne-t-elle vesting_date + percentage_of_award + is_conditional ?

**OUI sur les 2 premiers, NON pour `is_conditional` direct**. Inventaire :

- `vesting_tranches` table : a `vesting_date` + `percentage_of_award` + `sort_order` ✓
- **Pas de colonne `is_conditional`** sur `vesting_tranches`. Au lieu de ça : `plans.conditions[]` (table jointe) liste les conditions du plan globalement. Si `conditions.length > 0`, **toutes les tranches** du plan sont actuellement traitées comme conditionnelles (cf `EditorialSynthesisTab.tsx:60`) :

  ```ts
  const hasConditions = detail.conditions.length > 0;
  // ... toutes les tranches reçoivent hasPerformanceCondition: hasConditions
  ```

  → Granularité par tranche reportée V2 (cf commentaire ligne 58).

- `vesting_events` table (côté award) : a `scheduled_date` + `units_to_vest` + `status` (PENDING/VESTED/FORFEITED) — pas non plus de flag `is_conditional` direct, mais `await_id → award.plan_id → plans.conditions[]`. Idem agrégat plan-level.

**Décision V1f** : conserver le pattern actuel (`hasPerformanceCondition: boolean` sur la prop `Tranche` reçue par le composant). C'est aux callers (EditorialSynthesisTab, EditorialVestingSection) de fournir le flag — pas le rôle de `VestingTimeline`. La logique `computeSegments` lit le flag depuis chaque tranche.

**Adaptation V1f** : pour la card "BSPCE-2026-001" du mockup avec 20% conditionnel, le caller doit marquer **les 20% finaux** des tranches comme conditional. Avec la granularité plan-level actuelle, on simplifie : si `hasConditions` est true au niveau plan, on calcule `cond = X%` selon la **proportion fixe** (ex hardcodée à 20% du span) OU on marque les N dernières tranches comme conditional. **Décision** : exposer une prop additionnelle `conditionalPercentage?: number` (default `undefined` = pas de cond) qui, si fournie, applique aux N dernières tranches dont la somme est ≥ ce %. Cf §5.

## 4. Variant `simplified` — différences vs default ?

**Partiellement supporté** :

- **Existant** : `simplified={true}` rend les labels au format mois court "Mar 2026" via `formatDate(iso, true)` (lignes 359-382). Couvre le cas portail bénéficiaire.
- **Manque** :
  - Pas de différence sur les **ticks intermédiaires** — actuellement aucun tick rendu en mode simplified ni default.
  - Pas de différence sur la **légende** — affichée à l'identique en simplified et default.
  - Pas de différence sur la **ligne cumulative** — actuellement absente partout.

**Décision V1f** : étendre `simplified` pour gérer :

1. Format ticks `Mar 2026` (vs `15.03.2026` default) — déjà OK.
2. Sub-label cliff `· cliff · 25 %` rendu en brass-700 weight 600 — **identique** simplified et default (pas de différence métier).
3. Ligne cumulative — afficher en simplified ET default. Le mockup portail (`cw-screen-portal.jsx`) montre `0 / 300 u. (25 %) / 600 u. (50 %) / 900 u. (75 %) / 1 200 u. (100 %)` (ordre inversé "units · pct" au lieu de "pct · units"). **Décision** : adapter l'ordre selon `simplified` :
   - default : `pct % · {units} u.` (ex `25 % · 1 050 u.`)
   - simplified : `{units} u. ({pct} %)` (ex `300 u. (25 %)`)

## 5. CSS `cw-vt-*` déjà partiellement en place ?

**NON — 0 classe `cw-vt*` dans `apps/web/src/app/globals.css`** (`grep cw-vt` → uniquement matches sur `--paper-100` qui est l'antithèse).

**À ajouter** dans `globals.css` (selon brief §CSS) :

| Classe                 | Rôle                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `.cw-vt`               | container : `bg paper-50 border 1px paper-300 radius 10 padding 32 24 36`             |
| `.cw-vt-ticks`         | flex space-between, mono 10.5px ink-500 mb-2 tabular                                  |
| `.cw-vt-bar`           | h 28px flex border-radius 3 overflow-hidden bg paper-200                              |
| `.cw-vt-seg.acquired`  | bond-500 plein                                                                        |
| `.cw-vt-seg.live`      | gradient bond-500 → ink-700                                                           |
| `.cw-vt-seg.future`    | repeating-linear-gradient 45° ink-300/paper-200 6/12                                  |
| `.cw-vt-seg.cond`      | repeating-linear-gradient 90° brass-500/transparent 4/8 + border 1px dashed brass-500 |
| `.cw-vt-now`           | absolute width 1.5px brass-500 box-shadow 3px alpha 0.18                              |
| `.cw-vt-now::after`    | "AUJOURD'HUI" mono 9.5 brass-700 0.16em uppercase top -22 left 50%                    |
| `.cw-vt-cum`           | flex space-between mono 11 ink-700 weight 500 mt-2 tabular                            |
| `.cw-vt-legend`        | flex gap 18 flex-wrap mt-4 text-xs ink-700                                            |
| `.cw-vt-legend-item`   | inline-flex items-center gap-2                                                        |
| `.cw-vt-legend-swatch` | w 14 h 10 radius 2                                                                    |

⚠️ **Anti-pattern à éviter** : la classe canonique `.cw-vt-bar` utilise `display: flex` et chaque segment a `width: X%` direct. La somme des 4 widths doit être **exactement 100%** sinon le dernier segment soit dépasse soit laisse un trou. La fonction `computeSegments` doit normaliser pour que `acquired + live + future + cond === 100`.

---

## 📊 Récap des écarts mockup vs prod (table action)

| #   | Zone                                           | État actuel                                              | Cible cw-vt canonical                                                                | Action B1f                                                                                                         |
| --- | ---------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Container `.cw-vt` bordure radius              | non — wrapper sans bordure                               | bg paper-50 + border 1px paper-300 + radius 10                                       | **Ajouter classe** + override possible (e.g. theoreticalMode `border:none` si caller veut le placer dans une card) |
| 2   | Bar layout (flex vs absolute)                  | absolute layers stacked                                  | flex 4 segments consécutifs                                                          | **Refactor JSX** flex                                                                                              |
| 3   | Segment `acquired`                             | ✓ bond-500 (animation 800ms)                             | bond-500 plein                                                                       | **Garder** + animation `vesting-fill` reduced-motion-safe                                                          |
| 4   | Segment `live`                                 | gradient bond → ink ✓                                    | gradient identique                                                                   | **Garder** logique                                                                                                 |
| 5   | Segment `future`                               | hachures 45° denses 5/6.5px                              | hachures 45° **6/12px** (espacement plus large brief)                                | **Ajuster** spacing pattern                                                                                        |
| 6   | Segment `cond`                                 | verticales brass 28/29.5px                               | dashed brass-500 + repeating 90° 4/8px + border 1px dashed                           | **Refactor** pattern + ajouter border                                                                              |
| 7   | Position TODAY                                 | line SVG pulse                                           | div absolute brass 1.5px + box-shadow halo                                           | **Refactor** en div CSS                                                                                            |
| 8   | Label "AUJOURD'HUI"                            | ❌ absent                                                | mono 9.5 brass-700 0.16em uppercase au-dessus                                        | **Ajouter** ::after CSS ou span explicite                                                                          |
| 9   | 5 ticks dates                                  | ❌ uniquement start + end                                | 5 ticks (start + cliff + 2 intermédiaires + end)                                     | **Ajouter** rendu via `buildDefaultTicks`                                                                          |
| 10  | Sub-label cliff "· cliff · 25 %"               | ❌ absent                                                | sur le 2e tick brass-700 weight 600                                                  | **Ajouter** prop `subLabel` sur TickConfig                                                                         |
| 11  | Ligne cumulative 5 entrées                     | ❌ uniquement 0%+100%                                    | 5 entrées `0% · 25%·1050u · 50%·2100u · 75%·3150u · 100%·4200u`                      | **Ajouter** rendu via `formatCumulativeLine`                                                                       |
| 12  | Variant `simplified` ticks "Mar 2026"          | ✓ format date court                                      | idem                                                                                 | **Garder**                                                                                                         |
| 13  | Variant `simplified` cumul `units (pct)`       | ❌ pas implémenté                                        | "300 u. (25 %)" portail                                                              | **Ajouter** branchement format                                                                                     |
| 14  | Légende 4 entrées swatches 14×10               | ✓ 3-4 items selon zones                                  | swatches 14×10 (pas 12×12)                                                           | **Ajuster** dimensions                                                                                             |
| 15  | Helpers extraits testables                     | ❌ logique inline composant                              | `computeSegments` + `buildDefaultTicks` + 3 formatters dans `lib/vesting-helpers.ts` | **Extraire** pour tests Vitest                                                                                     |
| 16  | a11y `<figure role="figure" aria-label>`       | ❌ wrapper `<div>`                                       | figure + aria-label "Chronologie de vesting de YYYY à YYYY"                          | **Refactor** wrapper                                                                                               |
| 17  | a11y bar `role="img" aria-label="N % acquis…"` | ❌ wrapper sans rôle                                     | role img + label texte calculé                                                       | **Ajouter**                                                                                                        |
| 18  | a11y TODAY `aria-label`                        | ❌ ligne sans label                                      | "Position actuelle : 30 avril 2026, 3,1 % du span"                                   | **Ajouter**                                                                                                        |
| 19  | a11y légende `<dl><dt><dd>`                    | ❌ liste de spans                                        | sémantique `<dl>`                                                                    | **Refactor**                                                                                                       |
| 20  | Empty state 0 tranches                         | ✓ partiellement (caller vérifie `tranches.length === 0`) | "Aucune tranche programmée…" italic Fraunces                                         | **Add** intégré dans le composant (pour cohérence visuelle, pas dépendre du caller)                                |

---

## 🎯 Plan d'implémentation (3 commits feature après audit)

**Commit 1 (audit B0)** : ce memo + push branche.
**Commit 2 (B1)** : `apps/web/src/lib/vesting-helpers.ts` :

- `computeSegments(tranches, start, end, today): { acquired, live, future, cond }` (normalisé somme=100).
- `buildDefaultTicks(start, end, cliffDate?, count=5)` — 5 ticks équidistants, sub-label cliff sur celui le plus proche.
- `formatVestingDateLong / formatVestingDateShort / formatCumulativeLine`.
- Tests Vitest 5+ : segments BSPCE-2026-001 au 30/04/2026 = `0/3.1/76.9/20`, post-cliff, vesting terminé, today<start, today>end.
  **Commit 3 (B2)** : refactor `VestingTimeline` JSX vers structure cw-vt + classes CSS `cw-vt*` ajoutées dans `globals.css`. Variant `simplified` pour cumul portail. a11y figure/role/aria-label/dl. Vérifier que les 3 consommateurs (Plan detail, Portail bénéficiaire, sandbox) rendent correctement.

---

## ⚠️ Risques identifiés

1. **Régression visuelle sur 2 écrans** (Plan detail + Portail bénéficiaire) : il faut vérifier les 2 dans la preview après refactor. La sandbox `/dev/design/vesting-timeline` couvre plusieurs presets (avant cliff, après cliff, vesting fini, vesting non démarré, conditionnel).
2. **Hydration mismatch** : le composant utilise `today ?? new Date().toISOString().slice(0,10)` côté client. Pour le rendu RSC (Plan detail / Portail), passer `today` en prop depuis le serveur — sinon mismatch après hydration. **Décision V1f** : rendre `today` **requis** (string ISO) côté API publique, et que les callers fassent `today={new Date().toISOString().slice(0,10)}` côté server. Mais cela casserait les usages existants → conserver `today?` optional côté composant et **calculer le default côté server** dans les wrappers (EditorialSynthesisTab, EditorialVestingSection) pour stabiliser l'hydration.
3. **CSS cw-vt classes globales** : pas d'isolation CSS modules. OK pour V1 (cohérent avec le reste du DS V1 qui utilise `text-overline`, `text-h1` etc. comme utilities globales). Pas de collision attendue (le préfixe `cw-` est unique).
4. **`ConditionalPercentage` : granularité plan-level vs tranche-level** : V1f conserve l'approche "toutes les tranches conditionnelles si `hasConditions`" (fait par le caller). Si on veut le `0/3.1/76.9/20` exact du mockup, il faut que le caller marque les 20% finaux comme conditional. **Décision V1f** : exposer la prop `conditionalPercentage?: number` qui, si fournie, **override** la dérivation depuis `tranches.hasPerformanceCondition`. Le caller peut donc passer `conditionalPercentage={20}` pour atteindre exactement le ratio mockup (= 4 tranches sur 20% du total marquées cond, ou simplement 20% du segment "cond" sans mapper aux tranches individuelles).
5. **Animation `vesting-fill 800ms`** : conserver, déjà reduced-motion-safe (le `@media (prefers-reduced-motion: reduce)` global dans globals.css ligne 509 désactive toutes les animations).
6. **legacy `theoreticalMode`** : prop spécifique au Plan detail (pas d'acquired car plan ≠ award). Conserver le comportement : si `theoreticalMode === true`, `acquired = 0` et legend item "Acquis" remplacé par "Période courante".

---

## ✅ Conclusion B0

**Foundation solide** : le composant existe, l'API est bonne, les 3 consommateurs sont identifiés, la palette + tokens cw sont déjà là. Le travail consiste à :

1. **Extraire** les helpers de calcul dans `lib/vesting-helpers.ts` (testable).
2. **Refactorer** le JSX vers la structure flex canonique (4 segments empilés horizontalement au lieu de 4 layers absolus).
3. **Ajouter** les manquants : ticks 5, sub-label cliff, label "AUJOURD'HUI", ligne cumulative 5 entrées.
4. **Ajouter** les classes `cw-vt*` dans `globals.css` (sans casser les existants — préfixe unique).
5. **Améliorer** l'a11y (figure, role img, aria-label dynamiques, dl).

**Pas de bloqueur** identifié. Démarre direct le coding sur le commit B1 (helpers + tests).
