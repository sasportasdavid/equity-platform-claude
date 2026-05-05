---
name: Design System V1d — Dashboard hero audit B0 (PR #36)
description: Audit pré-code du hero PageShell de la page Dashboard CFO — comparaison mockup Capiwise (page 1) vs prod actuelle, réponse aux 5 questions du brief PR #36
type: project
---

# B0 — Audit Dashboard Hero (PR #36)

**Date** : 2026-05-05
**Branche** : `feat/design-system-v1d-dashboard-hero`
**Référence visuelle** : `Mockup_capiwise.pdf` page 1 — zone haute (header)
**Référence éditoriale** : `docs/DESIGN_SYSTEM_V1_TERRACOTTA.md` (mergé master commit `b9a3afb`)
**Brief** : `PR_36_BRIEF_DASHBOARD_HERO.md`

> **Scope** : refonte uniquement du PageShell hero (Breadcrumb, Overline, Title italic, TitleRule, Subtitle, Actions). KPI cards = PR #37, sidebar = PR #35 mergée.

---

## 1. Le `<PageShell>` actuel a-t-il déjà tous les sub-components ? Si non, lesquels manquent ?

**OUI — tout est déjà en place** — PageShell `apps/web/src/components/shared/PageShell.tsx` (148 lignes) expose la **Compound API** complète depuis le Design System V1 Étape 5 :

| Sub-component                      | Déjà présent | Status mockup                                                                                                                               |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `<PageShell.Breadcrumb items={…}>` | ✅           | À enrichir : org name dynamique vs hardcodé `"Capiwise"`                                                                                    |
| `<PageShell.Header>`               | ✅           | OK structure                                                                                                                                |
| `<PageShell.Overline>`             | ✅           | OK (déjà `text-overline text-brass-500`)                                                                                                    |
| `<PageShell.Title>`                | ✅           | Classe `text-h1` (Fraunces 32px 600, line-height 1.15, letter-spacing -0.01em) — **brief vise 1.2 / -0.02em** : écart minime, à patcher     |
| `<PageShell.TitleAccent>`          | ✅           | Classe `serif-italic text-brass-500` — **manque `font-feature-settings: 'ss01'`** pour les alternates italic Fraunces                       |
| `<PageShell.TitleRule />`          | ✅           | Composant `title-rule.tsx` rend `bg-brass-500 h-[2px] mt-3 animate-draw-line w-[64px]` ✓ — **brief vise 1px** au lieu de 2px (à harmoniser) |
| `<PageShell.Subtitle>`             | ✅           | OK Inter 14 ink-700 — brief vise ink-500, à patcher                                                                                         |
| `<PageShell.Actions>`              | ✅           | OK shrink-0 gap-2                                                                                                                           |
| `<PageShell.Content>`              | ✅           | OK                                                                                                                                          |

**Conclusion** : la structure compound est déjà prod-ready. Le travail B1d se fait au niveau (a) du contenu transmis (italic dynamique, breadcrumb org dyn, subtitle 3 fragments) et (b) de quelques ajustements typographiques (line-height/letter-spacing H1 + ss01 italic + couleur subtitle + épaisseur TitleRule).

## 2. La query `getActiveOrg()` retourne-t-elle bien `legal_name` et `short_name` ? Si non, faut-il étendre la query ?

**Pas de `getActiveOrg()` dédié**. Inventaire :

- **`requireUser()`** (`apps/web/src/lib/auth/rbac.ts:37`) retourne `{ id, email, fullName, activeOrgId, orgIds, activeRoles }` — **pas le nom de l'org**.
- **`(dashboard)/layout.tsx`** load déjà `activeOrgName` côté serveur via `admin.from('organizations').select('name').eq('id', activeOrgId).single()` (pour le header / OrgSwitcherCard footer). Mais ce nom n'est pas remonté à la page enfant `dashboard/page.tsx` (chaque RSC charge ses propres données).
- **Schéma `organizations`** (cf `packages/shared/src/types/database.ts:2946`) : a les colonnes `name` (court, ex "Paragraphe"), `legal_name` (ex "Paragraphe SAS"), `slug`. **Pas de colonne `short_name`** — le brief mentionnait `companies.short_name` mais c'est inexact (les `companies` n'ont pas non plus de short_name).

**Décision** : créer un nouveau helper `apps/web/src/server/queries/active-org.ts` qui expose

```ts
getActiveOrgInfo(orgId: string): Promise<{ id, name, legalName } | null>
```

wrapping `unstable_cache(fn, ['active-org', orgId], { tags: [`org:${orgId}:info`], revalidate: 300 })` (org info change rarement → cache 5 min). Le breadcrumb utilisera `name` (= short common name `"Paragraphe"`) avec fallback `legalName`.

## 3. Le hook `useCurrentUser()` existe-t-il et expose-t-il `firstName` ? Si non → fallback `full_name.split(' ')[0]` côté client OK ?

**Pas de hook `useCurrentUser()`** — l'identité user vient de `requireUser()` côté **server** uniquement. Côté client, il n'y a pas de provider centralisé pour le user.

L'extraction firstName existe déjà dans `apps/web/src/lib/utils/adaptive-greeting.ts:69` :

```ts
function extractFirstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}
```

**Décision** : pas de nouveau hook client. Le RSC `dashboard/page.tsx` extrait `firstName` depuis `user.fullName` via le helper, puis passe la phrase composée déjà finalisée (3 fragments) à `<PageShell.Title>` côté server. Aucun risque de leak — `requireUser()` retourne **uniquement** les claims du user lui-même.

## 4. La logique "compter alertes critiques pour pluriel italic" existe-t-elle ?

**NON, à créer**. Inventaire :

- **`getOrgComplianceAlertsSummary()`** (queries/dashboard.ts) retourne `{ critical, warning, info, sparkline, ... }` — on a déjà le count critique exposé.
- **`getOrgAwardsAwaitingApproval()`** retourne `{ count, sparkline, ... }` — on a déjà le count en attente.
- **Pas de helper qui combine les deux** pour produire la phrase italic.

**Décision** : créer un pure helper `apps/web/src/lib/utils/dashboard-hero-phrase.ts` :

```ts
buildHeroGreetingPhrase({
  firstName,
  criticalAlertsCount,
  urgentApprovalsCount,
}): { prefix: string; accent: string; suffix: string }
```

Logique :

- Si `(critical + urgent) === 0` → `prefix='Bonjour {firstName},'` + `accent='tout est en ordre'` + `suffix='.'`
- Si total === 1 → `accent='un point'` + `suffix=' mérite votre attention.'`
- Si total === 2 → `accent='deux points'` + `suffix=' méritent votre attention.'` (cas mockup)
- Si total >= 3 → `accent='{N} points'` + `suffix=' méritent votre attention.'`

**Politique "urgent" pour approvals** : on retient les approvals **urgents** = pending plus de 24h (cf `created_at`). Si la query existante ne fournit que le count global, on l'étend ou on prend le count global comme proxy V1 (suffisant pour la phrase). Je tranche : **count global pending** (pas de seuil 24h), dont la sémantique est "des approbations vous attendent" — moins ambigu que "urgent" (qui n'est pas modélisé en DB). V1.X = ajouter notion d'urgence si besoin.

**Adaptation greeting saisonnier vs brief** : `getAdaptiveDashboardGreeting()` retourne actuellement `"Bonsoir Julien,"`, `"Bonne nuit Julien,"`, etc. selon l'heure. Le mockup figé montre `Bonjour Julien,`. Décision : **conserver** le saisonnier (cohérent avec [Étape 12 PR #12], "elle est sympa" cf brief §⚠️4). Le mockup standard `Bonjour` est juste un cas particulier (heure 5h-18h en semaine). Pas de surcharge forcée.

## 5. La route `/dashboard/captable/import` existe-t-elle ? Si non, créer un placeholder.

**OUI — la route existe et est fonctionnelle** :

- `apps/web/src/app/(dashboard)/dashboard/captable/import/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/captable/import/import-wizard.tsx`

C'est le wizard d'import bulk positions livré en **Module 10 B6** (PR #25, mergé le 2026-05-04 commit `0ceda7c`). Le bouton existant sur `/dashboard/captable` linke déjà dessus (`captable/page.tsx:135`).

**Décision** : le CTA "Importer cap table" du dashboard hero est **ACTIF**, link `/dashboard/captable/import`. Pas de placeholder à créer, pas de disabled state.

---

## 📊 Récap des écarts mockup vs prod (table action)

| #   | Zone                                    | État actuel                                                                      | Cible mockup                                                      | Action B1d                                                                                     |
| --- | --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Breadcrumb 1er item                     | `Capiwise` (hardcodé)                                                            | `Paragraphe` (org name dyn)                                       | Charger `org.name` via `getActiveOrgInfo(orgId)`                                               |
| 2   | Breadcrumb 2e item                      | `Dashboard CFO`                                                                  | `Dashboard`                                                       | Renommer (le "CFO" est porté par l'overline)                                                   |
| 3   | Overline `EQUITY MANAGEMENT · Q2 2026`  | ✓ déjà dynamique (`quarterLabel(new Date())`)                                    | ✓ idem                                                            | **No-op**                                                                                      |
| 4   | H1 `text-h1` line-height/letter-spacing | 1.15 / -0.01em                                                                   | 1.2 / -0.02em (brief)                                             | Patcher l'utility CSS                                                                          |
| 5   | H1 phrase                               | `Bonsoir [name], voici votre vue Q2 2026`                                        | `Bonjour Julien, *deux points* méritent votre attention.`         | Helper `buildHeroGreetingPhrase` + RSC `dashboard/page.tsx`                                    |
| 6   | TitleAccent italic                      | `serif-italic text-brass-500` (Fraunces 500)                                     | + `font-feature-settings: 'ss01'` + weight 600                    | Patcher utility `serif-italic` ou créer `text-h1-accent`                                       |
| 7   | TitleRule épaisseur                     | 2px                                                                              | 1px (brief)                                                       | Patcher composant ou prop                                                                      |
| 8   | Subtitle color                          | `text-ink-700`                                                                   | `text-ink-500` (brief)                                            | Patcher `<PageShell.Subtitle>`                                                                 |
| 9   | Subtitle contenu                        | `3 bénéficiaires · 2 plans actifs · …` (parts dynamiques mais sans next vesting) | `142 bénéf. · 12 plans · prochaine échéance vesting le 1ᵉʳ juin.` | Helper `buildSubtitle` + nouvelle query `getOrgNextVestingDate(orgId)` + `formatDateOrdinalFr` |
| 10  | Actions — primary                       | `+ Nouveau plan`                                                                 | `Nouveau plan →`                                                  | Renommer + remplacer icône Plus par flèche `→` (caractère typo, pas Lucide)                    |
| 11  | Actions — secondary                     | absent                                                                           | `Importer cap table` (outline)                                    | Ajouter `<Link variant="outline" href="/dashboard/captable/import">`                           |
| 12  | a11y `<nav aria-label>` breadcrumb      | ✓ "Fil d'Ariane"                                                                 | ✓ idem                                                            | **No-op**                                                                                      |
| 13  | Hydration mismatch greeting             | risque (`new Date()` côté server + client)                                       | -                                                                 | Calcul côté RSC + passe en props (déjà OK V1)                                                  |

---

## 🎯 Plan d'implémentation (3-4 commits feature)

**Commit 1 (audit)** : ce memo + push branche.
**Commit 2 (B1)** : helper `buildHeroGreetingPhrase` (pure, testé) + utility CSS `text-h1-accent` (Fraunces italic 600 ss01 brass-500) + ajustements `text-h1` line-height/letter-spacing + integration `dashboard/page.tsx` (compose phrase 3 fragments depuis counts existants `alerts.critical` + `awaitingApproval.count`).
**Commit 3 (B2)** : helper `buildHeroSubtitle` + `formatDateOrdinalFr` (FR ordinal "1ᵉʳ", "2", "3", …) + query `getOrgNextVestingDate(orgId)` (cached) + integration subtitle 3 fragments + CTA "Importer cap table" outline link + flèche `→` sur primary CTA.
**Commit 4 (B3)** : helper `getActiveOrgInfo(orgId)` (cached) + breadcrumb dynamique `[{ label: orgName, href: '/dashboard' }, { label: 'Dashboard' }]`.

(B3 peut être merged dans B1 ou B2 si trivial — décision finale au moment du commit.)

---

## ⚠️ Risques identifiés

1. **Fraunces ss01** : nécessite que le subset Google Fonts inclue les features OpenType. Par défaut, `next/font/google` charge un subset qui peut ne pas inclure les alternates (`ss01`). Vérifier en preview ; sinon ajouter `font-feature-settings: 'ss01'` côté CSS et accepter que le glyph standard rende si la feature n'est pas disponible.
2. **TitleRule 1px vs 2px** : le composant `title-rule.tsx` rend en `h-[2px]`. Le brief mentionne 1px. Décision : passer à `h-px` (1px) — accepter risque visuel léger sur écrans HiDPI (1px peut être à peine visible). Anti-aliasing du brass-500 reste OK.
3. **Greeting saisonnier vs mockup statique** : à 14h en semaine = `Bonjour Julien,` (match mockup). À 19h = `Bonsoir Julien,`. Pas un bug — feature voulue cf brief §4.
4. **Phrase pluriel sans accent** : si `total = 0`, l'italic devient "tout est en ordre" — pas de chiffre à animer. UX OK : "Bonjour Julien, _tout est en ordre_." Sentiment positif voulu.
5. **Hydration date FR** : `new Date()` côté server + client peut diverger d'1 minute → tester avec `suppressHydrationWarning` sur les éléments time. Ici, pas de `<time>` rendu — la phrase est calculée 100% côté server. Pas de mismatch.
6. **Régression test `adaptive-greeting`** : `getAdaptiveDashboardGreeting()` reste utilisé pour l'instant (compose le `prefix` "Bonjour Julien,"). Aucun changement de signature, tests verts.

---

## ✅ Conclusion B0

**Foundation extrêmement solide** : PageShell Compound API complet, breadcrumb composant déjà prod, TitleRule composant existant, Fraunces déjà chargé italic + 4 weights, queries dashboard existantes pour 5/6 fragments du subtitle. Pour PR #36 :

- **0 nouveau composant** UI (juste consommation différente de la compound API)
- **2 helpers nouveaux** (greeting phrase + subtitle builder + ordinal date FR)
- **2 queries nouvelles** (`getActiveOrgInfo`, `getOrgNextVestingDate`) avec cache `unstable_cache`
- **1 CSS utility nouveau** (`text-h1-accent` ou patch `serif-italic`)
- **0 migration DB**
- **0 nouvelle dépendance**

Pas de bloqueur identifié. Démarre direct le coding sur le commit B1.
