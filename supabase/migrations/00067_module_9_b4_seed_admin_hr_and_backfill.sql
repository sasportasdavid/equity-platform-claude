-- ============================================================
-- Module 9 B4 — Seed ADMIN_HR + back-fill decisions
-- ============================================================
--
-- Résout la dette #81 (Module 9 B1) :
--   "Aucun user ADMIN_HR sur l'org test → Step 1 du workflow
--    EXERCISE_REQUEST n'a pas d'approbateur → 0 decision insérée
--    → request reste IN_PROGRESS sans personne pour la traiter"
--
-- 2 actions ADD-only, scope strict :
--
-- 1. Ajouter le rôle ADMIN_HR au membership existant de
--    sasportasdavid+test@gmail.com (user 7f56d666) sur l'org test
--    (9b72d914). Le user a déjà APPROVER, on append ADMIN_HR.
--
-- 2. Back-fill la décision PENDING pour la request EXR-2026-0002
--    (créée pendant le test E2E B3 sans approbateur). Permet à
--    l'admin de la traiter via /dashboard/exercises/[id] en B4.
--
-- Idempotent : utilise des conditions WHERE pour ne rien dupliquer
-- si la migration est appliquée plusieurs fois (CI re-run safe).

-- 1. Ajouter ADMIN_HR au user 7f56d666 sur l'org test (idempotent)
UPDATE memberships
   SET roles = ARRAY(
     SELECT DISTINCT unnest(roles || ARRAY['ADMIN_HR'])
   )
 WHERE org_id = '9b72d914-1e9a-46c3-8388-4e3496ee3a6c'
   AND user_id = '7f56d666-bb01-44b1-99b2-498c2997458f'
   AND status = 'ACTIVE'
   AND NOT ('ADMIN_HR' = ANY(roles));

-- 2. Back-fill approval_decisions pour les exercise_requests
--    PENDING qui ont un approval_request_id mais 0 decision
--    (cas EXR-2026-0002 + futurs si dette #81 ré-apparait)
INSERT INTO approval_decisions (
  request_id, step_id, step_order, approver_user_id, approver_role,
  status, org_id
)
SELECT
  ar.id AS request_id,
  s.id AS step_id,
  s.step_order,
  m.user_id AS approver_user_id,
  s.approver_role,
  'PENDING' AS status,
  ar.org_id
FROM approval_requests ar
JOIN approval_workflow_steps s
  ON s.workflow_id = ar.workflow_id
 AND s.step_order = ar.current_step_order
JOIN memberships m
  ON m.org_id = ar.org_id
 AND m.status = 'ACTIVE'
 AND s.approver_role = ANY(m.roles)
WHERE ar.subject_type = 'EXERCISE_REQUEST'
  AND ar.status = 'IN_PROGRESS'
  AND s.approver_type IN ('ROLE', 'ANY_OF_ROLE', 'ALL_OF_ROLE')
  AND s.approver_role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM approval_decisions ad
     WHERE ad.request_id = ar.id
       AND ad.step_id = s.id
       AND ad.approver_user_id = m.user_id
  );

COMMENT ON COLUMN memberships.roles IS
  'Module 9 B4 hotfix #81 : ADMIN_HR ajouté à sasportasdavid+test pour débloquer le workflow EXERCISE_REQUEST Step 1.';
