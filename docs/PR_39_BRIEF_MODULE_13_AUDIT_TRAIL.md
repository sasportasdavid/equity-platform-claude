# PR #39 — Module 13 V1 : Audit Trail editorial (Page `/audit`)

## 🎯 Objectif

Créer la **première version utilisable** du Module 13 (Audit Trail UI) :

- Page `/audit` accessible depuis sidebar (item dé-disable, retirer tag BIENTÔT)
- Liste éditoriale chronologique des `audit_events` groupée par jour
- Format event éditorial (verbe FR, pas dump JSON technique)
- Hash SHA-256 calculé à la volée + affiché tronqué (8 chars mono)
- Filtres basiques : date range + event_type select
- Pagination 50/page
- Pixel-near mockup `cw-screen-audit.jsx` + DS Terracotta V1

**Hors scope V1** (PR #40-#41 ultérieures) :

- Modal détail event avec diff before/after
- Export PDF/CSV
- Tamper-evident chain (colonne `hash_sha256` + trigger)
- Search full-text

---

## 📐 Sources de vérité

| Source                                            | Rôle                                                        |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `cw-screen-audit.jsx` (uploads)                   | Référence canonique du rendu : chronologie 6 events SHA-256 |
| `docs/DESIGN_SYSTEM_V1_TERRACOTTA.md` §2-3 + §5.5 | DS V1 (couleurs, typo, espaces, composants)                 |
| `apps/web/src/app/dashboard/page.tsx`             | Pattern actuel pour page editorial (PR #36-37)              |
| `apps/web/src/components/layout/Sidebar.tsx`      | Pour dé-disable l'item "Audit trail" (actuellement BIENTÔT) |
| Mockup PDF page audit                             | "06 - Audit trail · Chronologie SHA-256"                    |

---

## 🗄️ État DB à connaître

**Table `audit_events`** (existe déjà, 244 events en prod) :

```sql
id              uuid PK
org_id          uuid                  -- filter scope
user_id         uuid                  -- l'acteur
user_email      text                  -- email cached
event_type      text NOT NULL         -- ex: 'plan.locked', 'award.created'
resource_type   text                  -- ex: 'PLAN', 'AWARD', 'BENEFICIARY'
resource_id     uuid                  -- ID de la ressource ciblée
before_state    jsonb                 -- état avant (PR #40 utilisera)
after_state     jsonb                 -- état après (PR #40 utilisera)
metadata        jsonb NOT NULL        -- données contextuelles
ip_address      inet
user_agent      text
request_id      text
api_key_id      uuid
occurred_at     timestamptz NOT NULL
```

**30 types d'events distincts** observés en prod :

- `auth.*` : login_success, logout, magic_link_sent, org_switched
- `plan.*` : created, locked
- `award.*` : created, status_changed, modified
- `approval.*` : workflow_created, workflow_started, decision_recorded, workflow_approved, workflow_rejected
- `document.*` : generated, sent_for_signature, signed, preview_accessed, signature_cancelled, send_signature_failed
- `valuation.*` : started
- `exercise.*` : requested, completed, cancelled
- `beneficiary.*` : created, invited, profile_completed
- `portal.*` : leaver_simulated, document_downloaded
- `invitation.*` : created

**⚠️ Pas de colonne `hash_sha256`** — calcul à la volée pour V1 :

```ts
const hash = sha256(
  `${id}|${event_type}|${user_id}|${resource_type}|${resource_id}|${occurred_at}|${JSON.stringify(metadata)}`,
);
```

**RLS** : à vérifier — l'user authentifié doit voir uniquement les events de son `org_id` actif (via `auth.org_switched`).

---

## 🎨 Spec visuelle (depuis `cw-screen-audit.jsx` + DS Terracotta)

### Layout général

Standard sidebar + topbar (déjà OK partout). Container central `.cw-page` avec `max-width: 1024px`.

### Hero (zone haute)

```
[Capiwise / Audit trail / Dashboard]                    ← breadcrumb (PR #36 pattern)
AUDIT TRAIL · CONFORMITÉ · Q2 2026                      ← overline mono brass-700

Bonjour, 244 événements au registre.                    ← H1 italic Fraunces ss01
                                                          (italic mid-sentence pattern PR #36)

8 jours d'historique · 30 types d'actions · 5 acteurs   ← subtitle ink-700 sans-serif

[Filtre période ▾]  [Filtre type ▾]  [Recherche...]    ← filter row brass border-300
```

**Helpers à réutiliser** :

- `buildHeroGreetingPhrase()` (lib/hero-helpers.ts existant) — italic mid-sentence
- `formatDateOrdinalFr()` (lib/format-date.ts existant)

**Adaptations** :

- New helper `buildAuditHeroPhrase(eventCount: number, daysCovered: number, distinctTypes: number, distinctActors: number): { lead: string, italic: string, trail: string }`
- Pluriel intelligent : `1 événement` vs `244 événements`
- Si 0 events : `Aucun événement enregistré pour le moment.` (italic Fraunces complet)

### Liste chronologique (zone centrale)

**Structure HTML/JSX** :

```jsx
<div className="cw-audit-list">
  {/* Day separator */}
  <header className="cw-audit-day">
    <h2 className="cw-audit-day-title">Mercredi 5 mai</h2>
    <span className="cw-audit-day-count">12 événements</span>
  </header>

  {/* Event row */}
  <article className="cw-audit-event">
    <time className="cw-audit-time">13:44</time>
    <span className="cw-audit-actor">sasportasdavid+owner@gmail.com</span>
    <p className="cw-audit-verb">a basculé vers Paragraphe</p>
    <code className="cw-audit-hash">#a3f7e2c1</code>
  </article>

  {/* ... more events */}
</div>
```

**CSS** (à ajouter dans globals.css ou CSS module) :

```css
.cw-audit-list {
  display: flex;
  flex-direction: column;
  gap: 32px;
  margin-top: 32px;
}

.cw-audit-day {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid var(--paper-300);
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.cw-audit-day-title {
  font-family: var(--font-fraunces);
  font-size: 18px;
  font-weight: 500;
  color: var(--color-ink-900);
  font-feature-settings: 'ss01';
}

.cw-audit-day-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-500);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cw-audit-event {
  display: grid;
  grid-template-columns: 64px 240px 1fr auto;
  align-items: baseline;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--paper-200);
  transition: background 120ms ease;
}

.cw-audit-event:hover {
  background: var(--paper-100);
}

.cw-audit-time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-500);
  font-variant-numeric: tabular-nums;
}

.cw-audit-actor {
  font-size: 13px;
  color: var(--color-ink-700);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cw-audit-verb {
  font-size: 14px;
  color: var(--color-ink-900);
  margin: 0;
  line-height: 1.5;
}

.cw-audit-verb strong {
  /* highlight resource names */
  font-weight: 600;
  color: var(--color-brass-700);
}

.cw-audit-hash {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-300);
  letter-spacing: 0.04em;
  background: var(--paper-100);
  padding: 2px 6px;
  border-radius: 3px;
}
```

### Filtres (au-dessus de la liste)

```jsx
<div className="cw-audit-filters">
  <DateRangePicker
    label="Période"
    onChange={...}
    defaultValue={{ from: 7daysAgo, to: today }}
  />
  <EventTypeSelect
    label="Type d'action"
    options={[
      { value: 'all', label: 'Tous types' },
      { value: 'auth', label: 'Authentification' },
      { value: 'plan', label: 'Plans' },
      { value: 'award', label: 'Attributions' },
      { value: 'approval', label: 'Approbations' },
      { value: 'document', label: 'Documents' },
      { value: 'valuation', label: 'Valorisations' },
      { value: 'exercise', label: 'Exercices' },
      { value: 'beneficiary', label: 'Bénéficiaires' },
      { value: 'portal', label: 'Portail' }
    ]}
  />
  <SearchInput placeholder="Rechercher dans les événements..." disabled />
  {/* Search disabled in V1, enable in V2 (PR #41) */}
</div>
```

**Filtre par catégorie** : group les `event_type` par préfixe (avant le `.`). Ex `plan` matche `plan.created`, `plan.locked`, etc.

### Pagination

50 events par page, footer simple :

```jsx
<footer className="cw-audit-pagination">
  <span>
    Page {currentPage} sur {totalPages}
  </span>
  <button disabled={currentPage === 1}>← Précédent</button>
  <button disabled={currentPage === totalPages}>Suivant →</button>
</footer>
```

Ou bien utiliser `<Pagination>` de shadcn/ui s'il existe déjà dans le repo.

---

## 📝 Verbalization éditoriale des events (le cœur du fix)

L'enjeu : transformer un `event_type='plan.locked'` technique en **phrase éditoriale FR** lisible par un CFO non-tech.

**À implémenter dans `apps/web/src/lib/audit-event-formatter.ts`** :

```ts
import type { AuditEvent } from '@/types/audit';

interface EventVerbalization {
  verb: string; // "a verrouillé" / "s'est connecté"
  object?: string; // nom de la ressource (peut contenir HTML <strong>)
  context?: string; // détail contextuel optionnel
}

export function verbalizeEvent(event: AuditEvent, locale: 'fr-FR' = 'fr-FR'): EventVerbalization {
  const meta = event.metadata ?? {};

  switch (event.event_type) {
    // === AUTH ===
    case 'auth.login_success':
      return { verb: "s'est connecté" };
    case 'auth.logout':
      return { verb: "s'est déconnecté" };
    case 'auth.magic_link_sent':
      return { verb: 'a demandé un lien magique' };
    case 'auth.org_switched':
      return {
        verb: 'a basculé vers',
        object: meta.to_org_name ?? meta.to_org_id?.slice(0, 8) ?? 'une autre organisation',
      };

    // === PLAN ===
    case 'plan.created':
      return {
        verb: 'a créé le plan',
        object: meta.plan_name ?? `#${event.resource_id?.slice(0, 8)}`,
      };
    case 'plan.locked':
      return {
        verb: 'a verrouillé le plan',
        object: meta.plan_name ?? `#${event.resource_id?.slice(0, 8)}`,
      };

    // === AWARD ===
    case 'award.created':
      return {
        verb: "a créé l'attribution",
        object: meta.award_number ?? `#${event.resource_id?.slice(0, 8)}`,
        context: meta.beneficiary_name ? `pour ${meta.beneficiary_name}` : undefined,
      };
    case 'award.status_changed':
      return {
        verb: "a fait passer l'attribution",
        object: meta.award_number ?? `#${event.resource_id?.slice(0, 8)}`,
        context: `${meta.before_status ?? '?'} → ${meta.after_status ?? '?'}`,
      };
    case 'award.modified':
      return {
        verb: "a modifié l'attribution",
        object: meta.award_number ?? `#${event.resource_id?.slice(0, 8)}`,
      };

    // === APPROVAL ===
    case 'approval.workflow_created':
      return { verb: "a créé un workflow d'approbation" };
    case 'approval.workflow_started':
      return {
        verb: "a lancé l'approbation pour",
        object: meta.resource_label ?? meta.resource_type ?? 'une ressource',
      };
    case 'approval.decision_recorded':
      return {
        verb: 'a enregistré sa décision',
        context:
          meta.decision === 'APPROVE'
            ? 'approuvé'
            : meta.decision === 'REJECT'
              ? 'rejeté'
              : meta.decision,
      };
    case 'approval.workflow_approved':
      return {
        verb: 'le workflow a été approuvé pour',
        object: meta.resource_label ?? 'une ressource',
      };
    case 'approval.workflow_rejected':
      return {
        verb: 'le workflow a été rejeté pour',
        object: meta.resource_label ?? 'une ressource',
      };

    // === DOCUMENT ===
    case 'document.generated':
      return {
        verb: 'a généré le document',
        object: meta.document_type ?? meta.document_name ?? 'PDF',
      };
    case 'document.sent_for_signature':
      return {
        verb: 'a envoyé pour signature',
        object: meta.document_type ?? 'le document',
      };
    case 'document.signed':
      return {
        verb: 'a signé',
        object: meta.document_type ?? 'le document',
      };
    case 'document.preview_accessed':
      return {
        verb: "a consulté l'aperçu de",
        object: meta.document_type ?? 'le document',
      };
    case 'document.signature_cancelled':
      return {
        verb: 'a annulé la signature de',
        object: meta.document_type ?? 'le document',
      };
    case 'document.send_signature_failed':
      return {
        verb: "n'a pas pu envoyer pour signature",
        object: meta.document_type ?? 'le document',
        context: meta.error_reason,
      };

    // === VALUATION ===
    case 'valuation.started':
      return {
        verb: 'a lancé une valorisation',
        context: meta.plan_name ? `pour ${meta.plan_name}` : undefined,
      };

    // === EXERCISE ===
    case 'exercise.requested':
      return {
        verb: "a demandé l'exercice de",
        object: meta.units ? `${meta.units} u.` : 'une attribution',
      };
    case 'exercise.completed':
      return { verb: "a finalisé l'exercice" };
    case 'exercise.cancelled':
      return { verb: "a annulé une demande d'exercice" };

    // === BENEFICIARY ===
    case 'beneficiary.created':
      return {
        verb: 'a ajouté le bénéficiaire',
        object: meta.beneficiary_name ?? meta.beneficiary_email ?? 'un bénéficiaire',
      };
    case 'beneficiary.invited':
      return {
        verb: 'a invité',
        object: meta.beneficiary_email ?? 'un bénéficiaire',
      };
    case 'beneficiary.profile_completed':
      return { verb: 'a complété son profil' };

    // === PORTAL ===
    case 'portal.leaver_simulated':
      return { verb: 'a simulé un départ' };
    case 'portal.document_downloaded':
      return {
        verb: 'a téléchargé',
        object: meta.document_type ?? 'un document',
      };

    // === INVITATION ===
    case 'invitation.created':
      return {
        verb: 'a invité',
        object: meta.invitee_email ?? 'un nouvel utilisateur',
      };

    // === FALLBACK ===
    default:
      return {
        verb: `a déclenché l'événement`,
        object: event.event_type,
        context: event.resource_type ? `sur ${event.resource_type}` : undefined,
      };
  }
}
```

**Tests requis** (`audit-event-formatter.test.ts`, 12+ tests minimum) :

- Chaque famille d'event au moins 1 fois
- Fallback pour event_type inconnu
- Gestion du metadata absent (resilient)
- Pluralisation/genre FR correct

---

## 🔐 Hash SHA-256 calcul à la volée

**Helper `apps/web/src/lib/audit-hash.ts`** :

```ts
import { createHash } from 'crypto'; // Node side
// OR use Web Crypto API for client-side rendering

import type { AuditEvent } from '@/types/audit';

/**
 * Computes a deterministic SHA-256 hash of an audit event.
 * V1 implementation: hash on read (no DB column).
 * V2 will store this in `audit_events.hash_sha256` via INSERT trigger.
 */
export function computeAuditEventHash(event: AuditEvent): string {
  const payload = [
    event.id,
    event.event_type,
    event.user_id ?? '',
    event.resource_type ?? '',
    event.resource_id ?? '',
    event.occurred_at,
    JSON.stringify(event.metadata ?? {}),
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Returns the first 8 hex chars of the hash for display.
 */
export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}
```

**Tests requis** (`audit-hash.test.ts`, 4+ tests) :

- Hash déterministe (même input → même output)
- Différents events → différents hashes
- Format hex 64 chars
- shortHash retourne 8 chars

---

## 🛣️ Routing + RSC

### Nouvelle route : `apps/web/src/app/(dashboard)/audit/page.tsx`

Pattern RSC standard (cf `dashboard/page.tsx` PR #36-37) :

```tsx
import { Suspense } from 'react';
import { AuditTrailHero } from '@/components/audit/AuditTrailHero';
import { AuditTrailFilters } from '@/components/audit/AuditTrailFilters';
import { AuditTrailList } from '@/components/audit/AuditTrailList';
import { getAuditEvents, getAuditStats } from '@/lib/audit-queries';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; type?: string; page?: string };
}) {
  // Server-side data fetching
  const stats = await getAuditStats();
  const events = await getAuditEvents({
    from: searchParams.from,
    to: searchParams.to,
    eventTypePrefix: searchParams.type,
    page: parseInt(searchParams.page ?? '1', 10),
    pageSize: 50,
  });

  return (
    <main className="cw-page">
      <Breadcrumb items={[{ label: 'Capiwise', href: '/' }, { label: 'Audit trail' }]} />
      <AuditTrailHero stats={stats} />
      <AuditTrailFilters initialValues={searchParams} />
      <AuditTrailList events={events.items} />
      <Pagination currentPage={events.page} totalPages={events.totalPages} />
    </main>
  );
}
```

### Server queries : `apps/web/src/lib/audit-queries.ts`

```ts
import { createServerClient } from '@/lib/supabase/server';
import { unstable_cache } from 'next/cache';

interface AuditEventsParams {
  from?: string;
  to?: string;
  eventTypePrefix?: string; // 'plan' matches 'plan.created', 'plan.locked', ...
  page: number;
  pageSize: number;
}

export async function getAuditEvents(params: AuditEventsParams) {
  const supabase = await createServerClient();
  let query = supabase
    .from('audit_events')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false });

  // RLS automatically scopes by org_id (verify policy exists)
  if (params.from) query = query.gte('occurred_at', params.from);
  if (params.to) query = query.lte('occurred_at', params.to);
  if (params.eventTypePrefix && params.eventTypePrefix !== 'all') {
    query = query.like('event_type', `${params.eventTypePrefix}.%`);
  }

  const offset = (params.page - 1) * params.pageSize;
  query = query.range(offset, offset + params.pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: data ?? [],
    page: params.page,
    pageSize: params.pageSize,
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / params.pageSize),
  };
}

export const getAuditStats = unstable_cache(
  async () => {
    const supabase = await createServerClient();

    const [
      { count: totalEvents },
      { data: distinctTypes },
      { data: distinctActors },
      { data: oldest },
    ] = await Promise.all([
      supabase.from('audit_events').select('*', { count: 'exact', head: true }),
      supabase.from('audit_events').select('event_type', { count: 'exact', head: false }),
      supabase.from('audit_events').select('user_id', { count: 'exact', head: false }),
      supabase
        .from('audit_events')
        .select('occurred_at')
        .order('occurred_at', { ascending: true })
        .limit(1)
        .single(),
    ]);

    const daysCovered = oldest?.occurred_at
      ? Math.ceil((Date.now() - new Date(oldest.occurred_at).getTime()) / 86400000)
      : 0;

    return {
      totalEvents: totalEvents ?? 0,
      daysCovered,
      distinctTypes: new Set(distinctTypes?.map((d) => d.event_type)).size,
      distinctActors: new Set(distinctActors?.map((d) => d.user_id)).size,
    };
  },
  ['audit-stats'],
  { revalidate: 60 },
);
```

---

## 🎯 Sidebar : dé-disable l'item

### `apps/web/src/components/layout/Sidebar.tsx`

Trouver l'entrée actuellement disabled :

```tsx
{
  label: 'Audit trail',
  href: '/audit',
  icon: HistoryIcon,
  disabled: true,
  badge: 'BIENTÔT'
}
```

Et la remplacer par :

```tsx
{
  label: 'Audit trail',
  href: '/audit',
  icon: HistoryIcon,
  disabled: false,
  // pas de badge — l'item est now live
}
```

**Aussi** : ajouter le compteur dynamique (cf pattern PR #35 sidebar counters) :

```tsx
const auditCount = await getAuditCountForCurrentOrg();
// affichage : "Audit trail · 244"
```

---

## 🔍 Audit B0 obligatoire (rapport memo)

```bash
# Routes/pages existantes
find apps/web/src/app -type d -name "audit*" -o -name "audit-trail*"
ls apps/web/src/app/(dashboard) 2>/dev/null

# Composants audit existants
find apps/web/src/components -iname "*audit*" -o -iname "*event*timeline*"
grep -rn "audit_events" apps/web/src/lib/ --include="*.ts" 2>/dev/null

# Sidebar
cat apps/web/src/components/layout/Sidebar.tsx | grep -A 5 "Audit"

# RLS policies sur audit_events
# (Demande à David ou check via Supabase MCP)

# Helpers existants pour formatting events
grep -rn "verbalize\|formatEvent" apps/web/src/lib/ --include="*.ts" 2>/dev/null
```

**Le rapport B0 répond à 5 questions** :

1. **Page `/audit` existe-t-elle déjà ?** Si oui, quelle structure (RSC ? client ?) ?
2. **Sidebar item "Audit trail"** : où est sa logique de `disabled: true` + tag `BIENTÔT` actuelle ? PR #35 ?
3. **Helpers existants** pour audit_events : logging service côté serveur (utilisé pour insérer les events), formatters (probablement absents — à créer) ?
4. **RLS policy sur audit_events** : exists-elle ? scopée par `org_id` ? Si non, à créer dans cette PR (migration SQL).
5. **Patterns RSC + cache** : suivre exactement PR #36-37 pattern (`unstable_cache`, server actions, breadcrumb pattern).

**Si une réponse est ambiguë** → format BLOQUEUR + attente David.

---

## 🧪 Tests + a11y

```bash
pnpm typecheck                   # 0 erreur
pnpm -F web lint                 # 0 nouveau warning
pnpm test                        # 1142+ → ~1170+ tests verts
```

**Tests à ajouter** :

- `audit-event-formatter.test.ts` (12+ tests : 1 par famille d'event minimum + fallback + edge cases)
- `audit-hash.test.ts` (4+ tests : hash déterministe + format + shortHash)
- `audit-queries.test.ts` (3+ tests : pagination + filtres + cache)

**A11y** :

- Page : `<main role="main" aria-label="Journal d'audit">`
- Day separator : `<header role="separator">` avec heading approprié
- Event row : `<article role="listitem">` à l'intérieur de `<ol role="list">`
- Filter row : `<form role="search">` avec `<label>` explicites
- Hash : `<code aria-label="Empreinte cryptographique de l'événement, tronquée">`
- Pagination : `<nav aria-label="Pagination des événements">`
- Empty states : message complet avec `role="status"`

---

## 📦 Livraison

- **Branche** : `feat/module-13-audit-trail-editorial-v1`
- **Commits attendus** (5-6 commits propres) :
  1. `chore(audit): audit B0 memo — page /audit RSC + verbalization helpers`
  2. `feat(audit): audit-event-formatter helper + 12 tests`
  3. `feat(audit): audit-hash helper SHA-256 on-the-fly + 4 tests`
  4. `feat(audit): audit-queries server functions (paginated + filtered + cached)`
  5. `feat(audit): page /audit RSC editorial + components AuditTrailHero/Filters/List`
  6. `feat(audit): sidebar enable item Audit trail with dynamic counter`

- **PR title** : `feat(module-13): audit trail editorial V1 (#39)`

- **PR body** :
  - Avant/après screenshots (sidebar disabled → enabled, page nouvelle)
  - Liste des 30 event_types couverts par le formatter
  - Démo verbalization : screenshot avec 6-8 events Paragraphe lisibles
  - Confirmation tests verts + a11y check (axe-core ou manual)
  - Note V2 : modal détail (PR #40), export PDF (PR #41), tamper-evident chain (PR #41)

---

## ⚠️ Pièges connus

1. **RLS policy** : si pas en place sur audit_events, AJOUTER une migration dans cette PR avec policy `CREATE POLICY "audit_events_org_scope" ON audit_events FOR SELECT USING (org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid()))`
2. **Performance** : 244 events est OK sans optim, mais à 10k events il faudra index `(org_id, occurred_at desc)` — vérifier qu'il existe (probablement déjà créé dans Module 13 V0 / Module 1 Foundation)
3. **Hydration mismatch** : si on calcule le hash côté serveur (RSC), pas de soucis. Si on le fait côté client, attention au SSR mismatch. Pref : calcul serveur dans la query, attaché au DTO.
4. **Timezones** : `occurred_at` est en UTC. Pour le groupement par jour, utiliser `toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })`.
5. **Filtre par event_type prefix** : `LIKE 'plan.%'` doit être case-sensitive. Vérifier que la DB stocke en lowercase strict.
6. **Empty state** : si 0 events sur la période filtrée, afficher message éditorial italic Fraunces : _"Aucun événement enregistré sur cette période."_
7. **Paragraphe a actuellement 1 seul event** (`auth.org_switched`). Pour démo riche, prévoir un seed de ~30-50 events plausibles **— mais c'est hors scope de cette PR**, je le ferai en parallèle via Supabase MCP.

---

## 🎯 Definition of Done

- [ ] Memo audit B0 commité (5 questions répondues)
- [ ] `audit-event-formatter.ts` avec verbalization de 30 event_types + fallback + 12 tests ✅
- [ ] `audit-hash.ts` avec SHA-256 calcul à la volée + 4 tests ✅
- [ ] `audit-queries.ts` avec `getAuditEvents()` paginé + filtré + `getAuditStats()` cached ✅
- [ ] Page `/audit` RSC fonctionnelle avec layout standard ✅
- [ ] Hero italic Fraunces : "Bonjour, X événements au registre." + subtitle dynamique ✅
- [ ] Filtres date range + event_type select fonctionnels (URL searchParams) ✅
- [ ] Liste chronologique groupée par jour avec format event éditorial ✅
- [ ] Hash SHA-256 tronqué affiché en mono ink-300 ✅
- [ ] Pagination 50/page (URL `?page=N`) ✅
- [ ] Sidebar item "Audit trail" dé-disabled + counter dynamique ✅
- [ ] Empty states (0 events / 0 events filtrés) éditoriaux italic Fraunces ✅
- [ ] RLS policy `audit_events_org_scope` vérifiée/créée ✅
- [ ] A11y : `<main>/<article>/<ol>/<nav>` semantics + aria-labels ✅
- [ ] 1170+ tests verts + typecheck OK + lint clean ✅
- [ ] PR créée + screenshot Paragraphe avec 8+ events affichés correctement ✅
