---
name: Design System V1e — Dashboard KPI cards audit B0 (PR #37)
description: Audit pré-code des 5 KPI cards du Dashboard CFO (1 Hero + 4 satellites) — comparaison mockup Capiwise vs prod actuelle, réponse aux 5 questions du brief PR #37
type: project
---

# B0 — Audit Dashboard KPI cards (PR #37)

**Date** : 2026-05-05
**Branche** : `feat/design-system-v1e-dashboard-kpi`
**Référence visuelle** : `Mockup_capiwise.pdf` page 1 — zone KPI sous le hero
**Sources canoniques** : `cw-chrome.jsx` (Sparkline + KpiCard), `cw-chrome2.jsx` (Sparkline2 + HeroKpi), `cw-screen-dashboard.jsx` (5 cards d'usage), `tokens.css` (.cw-kpi/.cw-kpi-val/.cw-badge/.cw-spark)
**Référence éditoriale** : `docs/DESIGN_SYSTEM_V1_TERRACOTTA.md` (master) §5.1 KpiCard + §5.2 Sparkline
**Brief** : `docs/PR_37_BRIEF_DASHBOARD_KPI_v2.md`

> **Scope** : 1 HeroKpi asymétrique 1.5× (Fair Value 12,4 M€) + 4 satellites en grille 2×2 (Alertes / Vesting 30j / Bénéficiaires / Cap libre ESOP) + 2 composants Sparkline distincts (basique + riche) + Badge `bond.live`. Hors scope : table "Plans actifs" + zone basse droite Alertes/Activité = PR #38.

---

## 1. KpiCard existe — props compatibles avec `live`/`spark`/`narrative` ?

**OUI mais incompatibilité majeure**.

`apps/web/src/components/shared/kpi-card.tsx` (360 lignes, livré DS V1 Étape 6 commit `97c143e`) utilise une **API propre mais non alignée** sur la spec canonique `cw-chrome.jsx` :

| Aspect              | Legacy KPICard (apps/web)                               | Canonique cw-chrome.jsx                                                     |
| ------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Sparkline rendering | **Recharts AreaChart** + overlay React                  | **Pure SVG** (polyline + gradient + 2 circles)                              |
| Props value         | `value: number \| string \| null` (empty state intégré) | `value: string` (toujours)                                                  |
| Props sparkline     | `sparklineData: ReadonlyArray<{x,y}>`                   | `spark: number[]`                                                           |
| Trend détection     | Auto sur 3 derniers points                              | Prop `sparkTrailDown: boolean` explicite                                    |
| Anchor point        | Cercle creux 8px + plein 5px                            | Anneau r=4 + plein r=2.2                                                    |
| Final value text    | `heroMode` only, mono ink-900                           | **TOUJOURS** affichée à droite, mono 11 ink-700 (ou title-700 si trailDown) |
| Hero variant        | `size: 'hero'` (interne)                                | Composant séparé `HeroKpi`                                                  |
| Narrative italic    | `italicCommentary` (hero only)                          | `narrative` standalone Fraunces 14 + `font-variation-settings: 'opsz' 144`  |
| Empty state         | Intégré via `value === null`                            | Caller's responsibility                                                     |
| Live badge          | `statusBadge: { tone, pattern: 'pulse', label }`        | `live: boolean` shorthand                                                   |

**Légende d'usage actuel** (legacy KPICard) :

- `apps/web/src/components/dashboard/SatelliteKpis.tsx` (4 wrappers : ComplianceAlertsKPI, VestingNext30DaysKPI, ActiveBeneficiariesKPI, AwardsAwaitingApprovalKPI)
- `apps/web/src/components/dashboard/HeroFairValueCard.tsx` (n'utilise PAS KPICard — hero custom avec EditorialAreaChart Recharts)
- `apps/web/src/components/awards/detail/AwardHeroKpis.tsx` (autre page non-scope V1e)

**Décision V1e** : ne pas toucher au `KPICard` legacy (préserve les autres pages Awards/Plans/Portail). Créer **2 nouveaux composants dédiés** alignés cw-chrome.jsx :

1. `apps/web/src/components/dashboard/KpiCardEditorial.tsx` — slim, pure SVG Sparkline embarquée, props `{ overline, value, unit, delta, deltaDir, ctx, spark, sparkColor, sparkTrailDown, link, live }`.
2. `apps/web/src/components/dashboard/HeroKpi.tsx` — variante Sparkline2 + narrative italic + `gridRow: span 2`.

Et **réécrire** `dashboard/page.tsx` + `SatelliteKpis.tsx` + `HeroFairValueCard.tsx` pour brancher les nouveaux composants.

## 2. Sparkline existe ? Sparkline2 ?

**NON aux deux** — pas de composant standalone Sparkline ni Sparkline2 dans `apps/web/src/components/shared`. La logique sparkline du dashboard vit inline dans :

- `kpi-card.tsx::FinalAnchorPoint` (overlay) + `<Area>` Recharts dans le rendu principal (lourd, pas pure SVG)
- `HeroFairValueCard.tsx` utilise `EditorialAreaChart` (Recharts wrappé)

**À créer from scratch** (path : `apps/web/src/components/shared/`) :

### `Sparkline.tsx` (basique — viewBox `0 0 width height+2`, default 200×32)

```tsx
- 1 gradient horizontal : ink-300 → color (default brass-500)
- Polyline fill 0.08 (zone fermée)
- Polyline stroke 1.5
- Anchor final OBLIGATOIRE :
  - <circle r="4" fill="none" stroke={dotColor} strokeWidth="1.5" opacity="0.9"/>
  - <circle r="2.2" fill={dotColor}/>
- dotColor = trailDown ? title-500 : color
- a11y : role="img" + <title> + <desc>
```

### `Sparkline2.tsx` (riche — viewBox `0 0 width height`, default 280×48)

```tsx
- 2 gradients (stroke gradient ink → color, fill gradient color 0 → 0.18)
- 3 ticks baseline (x=0, width/2, width — y1=h-2 → y2=h-6 stroke ink-300)
- Polyline fill avec inset 8px top + 16px bottom
- Polyline stroke 1.5 round caps/joins
- Hollow points intermédiaires : 1 sur 3 (sauf dernier) — r=1.4 fill=paper-50 stroke=ink-400
- Last point cuivre rempli : r=3.5 fill=color stroke=paper-50 strokeWidth=1.5 à [last[0]-2, last[1]]
- 3 labels ticks dates mono 9px ink-400 (start/middle/end)
- ID gradients aléatoires (collision-free pour multi instances)
```

**Adaptation V1e** : ID gradients via `useId()` React (déterministe SSR vs canonique `Math.random()`).

## 3. Badge `bond.live` déjà en place ? Pulse animation ?

**OUI — l'infra est complète, pas de travail CSS supplémentaire**.

`apps/web/src/components/ui/status-badge.tsx` expose `<StatusBadge tone={...} pattern="pulse">` qui rend exactement le pattern attendu :

- 5 tones : `bond | brass | slate | saffron | title`
- 4 patterns : `solid | dotted | pulse | lock`
- `pattern="pulse"` rend un dot 6px à gauche avec `animate-pulse-live` (keyframe `pulse-live` déjà défini globals.css ligne 432)
- `prefers-reduced-motion: reduce` désactive globalement les animations (globals.css ligne 509)

Pour `cw-badge bond live` du brief :

```tsx
<StatusBadge tone="bond" pattern="pulse">
  Live
</StatusBadge>
```

**Pas besoin** d'ajouter `cwpulse` keyframe ni nouvelles classes CSS — déjà couvert par `pulse-live`.

⚠️ Le brief insiste sur **`bond.live` ≠ `title.live`** :

- `bond.live` = signal "en direct" doux (utilisé sur "Alertes conformité" KPI 2×2)
- `title.live` = alerte critique pulse rouge (réservé zone basse droite, **PR #38** uniquement)

→ Pour PR #37, on ne touche QUE le `bond.live` sur la card "Alertes conformité" KPI. Aucun `title.live` introduit.

## 4. Dashboard page — structure + queries existantes ?

`apps/web/src/app/(dashboard)/dashboard/page.tsx` charge déjà tout le nécessaire (livré PR #36) :

```ts
const [
  fairValue,
  alerts,
  vesting30,
  beneficiaries,
  awaitingApproval,
  activePlans,
  nextVestingDate,
  orgInfo,
] = await Promise.all([
  getOrgFairValueSummary(), // → totalEur, variationMonthPct, sparkline 12 mois, latestValuationAt
  getOrgComplianceAlertsSummary(), // → errorCount, warningCount, lastCheckAt, topAlerts (PAS de sparkline historique)
  getOrgVestingNext30Days(), // → totalUnits, sparkline 30 jours cumul
  getOrgActiveBeneficiaries(), // → count, variation30dCount, sparkline 12 mois cumul
  getOrgAwardsAwaitingApproval(), // → count, sparkline 30 jours
  listPlans({ status: ['ACTIVE'] }),
  user.activeOrgId ? getOrgNextVestingDate(user.activeOrgId) : null,
  user.activeOrgId ? getActiveOrgInfo(user.activeOrgId) : null,
]);
```

Layout actuel (PR #36) :

```tsx
<section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
  <div className="lg:col-span-2"><HeroFairValueCard ... /></div>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
    <ComplianceAlertsKPI/> <VestingNext30DaysKPI/>
    <ActiveBeneficiariesKPI/> <AwardsAwaitingApprovalKPI/>
  </div>
</section>
```

Layout cible mockup (brief) : ratio **40 / 60** (vs current 2/5 = 40 / 60% — déjà aligné). HeroKpi span 2 rangs. **Pas de refactor de layout grid** nécessaire.

**Adaptation queries pour les valeurs canoniques** :

- `fairValue.totalEur` → format compact "12,4 M€" via helper `formatCompactEur` (existe déjà dans HeroFairValueCard.tsx — à extraire)
- `alerts.errorCount + warningCount` → mais **brief impose `value="2"` + delta `−1`** (delta nécessite une comparaison vs période précédente — actuellement non calculé). V1e : **delta optionnel** (non rendu si pas calculable). Sparkline alertes mockée 13 points (pas dispo en query).
- `vesting30.totalUnits` → mockup `187` ✓
- `beneficiaries.count` + `variation30dCount` → mockup `142, +3` ✓ (delta affiché en valeur absolue, pas en %)
- ESOP libre : **pas de query** → V1e mock `3,2 %` + dette V2 (cf §5)

## 5. Données ESOP et fair_value — table esop_pools ?

**Pas de table `esop_pools` ni de query `getEsopPoolPercentage`**. Inventaire :

- Recherche `esop_pool|esop_percent|cap_libre` dans `apps/web/src/server/queries/` → **0 occurrence**
- Recherche `esop` dans schémas DB → **0 colonne dédiée**. ESOP est implicite via `plans.plan_type` + `plans.pool_size`.
- Module 10 (Cap Table) a un RPC `compute_cap_table` qui retourne le bloc ESOP, mais l'appeler ici serait coûteux (RPC complexe pour 1 KPI).

**Décision V1e** : **mocker** la valeur Cap libre ESOP à `3,2 %` (constante exportée dans le composant) avec :

- Sparkline mockée déclinante (13 points : 5 → 3.2) pour matcher le `trailDown title-500` du brief
- **Dette V2 documentée** : helper `getEsopPoolPercentage(orgId)` qui appelle `compute_cap_table` filtré ESOP free pool, cached `unstable_cache` 60s. Reportable au moment où Module 10 V2 nettoiera la dette #88 (Monte Carlo).

**Fair Value** : la query existante retourne `totalEur` mais **les valeurs canoniques** demandent :

- value `12,4` (= totalEur compact)
- delta `+4,2 %` (= variationMonthPct, déjà calculé)
- ctx `vs T-1 · valorisation 31 mars 2026 · CAC E&Y` ← le "CAC E&Y" est hardcodé dans le mockup mais **dynamique** dans la prod (via `companies.audit_firm` ou similaire — non modélisé V1e). **Mock le suffixe "· CAC E&Y" V1e**, dette V2 = lire `companies.audit_firm`.
- narrative `Hausse soutenue par la signature du plan BSPCE-2026-001 et la révision de la FMV (312 €).` ← **figé** comme template — la version dynamique peut citer le plan le plus récent. V1e : narrative générique conditionnée par le sens de variation (déjà fait dans HeroFairValueCard.tsx — à porter sur HeroKpi).

---

## 📊 Récap des écarts mockup vs prod (table action)

| #   | Composant                                                 | État actuel                                                       | Cible cw-chrome                                                                       | Action B1e                                                                                                                                                                    |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Sparkline.tsx` standalone                                | ❌ inexistant                                                     | Pure SVG 200×32 + anchor anneau+plein                                                 | **Créer**                                                                                                                                                                     |
| 2   | `Sparkline2.tsx` standalone                               | ❌ inexistant                                                     | Pure SVG 280×48 + 2 gradients + ticks + hollow points + last cuivre rempli            | **Créer**                                                                                                                                                                     |
| 3   | `HeroKpi.tsx`                                             | ❌ (existe `HeroFairValueCard` Recharts)                          | Span 2 rangs + Sparkline2 64h + narrative italic Fraunces 14 ss01 opsz 144            | **Créer** + remplacer HeroFairValueCard sur dashboard                                                                                                                         |
| 4   | `KpiCardEditorial.tsx` (4 satellites)                     | ⚠️ legacy KPICard incompatible                                    | Slim, embed Sparkline pure SVG + final value mono 11 ink-700 (ou title-700 trailDown) | **Créer** + remplacer SatelliteKpis sur dashboard                                                                                                                             |
| 5   | Badge bond.live (KPI Alertes)                             | ✅ StatusBadge tone=bond pattern=pulse OK                         | Pareil                                                                                | **No-op**                                                                                                                                                                     |
| 6   | Pulse keyframe                                            | ✅ `pulse-live` + `animate-pulse-live` OK                         | Pareil                                                                                | **No-op**                                                                                                                                                                     |
| 7   | reduced-motion                                            | ✅ globals.css ligne 509                                          | OK                                                                                    | **No-op**                                                                                                                                                                     |
| 8   | Hero ratio 40/60                                          | ✅ déjà `lg:col-span-2 / lg:col-span-3`                           | Pareil                                                                                | **No-op**                                                                                                                                                                     |
| 9   | Hero Fair Value valeur                                    | `formatCompactEur(totalEur)` — dynamique ✅                       | Mockup `12,4` (idem)                                                                  | **No-op** (déjà dyn)                                                                                                                                                          |
| 10  | Hero ctx "CAC E&Y" suffixe                                | ❌ pas dans HeroFairValueCard                                     | Mockup `vs T-1 · valorisation 31 mars 2026 · CAC E&Y`                                 | **Hardcode** V1e + dette V2                                                                                                                                                   |
| 11  | Hero narrative italic Fraunces                            | ⚠️ partiel (`serif-italic`)                                       | Fraunces 14 + `font-variation-settings: 'opsz' 144` (axe optical size)                | **Inline style** (axe variable Fraunces déjà chargé)                                                                                                                          |
| 12  | Sparkline Alertes 13 points                               | ❌ pas de sparkline alertes en query                              | Mockup `[5,4,5,3,4,3,2,3,2,3,2,3,2]` saffron-500                                      | **Mock** 13 points + dette V2 (calculer série historique alerts par jour)                                                                                                     |
| 13  | Sparkline Vesting 30j                                     | ✅ `vesting30.sparkline` existe                                   | Mockup `[0,0,0,30,...,187]` bond-500                                                  | **Brancher** query existante                                                                                                                                                  |
| 14  | Sparkline Bénéficiaires 12 mois                           | ✅ `beneficiaries.sparkline` existe                               | Mockup `[120,...,142]` brass-500 default                                              | **Brancher** query existante                                                                                                                                                  |
| 15  | KPI 4 = Cap libre ESOP (vs Awards Awaiting Approval prod) | ⚠️ swap : prod = AwardsAwaitingApproval                           | Mockup veut Cap libre ESOP                                                            | **Remplacer** KPI 4 par Cap libre ESOP mock + dette V2 (la KPI Awards Awaiting reste dans le système — déplacée dans la zone basse droite PR #38 OU laissée disponible en V2) |
| 16  | Cap libre ESOP value                                      | ❌ pas de query                                                   | Mockup `3,2 %` trailDown sparkline 5→3.2                                              | **Mock** + dette V2                                                                                                                                                           |
| 17  | `.cw-kpi-val` white-space:nowrap                          | ❌ legacy KPICard utilise `flex items-baseline gap-2` (peut wrap) | Anti-bug "4 [retour] 200"                                                             | **Inclure dans nouveau composant** explicitement                                                                                                                              |
| 18  | `.cw-kpi-val .unit !important`                            | ⚠️ legacy `text-numeric-md text-ink-500`                          | `font-size: 0.46em !important` etc.                                                   | **Inline style** ou utility CSS dédié                                                                                                                                         |
| 19  | a11y SVG sparkline                                        | ❌ pas de role="img" / title / desc dans legacy                   | role="img" + <title> + <desc>                                                         | **Ajouter** dans nouveau composant                                                                                                                                            |

---

## 🎯 Plan d'implémentation (5 commits feature après audit)

**Commit 1 (audit B0)** : ce memo + push branche.
**Commit 2 (B1)** : `Sparkline.tsx` + `Sparkline2.tsx` (pure SVG) + tests Vitest (helpers pure : computeAnchorPosition, hollowPointIndices). 6 tests min.
**Commit 3 (B2)** : extension `<StatusBadge tone="bond" pattern="pulse">` documentée dans le composant — note : pas de nouveau code CSS, juste vérification que l'infra fonctionne. Pas de commit séparé si trivial → fusion dans B1 ou B3.
**Commit 4 (B3)** : `HeroKpi.tsx` (composant signature avec Sparkline2 + narrative). Tests (2) : narrative rendu, gridRow span 2.
**Commit 5 (B4)** : `KpiCardEditorial.tsx` (slim, embed Sparkline) + `format-compact-eur.ts` helper extracted + tests. 4 satellites refactorés dans `dashboard/page.tsx` (ESOP mock, Alertes mock sparkline, Vesting + Bénéficiaires queries existantes).
**Commit 6 (B5)** : empty states gracieux par card + responsive mobile collapse + verification reduced-motion + screenshot.

---

## ⚠️ Risques identifiés

1. **Pure SVG vs Recharts cohabitation** : le dashboard mélangeera nouvelle Sparkline pure SVG (4 satellites + 1 hero) et Recharts (autres pages Award/Plan détail). Pas de problème technique — les deux moteurs coexistent. Just clarté de maintenance : documenter la décision dans le commit (cw-chrome canonical pour tout le DS V1, Recharts pour les charts complexes ailleurs).
2. **ID gradients SSR** : `Math.random()` dans cw-chrome.jsx canonique → en SSR Next.js, deux instances rendent des IDs différents server vs client → hydration mismatch. **Fix** : `React.useId()` (déterministe par instance SSR/client).
3. **Empty state pour Hero** : si `totalEur === 0`, le brief demande "valeur '—' + CTA 'Nouvelle valuation'". HeroFairValueCard a déjà un empty state — à porter dans HeroKpi.
4. **Mock ESOP `3,2 %` constant** : ce n'est pas une donnée réelle — risque de confusion en demo si l'utilisateur attend un calcul. **Mitigation** : sparkline mockée + ctx "Vous pouvez encore attribuer 6 720 unités sans révision du pool" qui signale le côté "informatif". Un petit overlay note "valeur indicative V1" pourrait éviter l'ambiguïté → pas dans le mockup, on s'abstient pour rester pixel-near.
5. **KPI 4 = swap Awards Awaiting → Cap libre ESOP** : risque de **régression UX** : les approbateurs perdent l'accès rapide. **Mitigation** : la badge counter "Approbations" sur la sidebar (livré Module 5 B4 + PR #35) reste visible et clignote si > 0 — l'inbox `/dashboard/approvals` est accessible en 1 clic. Pas de régression. La page "Awards Awaiting" reste consultable via la sidebar.
6. **`white-space: nowrap` sur cw-kpi-val** : le brief insiste comme anti-bug. À tester avec une valeur 4 chiffres genre `1 200 u.` (pas trivial à reproduire en V1e car aucune valeur dynamique > 999 dans les test data, mais forcer en preview).
7. **Layout mobile** : `lg:grid-cols-5` collapse en `grid-cols-1` sous lg (1024px). Vérifier que mobile rend en 1 col empilée (Hero puis 4 satellites).
8. **Fraunces `font-variation-settings: 'opsz' 144`** : axe variable optical size (axe `opsz`). Fraunces de Google Fonts inclut bien cet axe (loaded weight 9..144 dans `apps/web/src/app/layout.tsx:8`). À vérifier en preview que le rendu italic est bien "rich" sur la narrative.

---

## ✅ Conclusion B0

**3 nouveaux composants à créer** (Sparkline, Sparkline2, HeroKpi, KpiCardEditorial = 4 en réalité), **0 nouveau composant CSS** (StatusBadge + pulse-live + reduced-motion déjà OK), **2 mocks** documentés dette V2 (Cap libre ESOP, sparkline alertes historique), **0 migration DB**.

Foundation solide — la majorité du travail est de la **traduction visuelle pixel-near** des cw-chrome.jsx canoniques en composants TSX. Le risque principal est la cohabitation pure SVG / Recharts (acceptable per design) et la mock value ESOP (documenté V2). Pas de bloqueur identifié.

Démarre direct le coding sur le commit B1 (Sparkline + Sparkline2).
