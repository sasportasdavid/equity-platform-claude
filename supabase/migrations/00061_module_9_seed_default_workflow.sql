-- ============================================================
-- Module 9 B1 — Seed default workflow EXERCISE_REQUEST par org
-- ============================================================
--
-- Pour chaque organisation existante, créer un workflow EXERCISE_REQUEST
-- par défaut avec 3 paliers €.
--
-- ⚠ Adaptation B1 (recon f) : le rôle BOARD_MEMBER n'existe pas en V1.
-- Step 3 utilise OWNER avec un step_name explicite "Validation Direction
-- (Board)" + commentaire TODO V2. Quand le rôle BOARD_MEMBER sera
-- introduit, il suffira de :
--   UPDATE approval_workflow_steps SET approver_role = 'BOARD_MEMBER',
--          approver_type = 'ANY_OF_ROLE'
--    WHERE step_order = 3
--      AND workflow_id IN (
--        SELECT id FROM approval_workflows
--         WHERE applies_to = 'EXERCISE_REQUEST' AND is_default = true
--      );

-- 1. Créer le workflow par org (si pas déjà existant)
INSERT INTO approval_workflows (
  org_id, name, description, applies_to, is_active, is_default
)
SELECT
  o.id,
  'Workflow exercice par défaut',
  'Workflow auto-généré : 1 step si <50K€, 2 steps si 50-250K€, 3 steps si >250K€',
  'EXERCISE_REQUEST',
  true,
  true
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows aw
   WHERE aw.org_id = o.id
     AND aw.applies_to = 'EXERCISE_REQUEST'
     AND aw.is_default = true
);

-- 2. Créer les 3 steps par workflow EXERCISE_REQUEST default
--    Pattern CUMULATIF (spec : "1 step si <50K, 2 steps si 50-250K, 3 si >250K"):
--    Step 1 : ADMIN_HR (toujours déclenché, min=0)
--    Step 2 : OWNER   (déclenché à partir de 50K€, min=50000)
--    Step 3 : OWNER ANY_OF_ROLE Board (déclenché à partir de 250K€, min=250000)
--    max=NULL partout = pas de borne supérieure (palier déclenché → reste actif).
INSERT INTO approval_workflow_steps (
  workflow_id,
  step_order,
  step_name,
  approver_type,
  approver_role,
  mode,
  required_approvals,
  amount_threshold_min,
  amount_threshold_max
)
SELECT
  wf.id,
  v.step_order,
  v.step_name,
  v.approver_type,
  v.approver_role,
  'SEQUENTIAL',
  1,
  v.threshold_min,
  v.threshold_max
FROM approval_workflows wf
CROSS JOIN LATERAL (VALUES
  -- Step 1 : Approbation RH (toujours)
  (1, 'Approbation RH',                'ROLE',        'ADMIN_HR', 0::NUMERIC,      NULL::NUMERIC),
  -- Step 2 : Validation Direction (à partir 50K€)
  (2, 'Validation Direction',          'ROLE',        'OWNER',    50000::NUMERIC,  NULL::NUMERIC),
  -- Step 3 : Validation Direction (Board) — TODO V2 : créer rôle BOARD_MEMBER
  -- En V1, on utilise OWNER avec step_name explicite Board (à partir 250K€)
  (3, 'Validation Direction (Board)',  'ANY_OF_ROLE', 'OWNER',    250000::NUMERIC, NULL::NUMERIC)
) AS v(step_order, step_name, approver_type, approver_role, threshold_min, threshold_max)
WHERE wf.applies_to = 'EXERCISE_REQUEST'
  AND wf.is_default = true
ON CONFLICT (workflow_id, step_order) DO NOTHING;
