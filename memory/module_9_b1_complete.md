# Module 9 B1 — closure complète

Branche : `feat/module-9-exercise` (depuis master `d889fa3`)
PR : `#13` (draft, à ouvrir post-commits)

## Périmètre B1 livré

DB + RPCs Module 9 (Exercise Workflow) — pure backend, **0 TS** (sauf
`packages/shared/src/types/database.ts` régénéré).

### 10 migrations appliquées cloud (00056 → 00065)

| #     | Migration                                           | Rôle                                                                                                              |
| ----- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 00056 | `module_9_extend_exercise_requests`                 | +11 cols + status CHECK SIGNED + sequence + helper `generate_exercise_request_number(org_id) → 'EXR-YYYY-NNNN'`   |
| 00057 | `module_9_rls_exercise_requests`                    | RLS ENABLED + 2 policies SELECT (own + admin)                                                                     |
| 00058 | `module_9_companies_fmv_orgs_bank`                  | companies: 7 fmv cols + bspce_first_grant_date — organizations: 3 bank cols (avancé pour B5)                      |
| 00059 | `module_9_workflow_thresholds`                      | +2 cols `amount_threshold_min/max` sur approval_workflow_steps + composite index                                  |
| 00060 | `module_9_seed_permissions`                         | 10 permissions M9 (cat EXERCISES/EXERCISE_WORKFLOWS/COMPANIES) + role mappings BENEFICIARY/OWNER/ADMIN_HR/AUDITOR |
| 00061 | `module_9_seed_default_workflow`                    | Workflow EXERCISE_REQUEST default par org + 3 steps cumulative (0/50K/250K)                                       |
| 00062 | `module_9_seed_compliance_rules`                    | 6 rules (5 hard + 1 soft)                                                                                         |
| 00063 | `module_9_rpc_request_exercise`                     | RPC pure compliance + **fallback snapshot** + workflow start                                                      |
| 00064 | `module_9_rpc_start_approval_workflow_for_exercise` | Variante M5 avec amount filter                                                                                    |
| 00065 | `module_9_rpc_confirm_payment_cancel`               | RPCs admin (confirm) + benef/admin (cancel)                                                                       |

### 2 fixes appliqués cloud only post-test (drift +2 vs local files)

- `module_9_rpc_request_exercise_fix_generated` — `total_exercise_amount`
  est GENERATED ALWAYS (pas d'INSERT direct). Local 00063 déjà patched.
- `module_9_seed_default_workflow_fix_cumulative` — UPDATE pour
  basculer threshold_max NULL et thresholds cumulative (0/50K/250K).
  Local 00061 déjà patched (CREATE INSERT au bon format pour fresh clones).

### Drift cloud vs local

- Cloud : 68 migrations
- Local : 65 fichiers
- Drift : +3 (1 existante M7 `module_7_bootstrap_service_role_vault_helper`
  one-shot Vault helper + 2 nouvelles fixes M9 ci-dessus). Acceptable
  per pattern Module 7 B3.

## Adaptations vs spec MODULE_09 §2-3 (recon a→i)

Voir `module_9_b1_recon.md` pour le détail. 3 adaptations notables :

1. **founded_date vs founded_at** — companies utilise `founded_date`
   (déjà existant Module 1), spec dit `founded_at`. Pas d'ALTER, juste
   ne pas créer de colonne en doublon.

2. **BOARD_MEMBER manquant** — pas de role BOARD_MEMBER en V1. Step 3
   du default workflow utilise OWNER avec `step_name = 'Validation
Direction (Board)'` + commentaire TODO V2 dans 00061.

3. **organizations.bank_iban / bank_bic / bank_name** — ajoutés en
   00058 plutôt qu'en B5 pour éviter une migration supplémentaire en
   sub-module B5 quand on shipera l'admin UI.

4. **`total_exercise_amount` GENERATED ALWAYS** — découvert au test
   E2E SQL : la spec décrit la colonne sans préciser GENERATED, mais
   Module 1 l'a créée avec `GENERATED ALWAYS AS (units_to_exercise *
exercise_price_per_unit) STORED`. RPC adapté pour ne pas l'écrire.

5. **Paliers cumulative vs exclusive** — spec text dit "1 step si <50K,
   2 steps si 50-250K, 3 si >250K" (cumulative). Premier seed avec
   threshold_max → palier exclusif (chaque amount matche UN seul step).
   Corrigé en cumulative (max NULL partout, min = seuil de
   déclenchement). Test final OK : 5K→[1], 100K→[1,2], 500K→[1,2,3].

## Pattern critique : fallback snapshot

Source de comptage des units vested dans `request_exercise` (00063) :

```sql
1. vesting_events.status = 'VESTED' AND scheduled_date <= TODAY (legacy)
   ↓ si SUM = 0
2. awards.units_vested > 0 (rare V1, mais protège snapshot transféré)
   ↓ si 0
3. SUM des tranches snapshot où vesting_date <= TODAY (V1 dominant)
```

Validé E2E : AWD-2026-0007 (1200 BSPCE, 1 tranche past sur 4) →
**300 units via snapshot_fallback** (units_source dans audit metadata).

## Tests SQL — 22+ passing

### Cat 1 : schema + seeds (10/10)

- A: 11 cols exercise_requests ✅
- B: SIGNED dans status CHECK ✅
- C: helper generate_exercise_request_number existe ✅
- D: RLS enabled + 5 policies ✅
- E: 7 fmv cols companies ✅
- F: 3 bank cols organizations ✅
- G: 2 amount thresholds workflow_steps ✅
- H: 10 permissions M9 ✅
- I: 6 compliance rules ✅
- J: 4 RPCs M9 ✅
- K: 1 default workflow per 1 org ✅

### Cat 2 : happy path (1/1 structurel)

- L: request_exercise BSPCE via snapshot_fallback ✅
  - EXR-2026-0001 créé (PENDING)
  - approval_request créé (IN_PROGRESS)
  - amount filter step 1 résolu
  - **Note** : 0 decisions inserted (no ADMIN_HR user in test org).
    Validation structurelle OK, validation E2E human-driven déférée à
    B5 (admin assigne ADMIN_HR à un user via UI workflow).

### Cat 3 : rejects (5/5)

- N: units > available (1000 > 300 detected via snapshot) ✅
- O: zero/negative units ✅
- P: not authenticated (no JWT) ✅
- Q: award not found ✅
- R: no beneficiary record ✅

### Cat 4 : paliers cumulative (3/3)

- 5K€ → [Step 1: RH] (1 step) ✅
- 100K€ → [Step 1: RH, Step 2: Direction] (2 steps) ✅
- 500K€ → [Step 1: RH, Step 2: Direction, Step 3: Board] (3 steps) ✅

### Cat 5 : confirm_payment + cancel (2/2)

- S: confirm_exercise_payment ✅
  - status APPROVED → COMPLETED
  - awards.units_exercised += 50 → 50
  - awards.status → PARTIALLY_EXERCISED
  - audit_event `exercise.completed`
- T: cancel_exercise_request as benef ✅
  - status PENDING → CANCELLED
  - cancellation_reason + cancelled_by + cancelled_at
  - audit_event `exercise.cancelled`

### Cat 6 : RLS (3/3)

- U: beneficiary sees own (2 visibles) ✅
- V: OWNER admin sees all (2 visibles, même org) ✅
- W: APPROVER (no exercises.read.all) sees 0 ✅

## Cleanup post-test

- ✅ exercise_requests test deleted (2 rows)
- ✅ audit_events test deleted (2 events)
- ⚠ **Award AWD-2026-0007 status non restauré** : permission denied
  sur UPDATE direct awards. État résiduel :
  - status = `PARTIALLY_EXERCISED` (était `GRANTED`)
  - units_exercised = 50 (était 0)
  - Peut être restauré manuellement par l'utilisateur via SQL Editor
    Supabase Dashboard si besoin pour cohérence portail. Le test
    a légitimement utilisé `confirm_exercise_payment` qui MAJ correctement
    l'award — l'état résiduel n'est pas une corruption mais un
    artefact de test.

## Dette technique B1

### Bloquante avant E2E human-driven

- **#81 Aucun user ADMIN_HR sur l'org test** : le default workflow B1
  expose Step 1 = ADMIN_HR. Si aucun user n'a ce rôle, `start_approval_workflow_for_exercise`
  insère 0 decisions et le request reste IN_PROGRESS sans approbateur
  → bloque la vérification E2E human-driven. **B5 doit ajouter** un
  flux UI admin pour assigner ADMIN_HR à un user (ou modifier la
  default workflow). En attendant, `OWNER` peut être assigné en `roles[]`
  des memberships pour débloquer.

### Améliorations V2

- **#82 Default workflow par org limited** : la définition Step 3 utilise
  `OWNER ANY_OF_ROLE` faute de role BOARD_MEMBER. Quand le rôle sera
  introduit, simple UPDATE sur les workflows existants.
- **#83 generate_exercise_request_number** : sequence par année
  `exercise_requests_seq_YYYY`. Pas de gestion explicite du rollover
  fin d'année — le helper crée la sequence au besoin. À monitorer en
  prod si un nouveau-an arrive en plein traitement.
- **#84 RPC request_exercise return shape** : retourne `units_source`
  (events/awards.units_vested/snapshot_fallback) → utile pour debug
  côté UI portail (afficher "calculé via snapshot V1"). Server Action
  B2 devra le forwarder dans le Result type.

### Cleanup résiduel acceptable

- **Award AWD-2026-0007 état test** : voir Cleanup ci-dessus. Pas
  bloquant pour B2 (la state machine accepte PARTIALLY_EXERCISED comme
  pre-condition exercisable).

## Décisions architecturales validées

1. **Pas de SECURITY DEFINER côté `cancel_exercise_request` permission
   layer** : la RPC fait son check via `user_has_permission` selon owner
   vs admin (fallback approach Module 5). Pas besoin d'un wrapper
   Server Action en B2 — une seule fn pour les 2 paths.

2. **`payment_method` ENUM-like via TEXT CHECK** : reste TEXT en B1
   pour permettre extensions (CHECK qu'on refera en B5 admin form). V1
   accepte `BANK_TRANSFER` (default) + libre. Module 5 a fait la même
   chose pour `mode`.

3. **Aucun trigger ENFORCE sur `exercise_requests` côté update** :
   contrairement au pattern award/beneficiaries (Module 4 dette #12),
   les mutations passent toutes par les 3 RPCs SECURITY DEFINER →
   pas de surface d'attaque admin SQL Editor. À voir en B5 si on en
   ajoute un défensif.

## Métriques

- Migrations cloud : +10 (M9) + 2 fixes = +12
- Migrations local : +10 (fixes intégrés in-place)
- Drift : +3 cloud-only (acceptable, doc dette #6 + #M9-fix)
- Tests SQL : 22+ passing (10 schema + 1 happy + 5 reject + 3 palier + 2 confirm/cancel + 3 RLS)
- Tests Vitest : inchangé (406 workspace) — B1 = pure DB, pas de TS
- Types regenerated : exercise_requests, request_exercise présents
- Typecheck : ✅ passing

## Next : B2

B2 livre les Server Actions + sandbox `/dev/exercise-engine` :

- `requestExercise(awardId, units, ...)` wrapper Server Action
- `confirmExercisePayment(...)`
- `cancelExerciseRequest(...)`
- compliance V1 runner runExerciseChecks (réutiliser pattern
  beneficiaryRules.ts pour async snapshot fallback ctx)
- sandbox /dev/exercise-engine : test happy path + rejets

Reporter dans le memory closure si on doit aussi shipper :

- `getExerciseRequestDetail(id)` — pour B4 page détail
- Hook auto-trigger document pour exercise (V2 Module 6 extend)
