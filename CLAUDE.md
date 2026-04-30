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
- Les RPC sensibles (create*\*, transition*\_, delete\_\_) ont
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

### Supabase Auth — pièges critiques côté Server Action

- **`supabase.auth.signInWithOtp()` côté Server Action écrase la
  session du caller** si on utilise le client SSR cookie-based
  (`createSupabaseServerClient`). Symptôme : le mail magic link part
  bien (200 OK), mais `Set-Cookie` remplace le token de session de
  l'admin caller par celui de la cible. Les requêtes suivantes (RPC
  qui dépendent de `auth.uid()`/`current_org_id()`, puis
  `router.refresh()` côté client) échouent silencieusement ou avec
  "TypeError: network error" en dev.
- **Règle** : pour tout call `auth.*` qui agit sur un autre user que
  le caller (invitation, magic link envoyé pour un tiers, reset
  password admin), utiliser `getSupabaseAdminClient()` (service_role
  - `persistSession: false`). Garder le client cookie-based pour les
    RPC qui doivent voir l'identité du caller.
- Référence : `inviteBeneficiary` dans
  `apps/web/src/server/actions/beneficiaries.ts` (commit
  `624f939`, fix Module 4 B5). Le bug avait shipé en B5 avant fix.
- Pour générer un magic link sans envoyer de mail (Module 7 +
  Resend custom), utiliser
  `getSupabaseAdminClient().auth.admin.generateLink({ type:
'magiclink', email })` puis envoyer via Resend. Cf. pattern dans
  `apps/web/src/server/actions/auth.ts`.

### Base UI — pièges courants

- **DropdownMenuLabel** doit être dans **DropdownMenuGroup** (sinon
  "MenuGroupRootContext is missing" runtime). Le composant
  `DropdownMenuLabel` (`apps/web/src/components/ui/dropdown-menu.tsx`)
  wrappe désormais automatiquement le Label dans un Group "stand-alone"
  pour éviter le piège — pas besoin de Group manuel côté call-site, mais
  rien ne casse si tu en mets un.
- **DropdownMenuRadioItem** doit être dans **DropdownMenuRadioGroup**.
  Pas de fallback automatique — wrap manuellement.
- **DropdownMenuCheckboxItem** : OK seul, pas besoin de Group.
- En cas de doute sur un nouveau composant Base UI : wrapper avec son
  Group parent par défaut, lire la doc en cas de runtime error
  "...ContextRoot is missing".

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

- [x] Module 3b — Awards Lifecycle (branche feat/module-3b-awards,
      PR #5 ready-for-review)
  - [x] B1 — DB & RPCs (counter, triggers, create_award_full,
        materialize_vesting_events, bulk_create_awards)
  - [x] B2 — State machine + Server Actions + sandbox
        /dev/award-state-machine
  - [x] B3 — Page liste /dashboard/awards + modale création +
        row actions (cancel/forfeit/transition)
  - [x] B4 — Page détail /dashboard/awards/[id] (5 onglets)
  - [x] B5 — Bulk import CSV (papaparse + wizard 3 étapes)
  - [x] B6 — Modifications IFRS 2.27-28 (RPC + 5 sub-forms +
        JsonDiffViewer)
  - [x] B7 — Compliance V1 (4 rules + runChecks + UI dialogs) +
        closure module 3b complete

- [x] Module 4 — Beneficiaries Management
  - [x] B1 — Migrations 00025-00028 (~25 cols ALTER + 4 RPCs +
        seed permissions + extension hook M2)
  - [x] B2 — 9 Server Actions + Zod schemas + Compliance V1
        (5 rules) + sandbox /dev/beneficiary-lifecycle
  - [x] B3 — Page liste /dashboard/beneficiaries + 7 filtres
        URL-shareable + row actions + sidebar
  - [x] B4 — Page détail /dashboard/beneficiaries/[id] +
        4 onglets + EditBeneficiaryModal
  - [x] B5 — CreateBeneficiaryModal + BulkImportBeneficiariesModal
        CSV (papaparse + wizard 3 steps) + fix Supabase Auth
  - [x] B6 — Compliance V1 finalisé (6e rule
        BSPCE_BENEFICIARY_TYPE_REVERSE) + closure module 4
        complete

- [x] Module 5 — Approval Engine
  - [x] B1 — Migrations 00029-00032 (extend approval\_\*
        tables + nouvelle table approval_decisions + 4 RPCs +
        seed approvals.attach + template approval_pending)
  - [x] B2 — 13 Server Actions + hook transitionAward/
        cancelAward avec flag skipApprovalHook +
        compliance V1 (3 rules : WORKFLOW_REQUIRED_FOR_AGA,
        NO_SELF_APPROVAL, WORKFLOW_HAS_VALID_STEPS) + sandbox
  - [x] B3 — Page admin /dashboard/settings/approvals
        (liste + édition workflow, max 10 steps UP/DOWN,
        attach/detach plan)
  - [x] B4 — Inbox /dashboard/approvals (2 tabs cards) +
        page détail request (timeline color-coded) +
        AwardApprovalCard + sidebar badge
  - [x] B5 — E2E SQL validés + cleanup + closure module
        complete

### À venir

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

2. **`runComplianceChecks` V1 livrée Module 3b B7** : 4 rules pure
   functions (BSPCE_BENEFICIARY_TYPE, AGA_30_PERCENT_CAP,
   POOL_AVAILABLE, GRANT_DATE_RECENT) hookées dans `transitionAward`
   à `toStatus=PROPOSED` uniquement. V2 configurable par org en
   Module 12 via une table `compliance_rules_overrides`.

3. **AGA_30_PERCENT_CAP** : retourne null en V1 si
   `companyTotalShares` indisponible (cap table pas en place). Full
   check Module 10. La rule existe et est testée — il manque juste
   le ctx loader côté `runChecks.ts` quand Module 10 livrera la cap
   table.

4. **Realtime sur awards** : pas de push Supabase Realtime sur
   `awards.status_changed`. Le user doit `router.refresh()` ou
   recharger pour voir un nouveau statut. À envisager Module 4+
   (cosmétique, pas bloquant).

5. **Vesting cron auto** : pas de pg_cron qui passe les
   `vesting_events` PENDING → VESTED automatiquement à la
   `scheduled_date`. Le bouton "Forcer le vesting" prévu dans la
   spec a été skip en V1. À implémenter Module 9 (exercise
   lifecycle).

6. **Migration drift cloud** : 1 hotfix appliqué en cloud sans
   file local : `module_3b_create_award_full_fix_fk` (20260428).
   À reverse-engineer depuis le cloud + créer un file local
   (00021_fix_fk.sql ou similaire) pour resync avant qu'un autre
   dev clone le repo.

7. **Tests automatisés** :
   - Vitest setup OK, 107/107 tests workspace (12 shared + 95 web)
   - Playwright pas encore en place — tests E2E manuels en
     attendant
   - Tests d'intégration Server Actions ↔ Supabase test
     instance pas en place
   - Pas de plugin React JSX dans Vitest (les tests de composants
     React doivent passer par des helpers pure extraits)
   - **CI GitHub Actions pas en place** — pas de workflow `test
on PR` ni `test on master push`. À mettre en place avant
     d'avoir plusieurs contributors ou avant la prod. Plus
     efficace qu'un agent humain-like de surveillance. Gates
     attendus : `pnpm typecheck`, `pnpm -F web lint`, `pnpm test`,
     migration drift check (`supabase db lint --linked`).

8. **Mini-table beneficiaries** : créée a minima pour Module 3b.
   CRUD complet + import RH + lifecycle au Module 4.

9. **valuation_runs.hypothesis_set_id** : sans FK explicite.
   Fonctionne via convention. À nettoyer au Module 11.

10. **8 leavers defaults Standard FR Tech** : hardcodés au mapper
    du wizard plan. Les rendre configurables (par template plan)
    au Module 4 ou Module 12.

11. **`incremental_fair_value`** sur `award_modifications` :
    colonne existe mais le calcul est différé au moteur Python
    (Module 11). Affichage UI = "—" en attendant. Pas de page UI
    pour suivre les `valuation_runs` déclenchés par les
    modifications IFRS 2 (Module 11).

12. **Trigger `enforce_beneficiary_self_update()` (Module 4 B1)** :
    bloque les UPDATEs via SQL Editor Supabase Dashboard même pour
    des admins légitimes. Le trigger check `user_has_permission
('beneficiaries.update')` qui peut être null en contexte SQL
    Editor (pas de session JWT). Symptôme : `UPDATE beneficiaries
SET deleted_at = ...` rejeté en cleanup post-mortem.
    Fix V2 : revoir la logique pour distinguer (a) bénéficiaire-self
    (`user_id = auth.uid()`), (b) admin sans permission, (c)
    contexte service_role / SQL Editor (ex: `current_setting
('request.jwt.claims', true)` IS NULL → bypass enforce). Pour
    l'instant, cleanup admin doit passer par le client Supabase
    avec service_role ou via une Server Action `archiveBeneficiary`.

13. **FK `approval_decisions.step_id` sans `ON DELETE CASCADE`**
    (Module 5 B1) : empêche le cleanup direct via DELETE workflow
    → cascade. Workaround : delete decisions d'abord. À fixer V2.

14. **`runApprovalAwardComplianceChecks` pas branché dans
    `transitionAward`** (Module 5 B2) : la rule
    `WORKFLOW_REQUIRED_FOR_AGA` (soft warning AGA sans workflow)
    reste dormante. Helper `checkAwardApprovalCompliance` exposé
    mais pas appelé. À wire Module 12 (Compliance V2 configurable).

15. **Pas de notifications email Module 5** : table `notifications`
    populated en `IN_APP` PENDING par les RPCs `start_/evaluate_
approval_workflow`. Module 7 (Resend) consommera ces rows pour
    envoyer les emails approbateurs.

16. **Pas de SLA / escalation auto Module 5** : colonnes
    `sla_hours` + `auto_escalate_after_hours` + `escalate_to_user_id`
    dans `approval_workflow_steps` (Module 1 préfiguré) mais non
    exploitées V1. Reportées V2 (Module 12).

17. **2 dummy memberships APPROVER** (Module 5 B1) : conservés
    actifs en cloud sur les users `832762f1` (sasportasdavid+2)
    et `7f56d666` (sasportasdavid+test) pour permettre les tests
    E2E B2-B5. Cleanup possible si plus utiles.

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
- **Modale create/edit partagée (mode prop + alias)** : voir
  `apps/web/src/components/beneficiaries/BeneficiaryFormModal.tsx`
  (avec aliases `CreateBeneficiaryModal` + `EditBeneficiaryModal`)
- **Modale wizard multi-step (useReducer)** : voir
  `apps/web/src/components/awards/BulkImportModal.tsx` ou
  `CreateModificationModal.tsx`
- **Helpers CSV parsing (papaparse + Zod safeParse)** : voir
  `apps/web/src/components/beneficiaries/bulk-import-helpers.ts`
  (mapping snake→camelCase, summary, extractValidEmails)
- **Compliance rule pure function + runner** : voir
  `apps/web/src/lib/compliance/rules/awardRules.ts` +
  `runChecks.ts`
- **Compliance rule async avec ctx pré-chargé** : voir
  `BSPCE_BENEFICIARY_TYPE_REVERSE` dans `beneficiaryRules.ts` —
  count chargé conditionnellement dans `runChecks.ts`
- **Hook anti-récursion via flag** : voir `transitionAward(*,
skipApprovalHook?: boolean)` dans
  `apps/web/src/server/actions/awards.ts`. Le 2e call interne
  (auto PROPOSED→PENDING_APPROVAL après workflow démarré, ou
  reverts depuis approveDecision/cancelApprovalRequest) passe
  `skipApprovalHook=true` pour éviter de re-déclencher le
  workflow.
- **Timeline visuelle color-coded + tests sans React** : voir
  `apps/web/src/components/approvals/ApprovalRequestTimeline.tsx`
  (5 statuts, animation pulse) + `timeline-helpers.ts`
  (`computeStepStatus` extrait pour Vitest unitaires).
- **Compteur badge sidebar SSR conditionnel** : voir
  `apps/web/src/components/shared/dashboard-sidebar.tsx` +
  layout SSR qui charge le count via permission gate (0 query
  DB pour les users sans la perm).
- **JSON diff viewer 2 colonnes** : voir
  `apps/web/src/components/shared/JsonDiffViewer.tsx`
- **Discriminated union Zod par variant** : voir
  `packages/shared/src/schemas/award.ts::createModificationSchema`
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

## Conventions de casing pour enums DB

- Beneficiaries.status = lowercase ('active', 'on_leave', 'terminated')
  Lifecycle court avec peu de valeurs, lowercase plus lisible
- Beneficiaries.beneficiary_type = UPPERCASE ('EMPLOYEE', 'CONSULTANT',
  'DIRIGEANT', 'EXTERNAL')
  Aligné Module 3b, évite re-migration
- Awards.status = UPPERCASE (16 valeurs)
- Plans.status = UPPERCASE ('DRAFT', 'ACTIVE', 'CLOSED')

Règle générale : un enum court (3-4 valeurs) = lowercase OK.
Un enum long (5+) ou critique métier (workflow status) = UPPERCASE.
Pour cohérence : suivre l'existant DB plutôt que la spec si écart.

À ajouter à CLAUDE.md, section "Conventions de code"
(sous-section "Server Actions") :

### Supabase Auth — pièges critiques côté Server Action

⚠️ supabase.auth.signInWithOtp() / signUp() / inviteUserByEmail()
appelés sur le client SSR cookie-based écrasent la session du
caller (admin) avec le token de l'utilisateur cible. Set-Cookie
casse l'auth de l'admin pour les requêtes suivantes dans la
même Server Action.

Symptômes :

- L'opération Auth réussit (mail envoyé)
- Mais les RPC suivantes voient auth.uid()=null → throw
- router.refresh() côté client plante avec "TypeError: network error"

Fix : pour TOUTE opération Auth qui crée/identifie un USER
DIFFÉRENT du caller, utiliser le client admin (service_role +
persistSession:false) :

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const adminClient = getSupabaseAdminClient();
await adminClient.auth.signInWithOtp({ email, options: {...} });
// Cookie de session du caller préservé ✓

Conserver le client cookie-based pour les RPC qui ont besoin
de auth.uid() (audit, RLS).

Référence : Module 4 B5 — bug fix `624f939`
