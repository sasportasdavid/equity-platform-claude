-- ============================================================
-- Module 9 B1 — RLS exercise_requests
-- ============================================================
--
-- Active RLS + crée 2 policies SELECT :
--   - exercise_requests_select_own : bénéficiaire voit ses propres demandes
--     (via join beneficiaries.user_id = auth.uid())
--   - exercise_requests_select_admin : OWNER/ADMIN_HR/AUDITOR voient tout
--     l'org (via permission `exercises.read.all`)
--
-- INSERT/UPDATE/DELETE : pas de policy directe → uniquement via RPCs
-- SECURITY DEFINER (request_exercise, confirm_exercise_payment,
-- cancel_exercise_request). Verrouillage défensif standard du repo.

ALTER TABLE exercise_requests ENABLE ROW LEVEL SECURITY;

-- Bénéficiaire voit ses propres demandes
DROP POLICY IF EXISTS exercise_requests_select_own ON exercise_requests;
CREATE POLICY exercise_requests_select_own ON exercise_requests FOR SELECT
  USING (
    beneficiary_id IN (
      SELECT id FROM beneficiaries
       WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Admin voit tout l'org (via permission)
DROP POLICY IF EXISTS exercise_requests_select_admin ON exercise_requests;
CREATE POLICY exercise_requests_select_admin ON exercise_requests FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_has_permission('exercises.read.all')
    AND deleted_at IS NULL
  );

-- Note : pas de policy INSERT/UPDATE/DELETE — les RPCs SECURITY DEFINER
-- (Module 9 RPCs) bypassent les RLS pour les écritures contrôlées.
