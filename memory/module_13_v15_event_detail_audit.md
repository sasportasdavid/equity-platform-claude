---
name: Module 13 V1.5 — Audit event detail drawer audit B0 (PR #41)
description: Audit pré-code du drawer slide-in détail event audit — réponse aux 5 questions du brief PR #41 + plan d'implémentation
type: project
originSessionId: 4619e820-6254-414a-bb54-e7e9618db4c1
---

# B0 — Audit Module 13 V1.5 Event Detail Drawer (PR #41)

**Date** : 2026-05-05
**Branche** : `feat/module-13-audit-event-detail-v15`
**Référence visuelle** : `cw-screen-audit.jsx` (mockup liste — pas de spec drawer) + brief §Spec visuelle
**Référence DS** : `docs/DESIGN_SYSTEM_V1_TERRACOTTA.md` §5 (composants signature, pas de spec drawer)
**Brief** : `docs/PR_41_BRIEF_MODULE_13_V15_EVENT_DETAIL.md`

> **Scope V1.5** : drawer slide-in droite 480px, ouverture au click sur row, URL state `?event=<id>` (`router.replace`), 5 sections (header / DÉTAILS / CHANGEMENTS-or-MÉTADONNÉES / EMPREINTE / RESSOURCE), priorise MetadataView (90% des events). **Hors scope** : trigger SQL auto-populate before/after, export PDF detail, diff sémantique métier.

---

## 1. Composant drawer/sheet/dialog déjà dans le repo ?

**OUI — primitive `Dialog` (Base UI) disponible** dans [apps/web/src/components/ui/dialog.tsx](apps/web/src/components/ui/dialog.tsx) :

- `DialogPrimitive.Root` (Base UI) — fournit gratuitement : focus trap, ESC, `aria-modal`, click backdrop ferme, portal
- `DialogPrimitive.Backdrop` (overlay) — déjà stylé `fixed inset-0 z-50 bg-black/10` + `backdrop-blur-xs`
- `DialogPrimitive.Popup` — c'est ce qu'on customise pour rendre slide-in droite (au lieu du centered par défaut)

**Pas de `<Sheet>` ni `<Drawer>`** dans le repo (pas de Vaul, pas de shadcn/ui Drawer).

→ **Décision** : utiliser `DialogPrimitive.Root` + `DialogPrimitive.Backdrop` + `DialogPrimitive.Popup` directement (sans passer par le wrapper `<Dialog>` du repo qui hardcode le centered) avec une `className` custom pour le slide-in droite. On hérite de tout le a11y Base UI gratuitement (focus trap + ESC + click backdrop).

CSS animation via `data-open:animate-in` / `data-closed:animate-out` Base UI ou via classe custom `cw-audit-drawer` avec `@keyframes cw-slide-in`.

## 2. Lib JSON diff installée ?

**NON** — aucune lib `deep-diff` / `microdiff` / `json-diff` / `fast-deep-equal` dans `apps/web/package.json`. L'existant [json-diff-helpers.ts](apps/web/src/components/shared/json-diff-helpers.ts) fait du **diff ligne-par-ligne sur stringify** (utilisé par `JsonDiffViewer` Module 3b modifications). C'est une approche différente de ce que veut le brief : on a besoin d'un **diff key-level** qui retourne `{key, type, before, after}` triples pour un rendu structuré (Statut → "PROPOSED → GRANTED").

→ **Décision** : créer `apps/web/src/lib/audit/json-diff.ts` from scratch — diff peu profond (Object.keys union) + `formatDiffValue` type-aware. Pas de récursion deep en V1 (audit events ont des shapes plates : `{status: 'X', granted_at: '...', units: 1200}` — pas de nesting profond). Tests Vitest 8+.

## 3. Routes resources existent ?

**Audit complet** :

| Resource type (DB)                          | Route prod                                  | Statut                            |
| ------------------------------------------- | ------------------------------------------- | --------------------------------- |
| `PLAN` / `plan`                             | `/dashboard/plans/[id]`                     | ✅ existe                         |
| `AWARD` / `award`                           | `/dashboard/awards/[id]`                    | ✅ existe                         |
| `BENEFICIARY` / `beneficiary`               | `/dashboard/beneficiaries/[id]`             | ✅ existe                         |
| `VALUATION_RUN` / `valuation_run`           | `/dashboard/valuations/runs/[runId]`        | ✅ existe (note: `runs/` segment) |
| `approval_request`                          | `/dashboard/approvals/[requestId]`          | ✅ existe (note: `[requestId]`)   |
| `DOCUMENT` / `document_instance`            | ❌ pas de route `/dashboard/documents/[id]` | Pas de page détail document       |
| `signature_request`                         | ❌ pas de route                             | Sub-resource document             |
| `USER` / `MEMBERSHIP` / `approval_decision` | ❌ pas de page directe                      | Acceptable (label sans href)      |

→ **Décision resolver** :

- `PLAN` → `/dashboard/plans/${id}`
- `AWARD` → `/dashboard/awards/${id}`
- `BENEFICIARY` → `/dashboard/beneficiaries/${id}`
- `VALUATION_RUN` → `/dashboard/valuations/runs/${id}` (corrigé vs brief)
- `approval_request` → `/dashboard/approvals/${id}`
- Tout le reste (`USER`, `MEMBERSHIP`, `DOCUMENT`, `signature_request`, `approval_decision`) → `exists: true, href: null` → label affiché sans Link.

## 4. La query `getAuditEvents` retourne-t-elle `before_state` / `after_state` ?

**NON** — le SELECT actuel ([audit.ts:60](apps/web/src/server/queries/audit.ts:60)) :

```ts
.select('id, org_id, user_id, user_email, event_type, resource_type, resource_id, metadata, occurred_at', { count: 'exact' })
```

Pas de `before_state` ni `after_state`. **Décision** : **ne PAS étendre** la liste (lourd, 90% des rows ont before/after = NULL → bytes inutiles transférés à chaque page de 50 events). Étendre uniquement la query détail `getAuditEventById` qui SELECT `*`. Le drawer fetch on-open seulement (1 query par open) — pattern aligné avec le piège #6 du brief ("ne pas eager-load").

→ **À créer** : `apps/web/src/server/queries/audit-detail.ts::getAuditEventById(id: string)` — SELECT \*, RLS scope automatique via `createSupabaseServerClient()` (cookies-based), retourne `null` si introuvable ou inter-org (RLS deny propre).

## 5. Pattern `useSearchParams` + `router.replace` utilisé ailleurs ?

**OUI — pattern stable** dans le repo. Référence canonique : [beneficiaries-list-client.tsx:102-112](<apps/web/src/app/(dashboard)/dashboard/beneficiaries/beneficiaries-list-client.tsx:102>) et [awards-list-client.tsx:64-75](<apps/web/src/app/(dashboard)/dashboard/awards/awards-list-client.tsx:64>) :

```ts
const router = useRouter();
const pathname = usePathname();
const searchParams = useSearchParams();
// ...
const params = new URLSearchParams(searchParams.toString());
params.set('event', id);
router.replace(`${pathname}?${params.toString()}`, { scroll: false });
```

Le pattern préserve les autres searchParams (filters `type=`, `page=`) — important pour notre cas (un user peut être sur `?type=plan&page=2` puis cliquer un event = `?type=plan&page=2&event=xxx`). `router.replace` (pas `push`) → pas de spam historique, back/forward fonctionne via la stack normale. `scroll: false` → préserve la position scroll de la liste.

→ **À utiliser** : ce pattern exact dans une nouvelle version client de `AuditTrailList` (refactor minimal — on transforme `<article>` server en client `<button>` ou avec `onClick`). Décision **lift** : le composant `AuditTrailList` actuel est server (`verbalizeEvent` + `computeAuditEventHash` côté server). Pour ajouter `onClick`, soit (a) le passer en client (`'use client'`), soit (b) extraire un wrapper client autour de chaque row qui appelle `router.replace`. **Décision (b)** : extraire `<AuditEventRowClient>` qui wrappe `<article>` avec onClick — préserve le rendering server pour la verbalisation + hash.

---

## 📊 Récap inventaire actuel vs cible

| #   | Composant                                          | État actuel                             | Cible                                                                  | Action                           |
| --- | -------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| 1   | `lib/audit/json-diff.ts`                           | ❌ inexistant                           | computeJsonDiff + formatDiffValue                                      | **Créer** + 8 tests              |
| 2   | `lib/audit/resource-resolver.ts`                   | ❌ inexistant                           | resolveResource (mixed casing UPPERCASE + snake_case)                  | **Créer** + 12 tests             |
| 3   | `server/queries/audit-detail.ts`                   | ❌ inexistant                           | getAuditEventById (RLS scope)                                          | **Créer** + 3 tests              |
| 4   | `components/audit/AuditEventDetailDrawer.tsx`      | ❌ inexistant                           | Client wrapping DialogPrimitive Base UI                                | **Créer**                        |
| 5   | `components/audit/JsonDiffView.tsx`                | ❌ inexistant                           | Server, key-level diff                                                 | **Créer**                        |
| 6   | `components/audit/MetadataView.tsx`                | ❌ inexistant                           | Server, key-value type-aware                                           | **Créer**                        |
| 7   | `components/audit/HashVerificationBlock.tsx`       | ❌ inexistant                           | Server, recompute + ✓ + copy                                           | **Créer client** (copy = client) |
| 8   | `components/audit/ResourceLink.tsx`                | ❌ inexistant                           | Server, resolveResource                                                | **Créer**                        |
| 9   | `components/audit/AuditTrailList.tsx`              | ✅ livré PR #39 (server)                | Wrap row in client `<AuditEventRowClient>` avec onClick router.replace | **Refactor minimal**             |
| 10  | `app/(dashboard)/dashboard/audit-trail/page.tsx`   | ✅ livré PR #39                         | Lit `searchParams.event` + render drawer si défini                     | **Étendre**                      |
| 11  | CSS `cw-audit-drawer-*` + `@keyframes cw-slide-in` | ❌ inexistant                           | Dans `@layer components` (1 seul bloc cf fix PR post-#39)              | **Ajouter**                      |
| 12  | RLS `audit_events_select`                          | ✅ org_id + has_permission              | OK                                                                     | **No-op**                        |
| 13  | Lib JSON diff externe                              | ❌ pas installée                        | Code maison (lib pure)                                                 | **No install**                   |
| 14  | Primitive Dialog Base UI                           | ✅ disponible (`@base-ui/react/dialog`) | Réutiliser pour focus trap + ESC + a11y                                | **Réutiliser**                   |

---

## 🎯 Plan d'implémentation (6 commits)

**Commit 1** : audit B0 memo (ce fichier).
**Commit 2** : `lib/audit/json-diff.ts` (computeJsonDiff + formatDiffValue) + 8+ tests Vitest.
**Commit 3** : `lib/audit/resource-resolver.ts` (resolveResource mixed casing) + 12+ tests Vitest.
**Commit 4** : `server/queries/audit-detail.ts` (getAuditEventById) + 3+ tests Vitest (RLS scope mock).
**Commit 5** : 5 composants drawer (`AuditEventDetailDrawer` client + `JsonDiffView` / `MetadataView` / `HashVerificationBlock` / `ResourceLink` server) + CSS `cw-audit-drawer-*` dans `@layer components`.
**Commit 6** : Wire click handlers (`AuditEventRowClient` wrapper) + URL state via `router.replace` + intégration dans `page.tsx`.

---

## ⚠️ Risques identifiés

1. **Rendering server vs client mix** : le drawer client doit recevoir un `event` data fully-formed (pas de `verbalizeEvent` côté client → la fn est pure mais pour cohérence on garde tout le formatting côté server). Décision : drawer client lit `?event=<id>` et fetch via Server Action `getAuditEventDetailDTO(id)` qui pre-formate (verbalize + hash + diff entries). Garde le client léger.
2. **Hash recompute mismatch** : on recompute le hash dans `HashVerificationBlock` avec les MÊMES champs que la liste (`id|event_type|user_id|resource_type|resource_id|occurred_at|JSON(metadata)`). Si on fetch `before_state` / `after_state` en plus, ne PAS les inclure dans la concat → sinon désynchro. Le hash est calculé sur le champ "stable" (id+core+metadata).
3. **`prefers-reduced-motion`** : ajouter `@media (prefers-reduced-motion: reduce) { .cw-audit-drawer { animation: none; } }` dans le CSS.
4. **Focus trap natif Base UI** : `DialogPrimitive.Root` gère ça. Pas besoin de `react-focus-lock` externe. Tester avec ESC + Tab cycle.
5. **URL state hydration** : `searchParams.event` dans le RSC `page.tsx` détermine si on render le drawer. Drawer monte → `open={true}` (Base UI controlled) → animation slide-in. Click backdrop ou ESC → `onOpenChange(false)` → `router.replace(pathname?type=...&page=...)` (sans `event`). Important : ne pas perdre les autres params.
6. **Resource type case mixte** : le resolver doit normaliser uniquement pour le lookup (Map.get(type.toLowerCase())) sans muter la string display. Cf §3 ci-dessus.
7. **Edge case event manquant** : URL `?event=invalid-uuid` ou event d'une autre org (RLS deny). `getAuditEventById` retourne null → drawer affiche empty state italic Fraunces "Cet événement est introuvable ou supprimé." — pas de throw.
8. **`metadata` object non-plats** : certains events ont `metadata.before_status` ou `metadata.workflow_steps[]`. `MetadataView` doit gérer (a) primitives (number/string/bool/date), (b) UUID (tronquer 8 chars), (c) email (mailto), (d) nested object → JSON pretty-print indenté. V2 = formatter sémantique par event_type.
9. **No JsonDiffViewer reuse** : l'existant fait du diff ligne-par-ligne sur stringify (Module 3b modifications) — différent du diff key-level qu'on veut. Justifié de créer un nouveau helper.
10. **CSS purge** : ajouter `cw-audit-drawer-*` DANS le bloc `@layer components` existant (post-fix branche `fix/design-post-merge-bugs`) — pas dans un 2e bloc séparé, sinon Lightning CSS purge à nouveau (même piège que cw-audit V1).

---

## ✅ Conclusion B0

**Foundation propre** : Dialog Base UI dispo (focus trap + ESC gratuits), pattern URL state stable (beneficiaries/awards), routes resources existent (modulo `valuations/runs/[runId]`), pas de lib externe à installer. Ajouter sur audit existant V1 sans casser la liste server actuelle.

**À créer** : 3 fichiers helpers/queries + 5 composants + 1 wrapper client `AuditEventRowClient` + CSS dans bloc existant + extension page.tsx pour lire `searchParams.event`.

**Pas de bloqueur** identifié. Démarrage commit B2 (json-diff helper).

**Note alignement** : route valuation corrigée vs brief (`/dashboard/valuations/runs/[runId]` au lieu de `/dashboard/valuations/[id]`). Pas de page document détail (acceptable V1.5 : label sans href).
