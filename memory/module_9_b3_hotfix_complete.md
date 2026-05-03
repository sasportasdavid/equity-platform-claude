# Module 9 B3 hotfix — RLS plans/companies pour beneficiaries

Branche : `feat/module-9-b3-hotfix-rls` (depuis master `f733651` post-PR #15 mergée)
Migration cloud : `00066_module_9_b3_hotfix_rls_plans_companies_for_beneficiaries`

## Contexte

PR #15 (Module 9 B3) a livré le portail exercise. En test E2E avec un
bénéficiaire pur (BENEFICIARY uniquement, sans membership ACTIVE), le
form `/portal/awards/[id]/exercise/new` affichait :

- "FMV courante 0,00 €" alors que `companies.last_known_fmv_per_share = 25.00` en DB
- Au submit : "Plan introuvable" → impossible de créer une demande

## Diagnostic

Code Server Action `apps/web/src/server/actions/exercises.ts` ligne 64-95 :

```ts
const { data: plan } = await supabase
  .from('plans')
  .select('id, plan_type, company_id')
  .eq('id', award.plan_id)
  .maybeSingle();
// → plan = null pour bénéficiaire pur (RLS)

const { data: company } = await supabase
  .from('companies')
  .select('last_known_fmv_per_share')
  .eq('id', plan.company_id)
  .maybeSingle();
// → company = null pour bénéficiaire pur (RLS)
```

Policies RLS existantes (cloud) :

- `plans_select` : `(org_id = current_org_id() AND has_permission('plans.read'))`
- `companies_select` : `(org_id = current_org_id() AND has_permission('beneficiaries.read'))`

Un bénéficiaire pur n'a :

- ni `current_org_id()` (pas de membership ACTIVE → JWT sans `app_metadata.active_org_id`)
- ni les permissions admin `plans.read` / `beneficiaries.read` (rôle BENEFICIARY uniquement)

→ 0 row visible. Le code TS est correct, c'est la couche RLS qui bloque.

## Solution

ADD-only : 2 nouvelles policies SELECT qui autorisent un user à voir
**uniquement** les plans/companies liés à **ses propres awards** (chaîne
ownership : `auth.uid()` = `beneficiary.user_id` → `award.beneficiary_id` →
`award.plan_id` → `plan.company_id`).

PostgreSQL combine les multiples SELECT policies par OR → les policies
admin existantes restent fonctionnelles, et les bénéficiaires gagnent
l'accès narrow scope nécessaire.

### Migration 00066

```sql
CREATE POLICY plans_select_beneficiary_via_awards
  ON plans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM awards a
      JOIN beneficiaries b ON b.id = a.beneficiary_id
      WHERE a.plan_id = plans.id
        AND b.user_id = auth.uid()
        AND a.deleted_at IS NULL
        AND b.deleted_at IS NULL
    )
  );

CREATE POLICY companies_select_beneficiary_via_plans
  ON companies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plans p
      JOIN awards a ON a.plan_id = p.id
      JOIN beneficiaries b ON b.id = a.beneficiary_id
      WHERE p.company_id = companies.id
        AND b.user_id = auth.uid()
        AND a.deleted_at IS NULL
        AND b.deleted_at IS NULL
    )
  );
```

## Validation

### Avant migration (smoke test mental)

- BENEFICIARY pur : `SELECT * FROM plans` → 0 rows
- BENEFICIARY pur : `SELECT * FROM companies` → 0 rows

### Après migration (smoke test SQL exécuté avec mcp)

JWT impersonation user `f6c291a1` (sasportasdavid+attri, bénéficiaire pur, 9 awards) :

| test               | count avant | count après |
| ------------------ | ----------- | ----------- |
| plans visible      | 0           | **2** ✅    |
| companies visible  | 0           | **2** ✅    |
| companies with FMV | 0           | **2** ✅    |

Visibilité limitée aux 2 plans/companies liés à ses awards (pas leak
sur les autres orgs).

### Verification policies count cloud

```
companies : 5 policies (4 existantes + companies_select_beneficiary_via_plans)
plans     : 5 policies (4 existantes + plans_select_beneficiary_via_awards)
```

## Test E2E human-driven (à faire par l'utilisateur)

1. Login `sasportasdavid+attri@gmail.com` (navigation privée pour
   éviter mix de sessions)
2. `/portal/awards/AWD-2026-0002/exercise/new`
3. Vérifier "FMV courante 25,00 €" (était 0,00 €)
4. Saisir 50 unités, soumettre la demande
5. Vérifier création row `exercise_requests` + redirect
   `/portal/exercises/[id]`
6. Sur la page détail, vérifier le snapshot fiscal rendu correctement

## Sécurité

Les policies sont **strictement ownership-based** :

- `b.user_id = auth.uid()` : seul le bénéficiaire propriétaire voit
- `a.deleted_at IS NULL` : awards soft-deleted invisibles
- `b.deleted_at IS NULL` : bénéficiaires soft-deleted invisibles
- Pas de leak vers d'autres orgs ou d'autres bénéficiaires
- Visible côté SELECT seulement (pas INSERT/UPDATE/DELETE)

Si un bénéficiaire est soft-deleted (`beneficiaries.deleted_at` set),
ses awards ne sont plus accessibles → cohérent avec Module 4 RLS.

## Aucune dette nouvelle

- Pas de modification des policies existantes
- Pas de changement code TS (le code Server Action est correct)
- Pas de changement de spec Module 9 B3
- Pas de migration de données

## Drift cloud vs local

- Cloud : 69 migrations (68 + cette hotfix)
- Local : 66 fichiers (65 + 00066 hotfix)
- Drift : +3 (existant — voir `module_9_b1_complete.md` dette)

## Métriques

- Migrations : +1 (00066)
- Lignes SQL : ~70 (incluant commentaires)
- Tests SQL : 1 smoke test mcp validé (3 assertions)
- Lignes TS modifiées : 0
- Tests Vitest : inchangés (543 passing)
- Typecheck : inchangé (pas de modif TS)

## Pattern à retenir (RLS multi-actor)

Quand un module ajoute un nouvel acteur côté UI (ex: bénéficiaire dans
le portail Module 8/9), penser à vérifier les RLS sur **toutes les
tables que ses queries traversent**, pas juste la table principale.

Module 8 B1 avait correctement géré awards/vesting_events via les RPCs
SECURITY DEFINER. Module 9 B3 a fait des queries directes via le client
cookie-based → RLS strict s'applique. Les tables impactées (plans,
companies) n'avaient pas de policy compatible bénéficiaire.

V2 : créer une checklist de recon RLS pour les nouveaux acteurs
(beneficiary, approver, auditor) avant de shipper un module.
