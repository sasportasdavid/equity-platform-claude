-- ============================================================
-- Module 9 B3 hotfix — RLS plans/companies pour beneficiaries
-- ============================================================
--
-- Bug E2E observé sur PR #15 (Module 9 B3) :
--   - Bénéficiaire pur (BENEFICIARY uniquement, sans membership ACTIVE)
--     navigue sur /portal/awards/[id]/exercise/new
--   - Form affiche "FMV courante 0,00 €" alors que la company a
--     last_known_fmv_per_share = 25.00 en DB
--   - Au submit Server Action, retourne "Plan introuvable"
--
-- Root cause :
--   Les policies RLS existantes plans_select / companies_select
--   exigent (org_id = current_org_id() AND has_permission('plans.read'
--   OR 'beneficiaries.read')). Un bénéficiaire pur n'a ni
--   current_org_id() (pas de membership ACTIVE) ni ces permissions
--   admin → 0 rows visibles.
--
--   Code TS apps/web/src/server/actions/exercises.ts ligne 64-95 :
--   queries directes sur plans + companies via le client cookie-based
--   (avec session du bénéficiaire) → null à chaque .maybeSingle().
--
-- Solution :
--   Ajouter 2 nouvelles policies SELECT sur plans + companies qui
--   autorisent un user à voir UNIQUEMENT les plans/companies liés à
--   SES PROPRES awards (chaîne ownership : auth.uid() = beneficiary.user_id
--   → award.beneficiary_id → award.plan_id → plan.company_id).
--
-- Pas de modification des policies existantes : PostgreSQL combine
-- les multiples SELECT policies par OR (ADD-only).

-- Policy 1: SELECT plans pour beneficiary qui a un award lié
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

-- Policy 2: SELECT companies pour beneficiary via plan via award
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

COMMENT ON POLICY plans_select_beneficiary_via_awards ON plans IS
  'Module 9 B3 hotfix: beneficiary peut SELECT le plan de ses propres awards';
COMMENT ON POLICY companies_select_beneficiary_via_plans ON companies IS
  'Module 9 B3 hotfix: beneficiary peut SELECT la company via plan via award';
