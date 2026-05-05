---
name: Module 13 V1 — Audit Trail audit B0 (PR #39)
description: Audit pré-code de la page /audit editorial — réponse aux 5 questions du brief PR #39 + plan d'implémentation
type: project
---

# B0 — Audit Module 13 V1 Audit Trail (PR #39)

**Date** : 2026-05-05
**Branche** : `feat/module-13-audit-trail-editorial-v1`
**Référence visuelle** : `cw-screen-audit.jsx` + screenshot mockup "06 - Audit trail · Journal de bord"
**Référence DS** : `docs/DESIGN_SYSTEM_V1_TERRACOTTA.md` §2-3, §5
**Brief** : `docs/PR_39_BRIEF_MODULE_13_AUDIT_TRAIL.md`
**Spec module** : `docs/MODULE_13_AUDIT_TRAIL.md`

> **Scope V1** : page `/dashboard/audit-trail` lecture seule (RSC) — liste éditoriale chronologique groupée par jour, format event verbalize FR, hash SHA-256 calculé à la volée (8 chars affichés), filtres date range + event_type prefix, pagination 50/page, sidebar item dé-disable. **Hors scope** : modal détail diff (PR #40), export PDF/CSV (PR #41), tamper-evident chain DB column (PR #41).

---

## 1. Page `/audit` existe-t-elle déjà ?

**NON** — pas de page `/dashboard/audit-trail` ni `/audit` dans `apps/web/src/app/(dashboard)/`. Inventaire :

```
apps/web/src/app/(dashboard)/dashboard/
├── approvals/    awards/    beneficiaries/    captable/
├── exercises/    plans/     settings/         valuations/
├── page.tsx (Dashboard CFO)
```

→ **À créer** : `apps/web/src/app/(dashboard)/dashboard/audit-trail/page.tsx` (RSC).

Le brief mentionnait `/audit` au top-level mais le routing actuel utilise `/dashboard/<section>`. **Décision V1** : aligner sur le pattern existant → `/dashboard/audit-trail`. Le sidebar item link est déjà sur `/dashboard/audit-trail` (`dashboard-sidebar.tsx:85`).

## 2. Sidebar item — où est la logique `disabled: true` + tag `BIENTÔT` ?

**Trouvé** : `apps/web/src/components/shared/dashboard-sidebar.tsx:85` (livré PR #35) :

```tsx
{ href: '/dashboard/audit-trail', label: 'Audit trail', icon: ScrollText, disabled: true },
```

Le rendu disabled (lignes 162-180) :

- `<span aria-disabled="true" cursor-not-allowed opacity-60>` au lieu de `<Link>`
- Tag visuel `<span class="bg-paper-300 ...">Bientôt</span>`

**Action V1** : retirer le flag `disabled: true` de cet item. Pas besoin de toucher le rendering — la branche `if (item.disabled)` ne sera plus prise et l'item rend l'`<Link>` standard. Sub-action V2 (cf brief §sidebar) : exposer un counter dynamique d'événements via `getSidebarCounts` étendu — V1 conserve les 3 counters existants (Plans/Bénéficiaires/Attributions) sans toucher au schéma counters.

## 3. Helpers existants pour `audit_events` ?

**Côté write (ingestion)** : OUI — `apps/web/src/lib/audit/index.ts:31` expose :

```ts
export async function logAuditEvent(input: AuditEventInput): Promise<void>;
```

Utilisé par 30+ Server Actions du repo (plans, awards, exercises, approvals, etc.) pour insérer dans `audit_events` via le service_role (best-effort, pas de throw). Capture systématiquement `ip_address`, `user_agent`, `request_id` depuis les headers.

**Côté read** : **rien** — pas de query qui SELECT depuis `audit_events`. Aucun composant UI consommateur.

→ **À créer** :

- `apps/web/src/lib/audit/format.ts` — verbalize 30 event_types FR (`verbalizeEvent(event): { verb, object?, context? }`)
- `apps/web/src/lib/audit/hash.ts` — `computeAuditEventHash(event): string` SHA-256 hex 64 + `shortHash(h): string` 8 chars
- `apps/web/src/server/queries/audit.ts` — `getAuditEvents({ from, to, eventTypePrefix, page, pageSize })` paginated + `getAuditStats()` cached `unstable_cache`

## 4. RLS policy sur `audit_events` ?

**OUI — déjà en place et stricte** (migration `00002_rls_policies.sql:534-540`) :

```sql
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_events_select ON audit_events;
CREATE POLICY audit_events_select ON audit_events FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('audit.read'));
-- Pas de policy INSERT/UPDATE/DELETE → bloqué pour authenticated/anon.
```

→ **2 contraintes** :

1. **Scope org** automatique via `org_id = current_org_id()`. Pas besoin de filtrer côté query — RLS s'en charge.
2. **Permission `audit.read`** requise. Seedée pour rôles :
   - **OWNER** (catch-all, migration `00006:35`)
   - **APPROVER** (`00006:45`)
   - **AUDITOR** (`00003:141`)

   ⚠️ **CFO / ADMIN_HR n'ont pas `audit.read`** par défaut. La page sera donc **invisible** pour ces rôles. **Décision V1** : ajouter un check `requirePermission('audit.read')` au début du RSC ; si refusé, redirect ou empty state propre. **Pas de migration dans cette PR** pour étendre les permissions — c'est une décision produit (V1.5+).

## 5. Pattern RSC à réutiliser ?

**OUI — pattern PR #36-37 dashboard/page.tsx** est la référence :

```tsx
// Pattern observé apps/web/src/app/(dashboard)/dashboard/page.tsx
import { PageShell } from '@/components/shared/PageShell';
import { requireUser } from '@/lib/auth/rbac';
import { unstable_cache } from 'next/cache';

export default async function DashboardPage() {
  const user = await requireUser();
  const [data1, data2, ...] = await Promise.all([
    cachedQuery1(), cachedQuery2(), ...
  ]);
  const heroPhrase = buildHeroGreetingPhrase({ ... });
  return (
    <PageShell>
      <PageShell.Breadcrumb items={...} />
      <PageShell.Header>
        <PageShell.Overline>...</PageShell.Overline>
        <PageShell.Title>... <PageShell.TitleAccent>...</PageShell.TitleAccent> ...</PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>...</PageShell.Subtitle>
        <PageShell.Actions>...</PageShell.Actions>
      </PageShell.Header>
      <section>...</section>
    </PageShell>
  );
}
```

**Helpers existants à réutiliser** (livrés PR #36) :

- `buildHeroGreetingPhrase` — italic mid-sentence pluralization (mais sémantique différente ici — cf §plan)
- `getActiveOrgInfo(orgId)` — breadcrumb dynamique
- `formatDateOrdinalFr` — pour ticks date (probablement pas utile audit, on utilisera `Intl.DateTimeFormat` directement)

→ **Adaptation V1 audit** : créer un helper sœur `buildAuditHeroPhrase({ totalEvents, daysCovered, distinctTypes, distinctActors }): { lead, italic, trail }` qui renvoie une phrase éditoriale type :

- 0 events : `Aucun événement enregistré pour le moment.` (italic complet)
- 1 events : `Bonjour, *un événement* au registre.`
- N events : `Bonjour, *244 événements* au registre.`

---

## 📊 Récap inventaire actuel vs cible

| #   | Composant                                | État actuel                    | Cible                          | Action                                           |
| --- | ---------------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------ |
| 1   | Route `/dashboard/audit-trail/page.tsx`  | ❌ inexistant                  | RSC editorial                  | **Créer**                                        |
| 2   | Sidebar item                             | `disabled: true` + tag BIENTÔT | enabled                        | Patch 1 ligne dans `dashboard-sidebar.tsx:85`    |
| 3   | `lib/audit/format.ts`                    | ❌ inexistant                  | verbalizeEvent FR              | **Créer** + 12 tests                             |
| 4   | `lib/audit/hash.ts`                      | ❌ inexistant                  | SHA-256 + shortHash            | **Créer** + 4 tests                              |
| 5   | `server/queries/audit.ts`                | ❌ inexistant                  | getAuditEvents + getAuditStats | **Créer** + 3 tests                              |
| 6   | RLS audit_events                         | ✅ scopée org + audit.read     | OK                             | **No-op**                                        |
| 7   | `lib/audit/index.ts` (write side)        | ✅ logAuditEvent existant      | OK                             | **Préservé**                                     |
| 8   | Composants `AuditTrailHero/Filters/List` | ❌ inexistants                 | new client + RSC               | **Créer**                                        |
| 9   | Helper `buildAuditHeroPhrase`            | ❌ inexistant                  | pure helper                    | **Créer** + 4 tests                              |
| 10  | CSS `cw-audit-*`                         | ❌ inexistant                  | classes liste éditoriale       | **Ajouter** dans globals.css `@layer components` |

---

## 🎯 Plan d'implémentation (5 commits)

**Commit 1** : audit B0 memo (ce fichier).
**Commit 2** : `lib/audit/format.ts` (verbalizeEvent 30 event_types + fallback) + 12 tests Vitest.
**Commit 3** : `lib/audit/hash.ts` (computeAuditEventHash + shortHash) + 4 tests + tests cumul ≥ 18.
**Commit 4** : `server/queries/audit.ts` (getAuditEvents paginé + getAuditStats cached + buildAuditHeroPhrase helper) + tests.
**Commit 5** : page `/dashboard/audit-trail/page.tsx` + composants AuditTrailHero/Filters/List + CSS `cw-audit-*` + sidebar dé-disable.

---

## ⚠️ Risques identifiés

1. **Permission `audit.read` manquante pour CFO/ADMIN_HR** : la page sera invisible pour ces rôles. Décision V1 : `requirePermission('audit.read')` + redirect propre. V1.5 = arbitrage produit pour étendre les rôles.
2. **Hash on-the-fly côté server** : pas de mismatch SSR car calcul RSC + DTO. Si on devait calculer côté client (jamais V1), utiliser Web Crypto API.
3. **Timezone** : `occurred_at` en UTC. Group by day via `toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })`.
4. **30 event_types** verbalisation FR : risque de manquer une nuance métier (singulier/pluriel, accord). Tests 12+ couvrent les cas courants ; fallback robuste pour event_type inconnu.
5. **244 events au total** sur Paragraphe : UI fluide V1. Si > 10k events V2 : index `(org_id, occurred_at desc)` indispensable (à vérifier — probablement déjà créé Module 1).
6. **Empty state** : si 0 events sur la période filtrée, italic Fraunces "Aucun événement…" cohérent avec le greeting hero.
7. **Pagination URL searchParams** : `?from=…&to=…&type=…&page=…` — aligner avec pattern beneficiaries/awards filters.
8. **`current_org_id()` SQL function** : la query côté Next.js doit utiliser `createSupabaseServerClient()` (cookie-based, JWT propage `active_org_id`) pour que la RLS s'applique correctement. **Pas** d'admin client (bypass RLS = leak inter-org).

---

## ✅ Conclusion B0

**Foundation propre** : `logAuditEvent` write-side stable, RLS strict en place, schéma `audit_events` cohérent, pattern RSC PR #36-37 réutilisable, sidebar item déjà préfiguré (juste dé-disable).

**À créer** : 4 fichiers helpers/queries + 1 page RSC + 3 composants + 1 patch sidebar + ~19 tests Vitest. Pas de migration DB. Pas de modification du legacy `lib/audit/index.ts` (write side).

**Pas de bloqueur** identifié. Démarrage commit B1 (formatter).
