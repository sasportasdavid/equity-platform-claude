---
name: Design System V1c — Sidebar audit B0 (PR #35)
description: Audit pré-code de la sidebar — comparaison mockup Capiwise (page 1) vs prod actuelle, réponse aux 5 questions du brief PR #35
type: project
---

# B0 — Audit sidebar Capiwise (PR #35)

**Date** : 2026-05-05
**Branche** : `feat/design-system-v1c-sidebar`
**Référence visuelle** : `Mockup_capiwise.pdf` page 1 ("01 — Dashboard CFO")
**Brief** : `PR_35_BRIEF_SIDEBAR.md`

---

## 1. Le sidebar a-t-il déjà des sections ? Lesquelles, dans quel ordre ?

**OUI** — la sidebar prod (apps/web/src/components/shared/dashboard-sidebar.tsx, livrée Design System V1 Étape 5, commit `450035d`) a déjà la structure 3 sections + overlines :

| Section            | Items actuels                                                | Items mockup                                                 | Diff                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Opérations**     | Dashboard / Plans / Attributions / Bénéficiaires / Cap Table | Dashboard / Plans / Bénéficiaires / Cap Table / Attributions | **Réordonner** (Bénéficiaires avant Cap Table avant Attributions)                                                                                                                                                                                |
| **Analyse**        | Valorisations / Approbations / Exercices                     | Valorisation IFRS 2 / Audit trail / Rapports                 | **Renommer** Valorisations → Valorisation IFRS 2. **Décision** : on conserve Approbations + Exercices (pages livrées M5 + M9) en + des items mockup (Audit trail/Rapports disabled). Le mockup minimaliste ne couvre pas tout le périmètre prod. |
| **Administration** | Paramètres                                                   | Workflows / Paramètres                                       | **Ajouter** Workflows en disabled (page n'existe pas, redirige vers /dashboard/settings/approvals)                                                                                                                                               |

Les overlines `text-overline text-brass-500` sont déjà rendues (uppercase, mono, brass-500). Le brief demande **MAJUSCULES** dans les titres (`OPÉRATIONS / ANALYSE / ADMINISTRATION`) — actuellement les titres sont déclarés en sentence case (`Opérations / Analyse / Administration`) mais la classe `.text-overline` doit déjà appliquer `text-transform: uppercase` (à confirmer en lisant globals.css ; sinon, on ajustera la déclaration source).

## 2. Le bullet brass-500 est-il déjà sur le logo ?

**OUI** — déjà implémenté en CSS (pas SVG, pas pseudo-element). Ligne 95 de `dashboard-sidebar.tsx` :

```tsx
<span className="bg-brass-500 inline-block size-1 rounded-full" aria-hidden="true" />
<span className="text-ink-900 font-serif text-lg font-semibold tracking-tight">Capiwise</span>
```

- `size-1` = `width: 0.25rem; height: 0.25rem;` = **4px** ✓ (Tailwind 4)
- `bg-brass-500` ✓
- `font-serif text-lg font-semibold` = serif 600 18px ✓

**MANQUE** vs mockup : l'overline `Plateforme admin · CFO & équipe Equity` au-dessus du logo. Cet overline contextuel global est absent de la sidebar prod ET du header. À ajouter en haut de la sidebar (au-dessus de `<Link href="/dashboard">…</Link>`).

## 3. Les counters existent-ils ? Si oui où, et utilisent-ils déjà les bonnes queries ?

**NON** — pas de counters de navigation. Inventaire :

- **`unstable_cache`** : grep `apps/web/src` → 0 occurrence. Infra à créer from scratch.
- **`count(*)` queries** : `apps/web/src/server/queries/` ne contient aucune fonction count standalone pour Plans/Bénéficiaires/Attributions. La fonction `getActiveBeneficiariesCard` (apps/web/src/server/queries/dashboard.ts:393) calcule un count côté JS après un SELECT — pas une requête `count()` Postgres native, et destinée au KPI dashboard, pas au sidebar.
- **Counters existants côté UI** : seulement `pendingApprovalsCount` (Module 5 B4), récupéré par `getMyPendingApprovalsCount` (queries/approvals.ts) et passé en prop au sidebar. Pas de cache, calculé à chaque render layout.

**À implémenter** :

1. Nouveau fichier `apps/web/src/server/queries/sidebar-counts.ts` exportant `getSidebarCounts(orgId: string)` qui fait `Promise.all([planCount, beneficiaryCount, awardCount])` via 3 `select('id', { count: 'exact', head: true })` Supabase.
2. Wrapper avec `unstable_cache(fn, [`sidebar-counts:${orgId}`], { tags: [`org:${orgId}:counts`], revalidate: 60 })`.
3. Appel dans `(dashboard)/layout.tsx`, props passées à `<DashboardSidebar counts={…} />`.
4. **Invalidation** out-of-scope V1 (cf brief pièce C) — V2 = `revalidateTag('org:{orgId}:counts')` dans createPlan/inviteBeneficiary/createAward.

Queries cibles (brief §C) :

- Plans : `count(*) FROM plans WHERE org_id = $1 AND deleted_at IS NULL`
- Bénéficiaires : `count(*) FROM beneficiaries WHERE org_id = $1 AND status = 'active'` (lowercase, cf convention dette transverse)
- Attributions : `count(*) FROM awards WHERE org_id = $1 AND deleted_at IS NULL`

⚠️ `awards.deleted_at` : à vérifier — la table awards a-t-elle bien une colonne `deleted_at` ? Si non (soft-delete via `status='CANCELLED'`), filtrer plutôt sur `status NOT IN ('CANCELLED', 'FORFEITED', 'EXPIRED')`. Décision : **status = whitelist actifs** (DRAFT, PROPOSED, PENDING_APPROVAL, APPROVED, GRANTED, ACCEPTED, VESTING_IN_PROGRESS, VESTED, EXERCISED) — plus aligné avec le sens "attributions actives" dans le mockup.

## 4. `org-switcher.tsx` existe-t-il ? Quel est son état (UI faite ? logique faite ?) ?

**OUI** — `apps/web/src/components/shared/org-switcher.tsx` (118 lignes), livré Module 2 §5.5.

- **UI faite** : Button avec icône Building2 + nom org tronqué + ChevronsUpDown, DropdownMenu avec liste orgs + Check sur l'active, séparateur, label "Changer d'organisation".
- **Logique faite** : useQuery TanStack pour charger memberships ACTIVE via Supabase browser client + RLS, useTransition pour le switch, appel `setActiveOrg`, `refreshSession()` + `router.refresh()`.
- **Affichage conditionnel** : `if (!orgs || orgs.length <= 1) return null` ✓ (cohérent avec brief : pas de chevron si 1 seule org — sauf que là on cache TOTALEMENT le composant).

**Position actuelle** : intégré dans le **header** (`(dashboard)/layout.tsx:49`), pas en footer sidebar. Pour la PR #35, on doit :

1. Soit déplacer le composant en footer sidebar.
2. Soit créer une variante "card footer" avec avatar 28px circle (initiales sur fond `brass-500/15`, texte `brass-700`) + nom org + suffixe mono `· N bénéf.` + chevron, et **garder** le composant header existant (ou le retirer du header pour éviter doublon).

**Décision V1c** : on crée une nouvelle variante `<OrgSwitcherCard>` (composant Card layout), réutilisant la logique TanStack + setActiveOrg de l'existant, à insérer en `mt-auto` de la sidebar. On retire l'`<OrgSwitcher>` du header (devient `<Link>` simple "Capiwise" cliquable + slash + nom org statique), pour éviter le doublon visuel. Le suffixe `· N bénéf.` réutilise le count bénéficiaires des sidebar-counts.

⚠️ **Adaptation mockup** : le brief précise "Combobox cmdk". Le composant existant utilise déjà `DropdownMenu` Base UI avec recherche absente. Pour garder le scope V1c minimal, on **conserve DropdownMenu** (pas cmdk) — le besoin de search emerge à >5 orgs, et la 2 dummy memberships APPROVER (dette #17) suffisent largement aux tests V1. Si user veut cmdk, escalade en V1.X.

## 5. Le `setActiveOrg` Server Action existe-t-il ? Sinon, faut-il le créer ?

**OUI** — `apps/web/src/server/actions/auth.ts:200`, signature complète :

```ts
const SetActiveOrgSchema = z.object({ orgId: uuidSchema });
export type SetActiveOrgResult =
  | { success: true; activeRoles: readonly Role[] }
  | { success: false; error: string };
export async function setActiveOrg(input): Promise<SetActiveOrgResult>;
```

Pipeline complet :

1. Valide orgId via Zod
2. Vérifie membership ACTIVE via admin client
3. UPDATE `user_profiles.default_org_id` (source des futurs JWT via `custom_access_token_hook`)
4. UPDATE `auth.users.raw_app_meta_data.active_org_id` + `active_roles` (effet immédiat après refreshSession côté client)
5. Logge audit `auth.org_switched`
6. `revalidatePath('/')`

**Rien à créer** — la nouvelle `<OrgSwitcherCard>` consomme l'existant.

---

## 📊 Récap des écarts mockup vs prod (table action)

| #   | Zone                                  | État actuel                              | Cible mockup                                                           | Action B1c                                                                                |
| --- | ------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Overline contextuel global            | ❌ absent                                | `Plateforme admin · CFO & équipe Equity` (mono uppercase 11 brass-500) | **Add** au-dessus du logo dans sidebar                                                    |
| 2   | Logo bullet brass                     | ✓ présent (CSS span)                     | ✓ idem                                                                 | **No-op**                                                                                 |
| 3   | Section overlines                     | ✓ rendues (sentence case)                | UPPERCASE                                                              | **Vérifier** `.text-overline` applique `text-transform: uppercase` ; sinon ajuster        |
| 4   | Items Opérations ordre                | Dashboard/Plans/Attrib/Bénéf/CapTable    | Dashboard/Plans/Bénéf/CapTable/Attrib                                  | **Reorder** dans `NAV_SECTIONS`                                                           |
| 5   | Counter Plans                         | ❌                                       | `12`                                                                   | **Add** counter via unstable_cache                                                        |
| 6   | Counter Bénéficiaires                 | ❌                                       | `142`                                                                  | **Add** counter                                                                           |
| 7   | Counter Attributions                  | ❌                                       | `8`                                                                    | **Add** counter                                                                           |
| 8   | Section Analyse — items               | Valorisations/Approb/Exercices           | Valorisation IFRS 2/Audit trail/Rapports                               | **Rename** + **add** Audit trail/Rapports disabled. **Garder** Approb/Exercices (livrés). |
| 9   | Item Audit trail (M13)                | ❌                                       | item disabled grisé + tooltip "Bientôt disponible"                     | **Add** disabled item                                                                     |
| 10  | Item Rapports                         | ❌                                       | item disabled                                                          | **Add** disabled item                                                                     |
| 11  | Item Workflows (Admin)                | ❌                                       | item disabled (ou link vers settings/approvals)                        | **Add** disabled item                                                                     |
| 12  | Item actif barre brass 2px gauche     | ✓ présent                                | ✓ idem                                                                 | **No-op**                                                                                 |
| 13  | Item actif fond paper-200             | ✓ présent                                | ✓ idem                                                                 | **No-op**                                                                                 |
| 14  | Signet point brass droite             | ✓ présent                                | ✓ idem                                                                 | **No-op**                                                                                 |
| 15  | Hover paper-200/50 + transition 100ms | ✓ présent                                | ✓ idem                                                                 | **No-op**                                                                                 |
| 16  | OrgSwitcher footer                    | ❌ (composant existant en header)        | avatar 28px + nom + `· N bénéf.` + chevron                             | **Add** `<OrgSwitcherCard>` en `mt-auto` + retirer du header                              |
| 17  | a11y `<nav aria-label>`               | ✓ "Navigation principale"                | ✓ idem                                                                 | **No-op**                                                                                 |
| 18  | a11y `aria-disabled` items            | ❌ (uniquement `comingSoon` flag visuel) | aria-disabled="true" + tooltip                                         | **Add** prop `disabled` au type + behavior                                                |

---

## 🎯 Plan d'implémentation (3 commits feature après audit)

**Commit 1 (audit)** : ce memo + push branche.
**Commit 2 (B1)** : NAV_SECTIONS reorder + add overline header + add disabled items M13/Rapports/Workflows + tooltip "Bientôt disponible" + a11y aria-disabled. Pas de logique server.
**Commit 3 (B2)** : `getSidebarCounts(orgId)` + `unstable_cache` + props `counts` passées au sidebar + render counters mono tabular ink-500 12px à droite des labels Plans/Bénéficiaires/Attributions.
**Commit 4 (B3)** : `<OrgSwitcherCard>` réutilisant logique existante + intégration footer sidebar `mt-auto` + retrait `<OrgSwitcher>` du header.

---

## ⚠️ Risques identifiés

1. **`.text-overline` cas** : si la classe applique `text-transform: uppercase`, on n'a pas besoin de toucher les strings titres. Sinon, soit on les met UPPERCASE en source, soit on ajoute `uppercase` à la classe Tailwind. Vérifier en lisant globals.css.
2. **Dropdown `<OrgSwitcherCard>` overflow** : le footer sidebar étant collé en bas, le dropdown s'ouvre vers le haut. Tester avec `<DropdownMenuContent side="top">`.
3. **Capture prod référence** : le PDF "Capture capiwise.pdf" page 1 ne montre pas la sidebar (il montre un détail plan E2E). Le diff visuel se fait donc par lecture de code, pas par capture. **Une capture localhost:3000 sera prise avant et après modifs** pour la PR.
4. **Régression item ordre** : Module 5 B4 sidebar-link-/-dashboard-approvals badge counter. Le réordonnement Opérations/Analyse n'affecte pas Approbations (dans Analyse). OK.
5. **Counters et orgs sans active_org_id** : si `user.activeOrgId === null` (pre-onboarding), on skip `getSidebarCounts` et passe `counts = null`. Dans le sidebar, `counts === null` → ne pas rendre de chiffre.
6. **N+1 sur counters** : 3 SELECT count exact head:true → 3 round trips. Avec `Promise.all` + `unstable_cache 60s` c'est OK pour V1 (cf brief §C "Pas de query par item").

---

## ✅ Conclusion B0

**Foundation solide** : ~60% du mockup déjà en place côté UI (logo, sections, item actif avec barre + signet, hover, a11y). Les manques sont des ajouts (counters infra, items disabled, overline contextuel, OrgSwitcher footer) — pas de refonte structurelle.

**Pas de bloqueur** identifié. Démarre le coding direct sur le commit B1.
