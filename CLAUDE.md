# Equity Platform — Contexte projet

## Mission

SaaS B2B français de gestion administrative et financière de plans
d'actionnariat salarié.

Stack : Next.js 16 (App Router, Turbopack) + Supabase (Postgres +
Auth + Edge Functions + Realtime) + Resend (email) + Yousign
(signature) + moteur Python Monte Carlo existant
(https://equity-gem-quant-tonnom.fly.dev).

## Specs de référence

Tous les modules ont leur spec dans `docs/MODULE_XX_*.md`.
Ces specs sont **autoritaires** : si une instruction de chat
contredit la spec, demander confirmation avant de procéder.

Modules disponibles :

- `docs/MODULE_01_FOUNDATION.md` — architecture globale
- `docs/MODULE_02_IDENTITY_ROLES.md` — RBAC, magic link,
  custom_access_token_hook
- `docs/MODULE_03A_PLANS.md` — création de plans (wizard 7 étapes)
- `docs/MODULE_03B_AWARDS_LIFECYCLE.md` — attributions individuelles
  - state machine
- (les modules 4-13 seront ajoutés au fur et à mesure)

Ne pas anticiper les modules futurs sauf instruction explicite.

## Conventions de code

### Stack et tooling

- pnpm comme package manager (pnpm-workspace.yaml à la racine)
- Conventional Commits (feat:, fix:, chore:, docs:, test:)
- Git flow : 1 branche par module (feat/module-XX-yyy),
  PR draft pour suivre, squash-merge sur master à la fin du module
- Next.js 16 App Router : proxy.ts (pas middleware.ts),
  async cookies/headers, dossiers privés \_\* exclus du routing

### TypeScript

- Pas de `any` sans commentaire qui justifie
- Préférer `type` à `interface` sauf besoin d'extends
- Imports absolus via `@/` pour apps/web et `@equity/shared`
  pour le package partagé

### Validation et types

- Tous les inputs des Server Actions validés via Zod
- Schémas Zod, enums, types runtime, constantes vivent dans
  `packages/shared/src/schemas/` et sont importés directement
  par les consumers (pas de re-export depuis Server Actions)

### Server Actions — règles strictes

- Fichiers `'use server'` exportent UNIQUEMENT des fonctions
  async. Pas d'objet, pas de constante, pas de type runtime,
  pas de re-export, pas de schéma. Sinon Next.js plante au
  runtime avec "use server file can only export async
  functions".
- Pattern de retour : `{ ok: true, ...data } | { ok: false, error: string }`.
  Le composant client lit `result.ok` puis décide du toast
  success/destructive. Pas de throw qui remonte au client.
- Toujours wrapper l'input avec `schema.safeParse(input)`
  en début d'action. Si parse fail, retourner
  `validationError(parsed.error)` (helper standard du repo).

### Permissions

- Toutes les actions admin commencent par `requirePermission('xxx')`
  (RBAC du Module 2). Pas de service_role côté client.
- Les RPC sensibles (create*\*, transition*_, delete\__) ont
  SECURITY DEFINER + check user_has_permission() en haut.

### Audit

- Toutes les actions critiques (création, transition d'état,
  cancellation, modification, soft-delete) loggent un
  `audit_event` avec metadata structurée.
- Pattern : `await logAuditEvent({ event_type: 'xxx.yyy', 
resource_type, resource_id, metadata })`.

### State machines

- Toute transition d'état passe par UNE SEULE fonction (`transitionXxx()`).
- Pas de shortcut "create direct dans cet état" sauf cas
  exceptionnel documenté (ex: import historique). Le RPC peut
  l'accepter mais le wrapper Server Action force le passage
  par DRAFT puis transition pour la cohérence d'audit.
- État initial = toujours DRAFT (ou équivalent).

### Tests

- Vitest pour la logique pure (state machines, helpers, schémas)
- Cible : 100% lignes/fonctions sur la state machine
- Tests Server Actions avec mocks Supabase (subset critique)
- Tests E2E manuels en attendant Playwright (TODO transverse)

### UI

- shadcn/ui (Base UI) pour tous les composants. Tailwind 4
  pour le style (CSS vars dans @theme inline).
- Theme Capiwise : indigo primary, emerald accent, slate neutral
- React Hook Form + Zod resolver pour tous les forms
- Pas de `localStorage`/`sessionStorage` direct dans les
  artifacts/composants (les sandboxes /dev/\* sont une exception)
- Sidebar nav : ajouter le nouveau lien dès que la page existe
  (pas de placeholder "à venir")

### Migration DB

- Numéro séquentiel : 00001_xxx, 00002_yyy, ...
- Toujours appliquer en cloud via mcp Supabase + tester en
  SQL pur avant de toucher au TS
- Régénérer les types après chaque migration :
  `pnpm supabase gen types typescript --linked > 
 apps/web/src/lib/supabase/database.types.ts`

### Sandbox /dev/\*

- Toute mécanique complexe (state machine, wizard sub-step,
  calculs critiques) a sa sandbox `/dev/xxx` avec presets
  pour test visuel
- Layout `/dev/layout.tsx` protège en production via
  `process.env.ENABLE_DEV_SANDBOX !== 'true'`

## État actuel

### Modules livrés

- [x] Module 1 — Foundation (DB, RLS, auth, layouts)
- [x] Module 2 — Identity & Roles (login fonctionnel ✅)
- [x] Module 3a — Plans
  - [x] Wizard 7 étapes (container + sidebar + footer + auto-save)
  - [x] B1 — Migrations tables métier (00010-00019)
  - [x] B2 — RPC create_plan_full + Server Action createPlan
  - [x] B3 — Mutations update/duplicate/archive/lock +
        RPC duplicate_plan_full + PlanActionsMenu
  - [x] B4 — Pages liste + détail (8 onglets) + sidebar
  - [x] B5 — Edge Function compute-valuation + RunValuationButton
        (Realtime) + ValuationCard
  - [x] B5.5 — Page détail valuation /valuations/[runId]
  - [x] B5.6 — Onglet IFRS 2 + Edge Function compute-ifrs2-expense
  - [x] B5.7 — Greeks + debug paths dans payload Python

### En cours

- [ ] Module 3b — Awards Lifecycle (branche feat/module-3b-awards,
      PR draft #5)
  - [x] B1 — DB & RPCs (counter, triggers, create_award_full,
        materialize_vesting_events, bulk_create_awards)
  - [x] B2 — State machine + Server Actions + sandbox
        /dev/award-state-machine
  - [x] B3 — Page liste /dashboard/awards + modale création +
        row actions (cancel/forfeit/transition)
  - [ ] B4 — Page détail /dashboard/awards/[id] (5 onglets)
  - [ ] B5 — Bulk import CSV
  - [ ] B6 — Modifications IFRS 2.27-28
  - [ ] B7 — Compliance V1 + closure

### À venir

- [ ] Module 4 — Beneficiaries Management (CRUD complet, import
      RH, lifecycle)
- [ ] Module 5 — Approval Engine (workflow multi-étapes
      configurable)
- [ ] Module 6 — Document Engine + Yousign
- [ ] Module 7 — Notifications Resend
- [ ] Module 8 — Beneficiary Portal
- [ ] Module 9 — Exercise Workflow
- [ ] Module 10 — Cap Table dynamique
- [ ] Module 11 — IFRS 2 finalisation
- [ ] Module 12 — Compliance Engine V2 (configurable)
- [ ] Module 13 — Audit Trail & Reporting

## Dette technique connue

1. **Migration de cohérence DB** : `rate_flat` / `dividend_yield`
   stockés en % bruts au lieu de fractions. Fix défensif actuel
   dans `normalizeRateUnit()` côté payload Python. À refondre
   en migration propre quand on touchera au Module 11.

2. **`runComplianceChecks`** : actuellement stub,
   `compliance_warnings` toujours vide. Implémentation V1 en
   Module 3b B7 puis V2 configurable en Module 12.

3. **Tests automatisés** :
   - Vitest setup OK, 58/58 tests
   - Playwright pas encore en place — tests E2E manuels en
     attendant
   - Tests d'intégration Server Actions ↔ Supabase test
     instance pas en place

4. **Mini-table beneficiaries** : créée a minima pour Module 3b.
   CRUD complet + import RH + lifecycle au Module 4.

5. **valuation_runs.hypothesis_set_id** : sans FK explicite.
   Fonctionne via convention. À nettoyer au Module 11.

6. **8 leavers defaults Standard FR Tech** : hardcodés au mapper
   du wizard plan. Les rendre configurables (par template plan)
   au Module 4 ou Module 12.

## Sécurité

- [x] Rotation clé Resend après leak dans .env.example (date: \_\_\_)
- [ ] Audit RLS exhaustif avant production (toutes les tables
      doivent avoir RLS ENABLED + policies cohérentes)
- [ ] Rate limiting Server Actions (anti-DoS, anti-spam)
- [ ] CSP headers + sécurité CSRF (Next.js le fait nativement
      sur les Server Actions, à confirmer)

## Patterns récurrents (anti-doublons)

Si tu te demandes "comment faire X", chercher d'abord :

- **Server Action avec audit + Result pattern** : voir
  `apps/web/src/server/actions/plans.ts::archivePlan` (référence)
- **RPC atomique avec rollback** : voir migration 00017
  `create_plan_full`
- **State machine + transitions** : voir
  `apps/web/src/lib/stateMachines/awardStateMachine.ts`
- **Page liste avec filtres** : voir
  `apps/web/src/app/dashboard/plans/page.tsx`
- **Page détail avec Tabs** : voir
  `apps/web/src/app/dashboard/plans/[id]/page.tsx`
- **DataTable réutilisable** : voir
  `apps/web/src/components/shared/data-table.tsx`
- **Modale de création + sub-form** : voir
  `apps/web/src/components/awards/CreateAwardModal.tsx`
- **Sandbox /dev/** : voir `apps/web/src/app/dev/*/page.tsx`
- **Edge Function avec service_role** : voir
  `supabase/functions/compute-valuation/`
- **Realtime hook** : voir
  `apps/web/src/hooks/useValuationRunStatus.ts`

Si une nouvelle action ne ressemble à aucun de ces patterns,
documenter le choix dans le memory du sous-module.

## Conventions de mémoire

`memory/` contient les closures de chaque sous-module :

- `module_XX_b1_recon.md` — recon préalable (écarts spec/DB)
- `module_XX_b1_complete.md` — closure (commits, tests, décisions)
- `module_XX_complete.md` — closure du module entier (à la fin)
- `MEMORY.md` — index global

Avant de démarrer un sous-module, lire les memory du sous-module
précédent. Avant de démarrer un module, lire le memory complete
du module précédent.

## Contact pour décisions ambiguës

Si une décision architecturale ou métier est ambiguë :

1. Documenter les options dans le memory du sous-module
2. Faire un choix conservateur (le moins risqué pour la
   cohérence DB et l'audit)
3. Pinger l'utilisateur dans le récap final pour validation
