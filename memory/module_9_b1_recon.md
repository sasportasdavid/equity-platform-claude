# Module 9 B1 — recon DB pré-migration (a→i)

Recon obligatoire avant les 7 migrations + 3 RPCs Module 9, pour
détecter les écarts spec vs DB existante (Module 1-8).

## Méthode

Pour chaque check (a→i), execute_sql Supabase mcp puis comparer
au texte spec `docs/MODULE_09_EXERCISE_WORKFLOW.md` §2.3-2.9 + §3.

## Résultats

### a — Table `exercise_requests` Module 1 préfigurée

Table existe avec ~10 cols base (org_id, award_id, beneficiary_id,
units_to_exercise, exercise_price_per_unit, status, requested_at,
total_exercise_amount [GENERATED], request_number, created_at,
updated_at, deleted_at). **Manque** : 11 cols à ajouter (B1 ALTER).

### b — Table `companies` FMV cols

Table existe sans cols FMV. **Tous absents** (last_known_fmv_per_share,
fmv_as_of_date, fmv_source, fmv_notes, fmv_updated_at, fmv_updated_by).

- `bspce_first_grant_date` absent. À ajouter en B1 (00058).

### c — Table `companies` field `founded_*`

La col existante s'appelle **`founded_date`** (pas `founded_at` comme
spec). On ne crée PAS d'alias — on continue avec `founded_date`. Note
recon → adaptations Module 9.

### d — `approval_workflow_steps` cols `amount_threshold_*`

**Absentes**. À ajouter en B1 (00059) : `amount_threshold_min` +
`amount_threshold_max` NUMERIC NULL.

### e — `permissions_catalog` schema

La table a `category` (NOT NULL UPPERCASE). Spec mentionnait juste
`code, description`. Adapter le seed 00060 pour inclure category
'EXERCISES' / 'EXERCISE_WORKFLOWS' / 'COMPANIES'.

### f — Roles disponibles dans `role_permissions`

Vérifier que BENEFICIARY/OWNER/ADMIN_HR/AUDITOR/APPROVER existent.
Tous OK. **`BOARD_MEMBER` absent** → adaptation 00061 : Step 3 utilise
OWNER avec `step_name = 'Validation Direction (Board)'` + TODO V2.

### g — `compliance_rules_catalog` schema

La table n'a PAS `applies_to` ni `enforcement` (spec v1). Cols réelles :
`code, name, jurisdiction, applies_to_plan_types[], category,
default_enforcement, legal_reference, is_active`. Adapter 00062 :

- jurisdiction = 'FR'
- applies_to_plan_types = ARRAY['BSPCE','STOCK_OPTION','BSA']
- category = ELIGIBILITY/PROCEDURE/QUANTITY/TIMING (existing values)
- default_enforcement = 'hard' | 'soft'

### h — `vesting_events` non remplis (Module 1)

Vesting events VIDE pour tous les awards GRANTED V1 (cf. recon Module
8 B1). + awards.units_vested = 0 sur AWD-2026-0007 (1200 BSPCE) malgré
4 tranches snapshot dont 1 past_count=1. **CRITICAL** : RPC
`request_exercise` doit avoir un fallback snapshot pour calculer
units_available, sinon impossible de tester E2E.

Pattern fallback (00063) :

1. Source 1 : SUM vesting_events.units_vested WHERE status=VESTED AND
   scheduled_date<=TODAY
2. Source 2 : awards.units_vested si > 0
3. Source 3 : SUM des tranches snapshot où vesting_date <= TODAY
   (V1 dominant)

### i — `total_exercise_amount` GENERATED ALWAYS

**Découvert pendant le test, non en recon initial** : la colonne est
`GENERATED ALWAYS AS (units_to_exercise * exercise_price_per_unit)
STORED`. Donc l'INSERT côté RPC ne doit PAS l'écrire. Adaptation
post-test : 00063 mis à jour, fix appliqué cloud-only en
`module_9_rpc_request_exercise_fix_generated`.

## 0 écart bloquant

Toutes les adaptations ci-dessus sont mineures et documentées. Pas de
table à créer (Module 1 a tout préfiguré), pas de FK à recâbler.

## Décisions stratégiques pré-B1

1. **Bank fields organizations en B1** : ajouter `bank_iban`, `bank_bic`,
   `bank_name` dès 00058 plutôt qu'en B5 — évite une migration
   supplémentaire en sub-module.

2. **Cumulative paliers** : seed initial avec ranges exclusifs (0-50K,
   50K-250K, 250K+) → corrigé en cumulative (max NULL partout)
   pour matcher le texte spec "1/2/3 steps".

3. **Skip permissions admin sub-OWNER** : pas de seed pour ADMIN_FINANCE
   ou autres sous-rôles — V1 utilise OWNER pour tous les flux admin.
   Module 12 si besoin de granularité.

4. **Test data dans cloud test org** : org `9b72d914-...` (Capiwise
   test) a 1 OWNER + 2 APPROVER + 1 BENEFICIARY. **Aucun ADMIN_HR**
   → premier test happy path n'insère pas de decisions (workflow Step 1
   ADMIN_HR sans approbateur). Validation structurelle seulement, E2E
   complet déféré à B5 quand admin pourra assigner ADMIN_HR via UI.
