-- ============================================================
-- Module 9 B1 — RPC start_approval_workflow_for_exercise
-- ============================================================
--
-- Variante du Module 5 `start_approval_workflow` qui :
--   - Accepte subject_type='EXERCISE_REQUEST' (au lieu d'AWARD_GRANT)
--   - Filtre les steps selon `amount_threshold_min/max` (palier €)
--   - Crée approval_decisions PENDING pour chaque step applicable
--
-- Pattern resolved approbateurs (réutilisé Module 5) :
--   - approver_type = 'USER' : 1 user direct
--   - approver_type = 'ROLE' : tous les users de l'org avec ce role + status ACTIVE
--   - approver_type = 'ANY_OF_ROLE' : tous, 1 décision suffit (required_approvals=1)
--   - approver_type = 'ALL_OF_ROLE' : tous, tous doivent décider

CREATE OR REPLACE FUNCTION start_approval_workflow_for_exercise(
  p_exercise_request_id UUID,
  p_workflow_id UUID,
  p_total_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request_id UUID;
  v_step RECORD;
  v_org_id UUID;
  v_user_id UUID;
  v_first_step_order INTEGER;
  v_user_iter UUID;
BEGIN
  SELECT org_id INTO v_org_id
    FROM exercise_requests
   WHERE id = p_exercise_request_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Exercise request not found';
  END IF;

  -- 1. Insert approval_request (legacy column award_id reste NULL pour les
  --    exercises ; le lien se fait via subject_type/subject_id)
  INSERT INTO approval_requests (
    org_id, workflow_id, subject_type, subject_id,
    status, current_step_order, started_at
  )
  VALUES (
    v_org_id, p_workflow_id, 'EXERCISE_REQUEST', p_exercise_request_id,
    'IN_PROGRESS', 0, now()
  )
  RETURNING id INTO v_request_id;

  -- 2. Identifier le 1er step applicable selon montant
  SELECT step_order INTO v_first_step_order
    FROM approval_workflow_steps
   WHERE workflow_id = p_workflow_id
     AND (amount_threshold_min IS NULL OR p_total_amount >= amount_threshold_min)
     AND (amount_threshold_max IS NULL OR p_total_amount <= amount_threshold_max)
   ORDER BY step_order
   LIMIT 1;

  IF v_first_step_order IS NULL THEN
    RAISE EXCEPTION 'No workflow step applicable for amount %', p_total_amount;
  END IF;

  -- 3. Pour chaque step applicable (selon montant), créer les approval_decisions
  --    PENDING (pattern Module 5)
  FOR v_step IN
    SELECT * FROM approval_workflow_steps
     WHERE workflow_id = p_workflow_id
       AND step_order >= v_first_step_order
       AND (amount_threshold_min IS NULL OR p_total_amount >= amount_threshold_min)
       AND (amount_threshold_max IS NULL OR p_total_amount <= amount_threshold_max)
     ORDER BY step_order
  LOOP
    IF v_step.approver_type = 'USER' AND v_step.approver_user_id IS NOT NULL THEN
      INSERT INTO approval_decisions (
        request_id, step_id, step_order, approver_user_id, approver_role,
        status, org_id
      )
      VALUES (
        v_request_id, v_step.id, v_step.step_order, v_step.approver_user_id, NULL,
        'PENDING', v_org_id
      );

    ELSIF v_step.approver_type IN ('ROLE','ANY_OF_ROLE','ALL_OF_ROLE')
          AND v_step.approver_role IS NOT NULL THEN
      -- Resolve users : tous les memberships ACTIVE de l'org avec ce rôle
      FOR v_user_iter IN
        SELECT m.user_id
          FROM memberships m
         WHERE m.org_id = v_org_id
           AND m.status = 'ACTIVE'
           AND v_step.approver_role = ANY(m.roles)
      LOOP
        INSERT INTO approval_decisions (
          request_id, step_id, step_order, approver_user_id, approver_role,
          status, org_id
        )
        VALUES (
          v_request_id, v_step.id, v_step.step_order, v_user_iter, v_step.approver_role,
          'PENDING', v_org_id
        );
      END LOOP;
    END IF;
  END LOOP;

  -- 4. Set current_step_order
  UPDATE approval_requests
     SET current_step_order = v_first_step_order
   WHERE id = v_request_id;

  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION start_approval_workflow_for_exercise(UUID, UUID, NUMERIC) TO authenticated;
