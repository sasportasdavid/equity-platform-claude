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
packages/shared/src/types/database.ts`
- ⚠️ Le fichier de types vit UNIQUEMENT dans `@equity/shared` (single
  source). Les 3 clients Supabase (`apps/web/src/lib/supabase/{client,server,admin}.ts`)
  importent `Database` depuis `@equity/shared`. Le fichier
  `apps/web/src/lib/supabase/database.types.ts` a été supprimé en
  PR #9 (était dead code, jamais importé — fix dette #44).

### Sandbox /dev/\*

- Toute mécanique complexe (state machine, wizard sub-step,
  calculs critiques) a sa sandbox `/dev/xxx` avec presets
  pour test visuel
- Layout `/dev/layout.tsx` protège en production via
  `process.env.ENABLE_DEV_SANDBOX !== 'true'`

### Convention permissions documents (Module 6)

La spec `docs/MODULE_06_DOCUMENT_ENGINE.md` mentionne des
permissions qui ne matchent PAS les noms réellement seedés en
DB (préfigurées Module 1). Toujours utiliser le **nom DB** côté
code (`requirePermission(...)`, `hasPermission(...)`) :

| Spec                         | DB                             |
| ---------------------------- | ------------------------------ |
| `documents.generate`         | `documents.send_for_signature` |
| `documents.cancel_signature` | `documents.void`               |
| `documents.download`         | `documents.read`               |

### Variables env Yousign (Module 6 B3)

Côté Next.js (`.env.local`) :

- `YOUSIGN_API_KEY` — clé API récupérée Dashboard Yousign
- `YOUSIGN_API_BASE_URL` — `https://api-sandbox.yousign.app/v3`
  en dev/staging, `https://api.yousign.app/v3` en prod
- `YOUSIGN_WEBHOOK_SECRET` — HMAC secret partagé avec le
  Dashboard Yousign (Webhooks). DOIT être configuré côté
  Edge Function aussi (`supabase secrets set
YOUSIGN_WEBHOOK_SECRET=...`)
- `YOUSIGN_ENVIRONMENT` — `sandbox` ou `production`, tracé
  dans `signature_requests.yousign_environment`

Côté Edge Function `yousign-webhook` (Supabase secrets) :

```bash
supabase secrets set \
  YOUSIGN_API_KEY=xxx \
  YOUSIGN_API_BASE_URL=https://api-sandbox.yousign.app/v3 \
  YOUSIGN_WEBHOOK_SECRET=xxx
```

Webhook URL à déclarer dans le Dashboard Yousign :
`https://{project-ref}.supabase.co/functions/v1/yousign-webhook`

Events à activer côté Yousign : `signer_request.viewed`,
`signer_request.signed`, `signer_request.declined`,
`signature_request.completed`.

### Variables env Resend (Module 7 B2)

Côté Next.js (`.env.local`) :

- `RESEND_API_KEY` — clé Resend Dashboard → API Keys
- `RESEND_FROM_EMAIL` — adresse expéditeur (domaine vérifié Resend),
  ex `no-reply@capiwise.fr`
- `RESEND_FROM_NAME` — nom affiché, ex `Capiwise`
- `RESEND_REPLY_TO` — adresse Reply-To (optional, fallback = from)
- `RESEND_WEBHOOK_SECRET` — HMAC svix shared secret (B4 webhook)

Côté Edge Function `notifications-consumer` (Supabase secrets, B3) :
identiques + service_role injecté automatiquement.

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

- [x] Module 6 — Document Engine + Yousign Signatures
  - [x] B1 — Migrations 00033-00037 (extend documents tables + Storage bucket documents + 6 RPCs documents/
        signatures + seed 3 templates V1 + extend
        content_format CHECK)
  - [x] B2 — 3 templates React PDF (BSPCE/AGA/SO) + 5 Server
        Actions documents + compliance V1 (3 rules) + sandbox
        /dev/document-engine + RPC load_award_document_context
  - [x] B3 — Yousign V3 wrapper client (8 fns) + 3 Server
        Actions (send/cancel/getStatus) + Edge Function
        yousign-webhook deployée cloud (HMAC + 4 events +
        idempotency + EdgeRuntime.waitUntil background)
  - [x] B4 — UI documents intégrée page détail award (6e
        onglet) : DocumentStatusBadge + 3 dialogs (Preview/
        Send/Status) + AwardDocumentsTab + getDocumentsForAward
  - [x] B5 — Hook auto-generate document quand award passe
        APPROVED via workflow Module 5. Migration 00040 +
        UI checkbox Step2 wizard + sandbox toggle.
  - [x] B6 — Closure + récap E2E + merge PR #8 squash
        complete

- [x] PR #9 — Bug fixes E2E (Module 5+6 dette résolue)
  - [x] Bug #34 P0 — propage erreurs transitionAward
  - [x] Bug #35 P0 — migration 00041 trigger ownership-based
  - [x] Bug #36 P1 — formatNumber tests Vitest verrouillent U+00A0
  - [x] Bug #31 P2 — migration 00042 RPC idempotency
  - [x] Bug #44 P1 — supprime apps/web/database.types.ts dead code
  - [x] Bug #45 P2 — @vitejs/plugin-react + revert dynamic import
  - [x] Bonus : scripts/generate-magic-link.mjs pour futurs E2E
  - Mergé sur master via squash (commit `d8bdab1`)

- [x] Module 7 — Notifications Resend (PR #10 ready, queue pattern complet)
  - [x] B1 — DB extends + composite PK (code, channel, locale) +
        seed 6 templates V1 + 6 permissions + RPC
        `lock_pending_notifications` + pg_net install
        (migrations 00043-00048)
  - [x] B2 — 4 templates react-email (ApprovalPending/Approved/
        Rejected, AwardGranted) + EmailLayout shared + helpers
        render/subject + 4 Server Actions queue pattern + sandbox
        preview HTML/text
  - [x] B3 — EF `notifications-consumer` Deno (Resend REST direct) +
        cron 1-min + Vault `service_role_key` setup + sandbox
        extension test send/trigger consumer (migration 00049)
  - [x] B4 — EF `resend-webhook` Deno (svix HMAC +
        EdgeRuntime.waitUntil pattern v6) + classifier helper
        shared (Vitest) + status COMPLAINED ajouté (migration 00050)
  - [x] B5 — 3 hooks Server Action (notifyApproversOfPendingApproval/
        notifyCreatorOfApprovalDecision/renderPendingNotificationsBatch)
        wired dans transitionAward + recordDecisionInternal + page
        admin /dashboard/settings/notifications + sandbox extension
        stats + 8 tests Vitest

- [x] Module 8 — Beneficiary Portal (PR #11 ready, branche
      feat/module-8-portal)
  - [x] B1 — DB + 3 RPCs portal SECURITY DEFINER
        (get_beneficiary_portal_dashboard, get_award_portal_detail,
        simulate_leaver_scenario) + RLS vesting_events idempotent +
        3 permissions BENEFICIARY (migrations 00051-00053)
  - [x] B2 — Onboarding 2 étapes (welcome + profile/setup) + layout
        /portal/\* + 4 composants header/nav/footer/userMenu + Server
        Action completeBeneficiaryProfile + RPC update_beneficiary_self_phone
        encrypt (migration 00054) + 28 tests
  - [x] B3 — Pages liste + détail (synthèse + vesting chart Recharts +
        documents) + Server Action getPortalDocumentSignedUrl
        ownership chain + 5 composants + helper buildVestingTimeline
        avec fallback snapshot + 25 tests
  - [x] B4 — Simulateur de départ (Section 3 page détail) + extend
        RPC pour full_accelerate (migration 00055) + helper labels FR + 25 tests
  - [x] B5 — Pages /portal/documents (liste globale + filter award) +
        /portal/profile (ProfileEditForm read-only identity + editable
        phone/address) + sandbox stats + Server Action
        updateBeneficiaryProfile + 8 tests
  - [x] Bonus — fix(proxy) /portal accessible sans active_org_id
        (commit bec24e0) — débloque les bénéficiaires purs sans
        membership ACTIVE. La layout /portal/\* fait son propre check.

- [x] Module 9 — Exercise Workflow (mergé sur master, PRs #13-#18)
  - B1 DB + 3 RPCs (request_exercise/confirm_payment/cancel) + 10
    migrations 00056-00065 + 1 hotfix RLS 00066
  - B2 Lib pure TS simulation fiscale FR 2026 (BSPCE/SO/BSA/AGA)
  - B3 4 pages portal exercise + 2 Server Actions + 5 composants
  - B4 3 pages dashboard admin (inbox + detail + workflows) + 4 SA
  - B5 Notifications + Documents Exercise (5 templates email + 2 PDF
    - RPC load_exercise_document_context + 5 hooks fire-and-forget)
  - 614 tests workspace post-M9, drift cloud +3

- [x] Module 10 — Cap Table Dynamique (mergé 2026-05-04 sur master,
      commit `0ceda7c`, PR #25)
  - [x] B1 — DB schema (11 migrations 00080-00089 + 00082b namespace
        correction) : 4 tables, 3 RPCs, 1 hook M9→M10, 14 permissions
  - [x] B2 — Server Actions share_classes + funding_rounds (5 SA)
  - [x] B3 — `compute_cap_table` RPC + page principale + ValuationToggle + CapTableMatrix + sidebar nav
  - [x] B4 — Scénarios déterministes (4 SA NEW_ROUND/POOL_TOPUP/
        BULK_EXERCISE/EXIT) + dilution-comparator + cap-table-tabs + cache 24h + share-class-form V5 (page minimale)
  - [x] B5 — DEFERRED V1.5 : endpoint Python
        `/compute/dilution-monte-carlo` absent côté Fly.io
        → page placeholder + memory `module_10_b5_skipped.md`
        (action mainteneur Fly)
  - [x] B6 — Snapshots + portal positions + bulk import (4 SA :
        createManualSnapshot, freezeSnapshot, deleteSnapshot,
        bulkImportPositions) + page `/portal/positions` (admin
        client pattern) + tab Évolution réactivé
  - [x] B6+ — cleanup cron deferred V1.5 (Option β user) +
        UI wording "Snapshots quotidiens automatiques disponibles V1.5" + memory `module_10_b6_cron_skipped.md` (action mainteneur DB)
  - [x] B7 — Compliance V1 (5 rules) + activation
        `AGA_30_PERCENT_CAP` (résolution dette #3) + 25 tests neufs
        (capTableRules.test.ts) + `runCapTableComplianceChecks`
        runner + ctx loader cap table dans `runComplianceChecks`
        Module 3b
  - **Statistiques** : 698 tests workspace (vs 521 pré-M10, +177),
    +12 165 LOC, 11 migrations cloud + 1 deferred V1.5,
    13 Server Actions, 9 pages dashboard + 1 portal, 11 composants,
    5 compliance rules. 15 erratums spec consolidés, 6 dettes V2
    ouvertes (#88-#93), 1 dette résolue (#3).

- [x] Module 11 — IFRS 2 Valuation + Monte Carlo Visualization
      (PR #26 prête à squash-merger 2026-05-04, branche `feat/module-11-valuation-viz`)
  - [x] B0 — Recon moteur Python + payload validation script
  - [x] B1 — quant client + Zod types valuation
  - [x] B2.1 — Refactor split normalizers (rate vs sigma) — **dette #1 RÉSOLUE**
  - [x] B2.2 — `computeIncrementalFairValue` SA + migration 00091 — **dette #11 RÉSOLUE**
  - [x] B3 — 7 composants viewer Monte Carlo + sandbox `/dev/monte-carlo-replay`
  - [x] B4 — Hook `useMonteCarloReplay` + count-up `AnimatedNumber`
  - [x] B5 — Migration 00092 + EF v3 + 3 SAs + 3 pages prod + sidebar nav
  - [x] B6 — Quick fix α (default numPaths 100k→20k) + migration 00093 cron mensuel + 2 compliance rules (`VALUATION_STALE_BLOCKING`, `FMV_DEVIATION_WARNING`) + hook `transitionAward`
  - **Statistiques** : 925 tests workspace (vs 748 pré-M11, +177), 3 migrations
    cloud, 1 EF redeployée, 4 SAs nouvelles, 3 pages prod + 1 sandbox, 8 composants
    UI, 2 hooks custom, 2 compliance rules. 5 erratums spec à patcher post-merge,
    10 dettes V2 ouvertes (#94-#103), 2 dettes V1 résolues (#1 + #11).

- [x] Module 12 — Compliance Engine V2 (configurable par org)
      (PR #28 prête à squash-merger 2026-05-04, branche `feat/module-12-compliance-engine-v2`)
  - [x] B1 — Migration 00094 (2 tables + vue + RPC + perm) + types Zod
  - [x] B2 — `effectiveRules.ts` helper + refactor `runValuationComplianceChecks`
  - [x] B3a — Inventaire exhaustif 23 ComplianceRule registered (correction
        vs B2 qui annonçait 29 — sub-codes alternatifs)
  - [x] B3b — Migration 00094b realign DB ↔ code (DELETE 20 + INSERT 21 → 23) + 4 SAs (updateOverride, listForUI, getAuditLog, resetAll)
  - [x] B4 — Page UI `/dashboard/settings/compliance` + 5 composants Client +
        helpers + sidebar nav
  - [x] B5 — What-if simulator : SA `simulateComplianceChange` + panneau dans
        EditDialog. 4 rules deeply implémentées (VALUATION_STALE_BLOCKING,
        GRANT_DATE_RECENT, HIRE_DATE_REASONABLE, ESOP_PERCENT_BEST_PRACTICE).
        5 deferred V1.5 (AGA/FMV_RECENT/ROUND/FMV_DEVIATION).
  - **Statistiques** : 1030 tests workspace (vs 925 pré-M12, +105), 2 migrations
    cloud, 5 SAs, 1 page prod, 5 composants UI, 1 perm, 4 audit event types,
    23 rules configurables, 4 simulables what-if. 7 dettes V2 ouvertes
    (#110-#116).

### À venir

- [ ] Module 13 — Audit Trail & Reporting

### Design System V1 — Editorial Finance (PR #12 ready-for-review)

**14 étapes livrées** sur la branche `feat/design-system-v1` :

- [x] Étape 1 — Bootstrap kickoff (`90e9a27`)
- [x] Étape 2 — Tokens v1 + 3 fonts (`25ae22c`)
- [x] Étape 3 — Theme provider (`ffa97da`)
- [x] Étape 4 — UI primitives + status-badge + animations (`1b8caed`)
- [x] Étape 5 — Editorial layout & sidebar refactor (`450035d`)
- [x] Étape 6 — KPICard signature (`97c143e`)
- [x] Étape 7 — EmptyState + 8 illustrations (`e61072b`)
- [x] Étape 8 — DataTable editorial typography (`dd79390`)
- [x] Étape 9 — VestingTimeline editorial chart (`eaf2910` / `f4ccdde`)
- [x] Étape 10 — ApprovalRequestTimeline horizontal (`ee28c93`)
- [x] Étape 11 — Editorial chart components (`46eed20`)
- [x] Étape 12 — Dashboard CFO refonte (`f8c1815` → `a0e9ac2`, 5 commits)
- [x] Étape 13 — Plan Detail + Wizard Step 4 (`d67873b` → `02097c1`, 7 commits)
- [x] Étape 14 — Beneficiary Portal + QA polish (`6f9f548` → finalisation, 7 commits)

PR #12 prête pour review. **Rebase à faire avant merge** : PR #11
(Module 8) toujours OPEN sur master, à merger en priorité.

Référence design : `memory/design_system_v1_recon.md` (recon Étape 1

- adaptations détaillées par étape + dette V1 → V2 consolidée).

## Dette technique connue

1. **~~Migration de cohérence DB~~ ✅ RÉSOLUE Module 11 B2.1** (2026-05-04) :
   les normalizers ont été splittés en 2 fonctions contextuelles dans
   `supabase/functions/_shared/buildPythonPayload.ts` :
   `normalizeRateOrDividend` (rate_flat / dividend_yield, % brut → fraction si > 1)
   et `normalizeSigma` (annualized_sigma déjà en fraction, validation bornes
   métier [0.01, 5.0]). L'ancienne fonction `normalizeRateUnit()` est
   `@deprecated` (alias vers `normalizeRateOrDividend`). 19 tests Vitest
   verrouillent les 2 contextes. Pas de migration DB nécessaire — convention
   stockage inchangée, validation à la frontière côté EF.

2. **`runComplianceChecks` V1 livrée Module 3b B7** : 4 rules pure
   functions (BSPCE_BENEFICIARY_TYPE, AGA_30_PERCENT_CAP,
   POOL_AVAILABLE, GRANT_DATE_RECENT) hookées dans `transitionAward`
   à `toStatus=PROPOSED` uniquement. V2 configurable par org en
   Module 12 via une table `compliance_rules_overrides`.

3. **~~AGA_30_PERCENT_CAP~~ ✅ RÉSOLUE Module 10 B7** (2026-05-04) :
   le ctx loader est branché dans `runChecks.ts::runComplianceChecks` —
   pour les plans `plan_type='AGA'`, on appelle `compute_cap_table`
   pour récupérer `companyTotalShares` + agrège
   `agaAllocatedTotal` via `awards.units_outstanding` filtrés par
   `plans.plan_type='AGA'` + statuts pré-cancel. La rule reject
   maintenant les attributions AGA qui pousseraient au-delà du cap
   légal 30 %. Soft warning séparé `AGA_APPROACHING_CAP` ajouté
   pour la zone 27–30 %. Tests Vitest verts (5 cases hard + 4 cases
   soft).

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

11. **~~`incremental_fair_value`~~ ✅ RÉSOLUE Module 11 B2.2 + B5** (2026-05-04) :
    Server Action `computeIncrementalFairValue(input)` orchestre la lecture
    des 2 valuation_runs DONE (pre + post modification) et UPDATE les colonnes
    audit `valuation_pre_modification`, `valuation_post_modification`,
    `incremental_fair_value`, `valuation_computed_at` sur `award_modifications`
    (migration 00091). 12 tests Vitest. La page UI pour suivre les
    valuation_runs est livrée Module 11 B5 :
    `/dashboard/plans/[id]/valuations` + `/dashboard/valuations/runs/[runId]`.

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

15. **(closed PR #10)** Notifications email Module 5 → décision archi
    Module 7 B5 : ne PAS modifier le RPC Module 5 (qui insère IN_APP
    avec variables minimal), mais ADD une notif EMAIL séparée via
    `notifyApproversOfPendingApproval` côté TS Server Action (hook
    fire-and-forget après `start_approval_workflow`). Les notifs IN_APP
    du RPC restent en place pour V2 inbox UI ; `renderPendingNotificationsBatch`
    permet de les rendre rétroactivement si besoin.

16. **Pas de SLA / escalation auto Module 5** : colonnes
    `sla_hours` + `auto_escalate_after_hours` + `escalate_to_user_id`
    dans `approval_workflow_steps` (Module 1 préfiguré) mais non
    exploitées V1. Reportées V2 (Module 12).

17. **2 dummy memberships APPROVER** (Module 5 B1) : conservés
    actifs en cloud sur les users `832762f1` (sasportasdavid+2)
    et `7f56d666` (sasportasdavid+test) pour permettre les tests
    E2E B2-B5. Cleanup possible si plus utiles.

18-30. **Dettes Module 6 B2/B3/B4** : voir
`memory/module_6_b2_complete.md`,
`memory/module_6_b3_complete.md`,
`memory/module_6_b4_complete.md`.
Notable : #29 STATUSES_ALLOWING_GENERATE hard-codé,
#28 pas de "Voir Yousign Dashboard" link.

31-45. **Dettes E2E Module 5+6 (session 2026-04-30) — STATUT POST-PR9** :

- #31 (closed PR #9) double-clic Proposer → migration 00042 idempotency
- #32 notifications PENDING orphelines après cancel — non bloquant
- #33 hook `custom_access_token_hook` doit être enrolled
  manuellement dans Supabase Dashboard — doc only
- #34 (closed PR #9) approveDecision Failed to fetch → propagation
  erreur transitionAward (commit `e71259e` pré-squash, intégré dans `d8bdab1`)
- #35 (closed PR #9) trigger enforce_award_beneficiary_update →
  ownership-based check au lieu de whitelist (migration 00041)
- #36 (closed) `formatNumber` rendait `1/200` (U+202F glyph absent
  Helvetica) → fix `b7ad3e8` (Module 6) + tests Vitest verrouillés PR #9
- #37 (closed) Yousign V3 rejette `expiration_date` ISO avec ms
  → fix `5643e5b` use `YYYY-MM-DD`
- #38 (closed) Yousign V3 rejette `fields[0].page = -1` (>=1 requis)
  → fix `5643e5b` page=1 (mono-page V1)
- #39 (closed) Yousign V3 webhook header `x-yousign-signature-256`
  (pas `-signature`) + event names `signer.done`/`signature_request.done`
  → fix `6a11862`
- #40 form login Capiwise n'envoie pas magic link aux users sans
  row `user_profiles` (silent return) → workaround INSERT user_profiles.
  Dette ouverte : ajouter trigger AFTER INSERT auth.users
- #41 pas de mécanisme replay webhook Yousign si Dashboard
  mal configuré au moment de l'envoi (workaround : Yousign Dashboard
  Replay button OU script CLI à créer)
- #42 (closed) Yousign V3 webhook payload n'inclut pas
  `signature_request.documents[]` → fetch via API (fix EF v5 `3f91eb9`)
- #43 (closed) `signature_request.done` handler timeout côté
  Yousign Dashboard (5 s) → fix EF v6 ack 200 immédiat +
  `EdgeRuntime.waitUntil()` (commit `db00559`)
- #44 (closed PR #9) doublon types Supabase apps/web ↔ shared →
  apps/web copy supprimée (était dead code, jamais importée)
- #45 (closed PR #9) Vitest sans plugin React JSX →
  `@vitejs/plugin-react` installé + revert dynamic import workaround

46-52. **Dettes Module 7 (PR #10)** :

- #46 Hook `award_granted` non câblé V1 (notif bénéficiaire après
  signature Yousign). Deno↔Node import complexe. Alternatives V2 :
  (a) appel HTTP de l'EF yousign-webhook vers une nouvelle EF Module 7,
  (b) trigger DB AFTER UPDATE awards WHEN status='GRANTED' qui INSERT
  notif PENDING. Reporté Module 8 (portail bénéficiaire) où le besoin
  sera plus contextualisé.
- #47 `triggerNotificationConsumer` exposé en Server Action (utile
  sandbox, pas prod). Gate `process.env.ENABLE_DEV_SANDBOX` V2 ou
  déplacer hors Server Action.
- #48 Pas de pagination sur table admin
  `/dashboard/settings/notifications` : limit 100 hardcoded. Pour orgs
  haute volumétrie (1k+ notifs/jour), ajouter pagination keyset par
  created_at V2.
- #49 Pas de bouton "Re-send" sur FAILED côté admin V1 : pas de
  mécanisme de re-queue. L'admin peut INSERT manuel via sandbox. V2 =
  bouton "Re-send" qui clone la notif en PENDING.
- #50 Classifier `classifyResendEvent` dupliqué entre `packages/shared`
  (testé Vitest) et l'EF Deno (standalone, pas d'import workspace côté
  Deno). ~30 lignes maintenance manuelle. Acceptable V1, migrer vers
  lib npm publiée si divergence critique.
- #51 Pas de retry sur webhook background : si UPDATE DB fail dans
  `EdgeRuntime.waitUntil()`, l'event Resend est perdu (on a déjà ack
  200). V2 = retry inline via DB queue + alerting si fail répété.
- #52 `provider_message_id` lookup Resend webhook (OR `resend_email_id`)
  deprecated V2 : quand Module 2 sendEmail sera réécrit pour utiliser
  le pattern queue Module 7, simplifier le OR lookup.

53-80. **Dettes Module 8 (PR #11)** — voir
`memory/module_8_b{2,3,4,5}_complete.md`. Notable :

- #53 phone validation E.164 strict (V1 = regex permissive)
- #54 38 pays hardcoded (V2 = lib `i18n-iso-countries`)
- #57 tax_residence_country self-modifiable V2 via approval workflow
- #62 enrichWithSnapshotVested = N+1 query (V2 RPC dédié si > 50 awards)
- #63 pas de pagination /portal/awards
- #64 performance conditions sans tracking (Module 11)
- #66 pas de countdown TTL signed URL portal docs (5 min hardcoded)
- #71 simulateur sans historique simulations (V2 history view)
- #73 simulator no minDate/maxDate sur date input (V2 garde-fous)
- #76 phone read-back impossible côté ProfileEditForm (V2 RPC déchiffre)
- #78 no "renvoyer document" via portail (V2 email auto signed URL 24h)

81-X. **Dettes Module 10 (PR #25)** — voir `memory/module_10_b{1..7}_complete.md`. Notable :

- **#88 Module 10 B5 V1.5** : endpoint Python `/compute/dilution-monte-carlo`
  absent côté `equity-gem-quant-tonnom.fly.dev` (HTTP 404 confirmé 2026-05-04).
  Skip propre Branche B : page placeholder
  `/dashboard/captable/exit-simulator` + permission
  `captable.scenario.run_montecarlo` seedée + schema Zod
  `runMonteCarloExitSchema` prêt. Réactivation V1.5 ≈ 5h dev frontend
  une fois endpoint Python livré. Spec endpoint à transmettre au
  mainteneur Fly : voir `memory/module_10_b5_skipped.md` §2.
- **#89 Permission `captable.scenario.update` absente du seed 00089** :
  `updateScenario`/`deleteScenario` mappent sur `captable.scenario.create`
  - ownership check explicite (RLS owner-only en doublon). Acceptable
    V1, V2 = ajouter perm dédiée si besoin de dissocier les rôles
    CRUD scenarios.
- **#90 Cron nightly snapshot DEFERRED V1.5** (Module 10 B6) : suite
  arbitrage user, le fichier migration a été supprimé du repo
  (Option β : éviter dette flottante). SQL complet conservé dans
  `memory/module_10_b6_cron_skipped.md` §1 pour réactivation V1.5.
  Mainteneur DB devra recréer la migration côté cloud quand
  l'environnement le permettra. UI V1 mise à jour pour ne pas
  mentir : "Snapshots quotidiens automatiques disponibles V1.5"
  affiché aux endroits concernés. Snapshots manuels + auto
  post-round fonctionnent normalement V1 (RPC `materialize_snapshot`
  appliqué B1).
- **#91 Pas de RPC `freeze_snapshot`** (Module 10 B6) : initialement
  planifiée puis abandonnée — `freezeSnapshot` SA utilise admin
  client (service_role bypass RLS `snapshots_no_update USING(FALSE)`)
  avec ownership check manuel. Sécurité équivalente, déploiement V1
  simplifié. V2 = re-écrire en RPC SECURITY DEFINER si besoin
  d'audit DB level.
- **#92 portal/positions sans % consolidé V1** (Module 10 B6) :
  BENEFICIARY n'a pas la perm `captable.read.all` ni RLS dédiée pour
  grand_total. V1 affiche units, cost basis total/moyen mais pas le %
  du capital. **Design V2 (reco user)** : RPC
  `get_my_position_with_org_total(p_beneficiary_id)` SECURITY DEFINER
  qui retourne **uniquement** un ratio pré-calculé
  `{ my_units: N, my_percent: 0.0123 }` — pas le grand_total brut.
  Respecte la confidentialité (le BENEFICIARY ne voit pas le total
  org) tout en donnant l'info utile. Disclaimer V1 affiché en bas
  de page : "% consolidé disponible en V2".
- **#93 Sidebar dashboard nested nav non supporté** : Module 10 B6
  voulait `Cap Table > Snapshots` sub-item. Pattern actuel
  `NAV_SECTIONS` flat. Boutons exposés dans header de la page cap
  table à la place. V2 = refactor sidebar pour sub-items
  conditionnels.

**Découverte E2E B5** : le proxy `/onboarding/create-org` redirigeait
les bénéficiaires purs (BENEFICIARY uniquement, pas de membership
ACTIVE → JWT sans `active_org_id`). Fix `bec24e0` : ajout `/portal` à
`NO_ORG_ALLOWED_PREFIXES`. Ce bug n'apparaissait pas pour +2/+test
(dummy memberships APPROVER, dette #17). Pour les futurs vrais
bénéficiaires invités, le portail est maintenant accessible directement.

**Dette parallèle découverte** : le `custom_access_token_hook` s'exécute
correctement côté DB (vérifié via test SQL manuel) mais le JWT émis ne
contient pas les claims `active_org_id` quand testé en E2E (Supabase
quirk non investigué). Le fix proxy contourne le problème — pas
bloquant V1, mais à creuser si d'autres claims sont essentiels au
proxy.

94-103. **Dettes Module 11 (PR #26)** — voir
`memory/module_11_complete.md`. Notable :

- **#94 EF compute-valuation timeout** : >50k paths + viz dépassent le
  timeout EF Supabase (~150s). Quick fix α B6 = default numPaths réduit
  à 20 000. Mitigation V1.5 = pattern `EdgeRuntime.waitUntil()` (cf
  Module 6 yousign-webhook v6) ou Supabase Pro tier.
- **#95 + #96 Erratums spec** : MODULE_11 §3.5 EF naming
  `quant-multi-tranche` → `compute-valuation` et §3.3 path
  `apps/web/src/lib/quant/` → `supabase/functions/_shared/`. À patcher
  post-merge.
- **#97 Cron INSERT-only** : `valuation-monthly-refresh` insère des
  QUEUED mais ne consomme pas. V1.5 = trigger automatique via
  pg_net.http_post.
- **#98 Pages sans Realtime** : il faut reload pour voir un run
  RUNNING → DONE. V1.5 = hook `useValuationRunStatus` étendu.
- **#99 MonteCarloViewer fallback inputs** : si `payload_sent` est null
  (run pré-B5), les chips affichent S₀=0. V1.5 = fallback sur
  `hypothesis_sets`.
- **#100 ValuationCheckInput scope unique** : V1 = AWARD_TRANSITION
  seulement. V2 (Module 12) = scopes différenciés (MODIFICATION,
  EXERCISE).
- **#101 Default numPaths trop petit pour plans complexes** : 20k peut
  être insuffisant pour la convergence MC sur multi-tranches + market
  conditions. V1.5 = auto-calibrer selon `simulation_config`.
- **#102 compliance_warnings JSONB libre** : pas de schema strict côté
  DB. V1.5 = Zod parse + table dédiée.
- **#103 Tests E2E manuels** : 6 scénarios documentés dans
  `memory/module_11_e2e_scenarios.md`. Playwright pas en place — pas
  de gate CI (cf dette transverse #7).

110-116. **Dettes Module 12 (PR #28)** — voir
`memory/module_12_complete.md`. Notable :

- **#110 Wiring partiel rules → effective params** : Module 12.5 B1+B2+B3
  livrés 2026-05-04 (branche `feat/module-12-5-wiring-21-rules`, pré-PR).
  18/21 rules wired (86 %).
  - **B1** : 5 award rules wired (helper `_helpers.ts` partagé +
    extension `runComplianceChecks`).
  - **B2** : 6 beneficiary rules wired. HIRE_DATE_REASONABLE évolue V1.X
    (`maxFutureMonths` default 3). Anomalie #114 préservée (sub-rule
    HIRE_DATE_INVALID reste ERROR hardcoded).
  - **B3** : 4 cap_table + 3 document rules wired + **migration 00094c**
    (`toleranceEur` → `tolerancePct` 1 % default, scale linéaire avec
    taille round). FMV_RECENT_ENOUGH évolue V1.X (`12 mois` → `90 jours`,
    severity DB `'error'` au lieu de `'soft'` warning legacy — plus strict).
    ESOP_PERCENT_BEST_PRACTICE cross-validation defensive
    (`minPct >= maxPct` → fallback defaults + warn).
  - **3 rules restantes** (approval) → B4 + closure.
  - Effet actuel : la page UI Module 12 impacte runtime pour `valuation`
    (Module 12 B2) + `award` (B1) + `beneficiary` (B2) + `cap_table` +
    `document` (B3). Seul `approval` reste à wire.
- **#111 Severity drift code/DB** : 4 rules ont severity ajustée en DB
  (TAX_RESIDENCE, WORKFLOW_REQUIRED_FOR_AGA, FMV_RECENT_ENOUGH,
  BSPCE_BENEFICIARY_TYPE_REVERSE). Le checker code n'utilise pas
  encore `effectiveSeverityByRule` — la severity DB est ignorée pour
  ces 21 rules. À cabler V1.5.
- **#112 HIRE_DATE_REASONABLE comportement mixte** : seedée
  `severity_default='warning'` mais émet ERROR si année < 1900. UI
  affiche badge "Comportement mixte" en attendant le split V2 en 2
  rules distinctes.
- **#113 Tests UI sans jsdom** : pas de tests `@testing-library/react`
  pour les Cards/Dialogs. Couverture pure helpers (28 tests B4) +
  SA mocks (26 tests B3b+B5). V1.5 = setup `@vitejs/plugin-react`.
- **#114 Audit log gate sur write perm** :
  `getComplianceRuleAuditLog` requiert
  `compliance_rules.config.write` (OWNER). Si V1.5 demande visibilité
  audit pour ADMIN_HR, splitter en perm dédiée
  `compliance_rules.audit.read`.
- **#115 Simulator V1.5 : 5 rules deferred** :
  AGA_30_PERCENT_CAP, AGA_APPROACHING_CAP, FMV_RECENT_ENOUGH,
  ROUND_AMOUNT_CONSISTENCY, FMV_DEVIATION_WARNING retournent
  `simulationSupported=false` avec reason. Helpers V1.5 estimés à
  ~4-6h dev (pattern existant dans `complianceRules.ts`).
- **#116 Simulator perf** : V1 SELECT \* sur les tables (pas de
  pagination, pas d'échantillonnage). Pour orgs > 5k entités, peut
  être lent. V2 = sample stratifié + count agrégé via SQL aggregation.

## Sécurité

- [x] Rotation clé Resend après leak dans .env.example (date: \_\_\_)
- [ ] Audit RLS exhaustif avant production (toutes les tables
      doivent avoir RLS ENABLED + policies cohérentes)
- [ ] Rate limiting Server Actions (anti-DoS, anti-spam)
- [ ] CSP headers + sécurité CSRF (Next.js le fait nativement
      sur les Server Actions, à confirmer)

## Patterns récurrents (anti-doublons)

> **Webhooks externes** : valider les NOMS DE HEADER et NOMS
> D'EVENTS via un test E2E réel (pas juste la doc). La spec
> peut être obsolète. Cf. Module 6 B3 Yousign V3 :
> `x-yousign-signature` (V2) → `x-yousign-signature-256` (V3),
> `signer_request.signed` (V2) → `signer.done` (V3). Pattern
> de fix : OR-conditions sur les 2 nommages + log diagnostic
> (header_len, listing des x-vendor-\* headers reçus).

> **GENERATED ALWAYS columns dans BEFORE triggers** : leur
> `NEW.value` est NULL (pas la valeur recalculée — Postgres calcule
> seulement APRÈS le BEFORE trigger). Si on les compare à OLD via
> `IS DISTINCT FROM`, le résultat est TOUJOURS TRUE → faux-positif
> qui fait raise le trigger sur des UPDATE qui ne touchent pas le
> champ. À EXCLURE des checks de delta sur les triggers BEFORE.
> Cf. PR #9 Bug #35 (`enforce_award_beneficiary_update`) qui
> enregistrait `units_outstanding`/`total_fair_value` (générés)
> dans sa blacklist → empêchait les bénéficiaires de set
> `accepted_at` malgré la logique correcte. Solution : retirer
> les colonnes générées de la liste, ce sont de toute façon des
> calculs côté DB non user-modifiables.

> **Webhooks externes — temps de réponse** : la plupart des
> providers (Stripe, Yousign, etc.) timeout à 5-10 s. Si le
> handler doit faire du I/O lourd (download, upload, RPCs en
> chaîne), pattern obligatoire : ack 200 immédiat + processing
> en background via `EdgeRuntime.waitUntil(promise)` (Supabase
> Deno EF). Sinon le provider retry ce qui produit des doublons
> côté Storage et des "400 timeout" côté Dashboard. Cf. EF
> `yousign-webhook` v6 (handler `signature_request.done`).
> Garder un pré-check d'idempotence (status COMPLETED → ack
> sous 100 ms) pour les retries quand même reçus.

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

2026-04-30 — Milestone :

Module 6 mergé sur master (commit 9310819).
Pipeline E2E complet validé via UI :
DRAFT → PROPOSED → PENDING_APPROVAL → APPROVED → PDF GENERATED
→ SENT_FOR_SIGNATURE → SIGNED (via Yousign V3 webhook) → GRANTED.

PR #9 (en cours) :

- P0 (Bug #34 + #35) ✅ validé E2E via UI
- P1/P2 en cours
- Merge ETA : J+1

#85 (Module 2/8) Investigation custom_access_token_hook +
active_org_id robustesse — bénéficiaires purs peuvent être routés
vers /dashboard si JWT mal initialisé. Fix manuel SQL possible.
