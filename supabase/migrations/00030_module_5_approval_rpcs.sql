-- ============================================================================
-- MODULE 5 B1 — Approval Engine RPCs
--
-- 4 RPCs SECURITY DEFINER orchestrent le workflow d'approbation :
--   1. start_approval_workflow      — démarre un workflow pour un award
--   2. record_approval_decision     — un approver vote APPROVED/REJECTED
--   3. evaluate_approval_request    — interne, évalue l'état du workflow
--   4. cancel_approval_request      — admin annule un workflow IN_PROGRESS
--
-- Adaptations vs spec (cf memory/module_5_b1_recon.md) :
--   - approbateurs résolus via memberships.roles ARRAY (pas de table roles)
--     → WHERE approver_role = ANY(m.roles) AND m.status = 'ACTIVE'
--   - notifications inserts adaptés au schema Module 1 (channel/template_code/
--     related_entity_*/variables_used)
--   - audit_events.user_id (pas actor_id)
--   - subject_id NOT NULL conservé : set à p_award_id en + de award_id
--   - current_step_order ajouté en cursor (1, 2, 3…)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC 1 — start_approval_workflow
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION start_approval_workflow(
  p_award_id    UUID,
  p_workflow_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_org_id   UUID := current_org_id();
  v_award    RECORD;
  v_workflow approval_workflows%ROWTYPE;
  v_step     approval_workflow_steps%ROWTYPE;
  v_request_id UUID;
  v_decision_count INTEGER := 0;
  v_resolved_users UUID[];
  v_user_id_iter UUID;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Charger l'award + check org
  SELECT * INTO v_award FROM awards WHERE id = p_award_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found in org %', p_award_id, v_org_id;
  END IF;

  -- 2. Résoudre le workflow
  IF p_workflow_id IS NOT NULL THEN
    SELECT * INTO v_workflow FROM approval_workflows
     WHERE id = p_workflow_id AND org_id = v_org_id AND deleted_at IS NULL AND is_active = true;
  ELSE
    -- Priorité 1 : workflow attaché au plan
    SELECT * INTO v_workflow FROM approval_workflows
     WHERE attach_to_plan_id = v_award.plan_id
       AND deleted_at IS NULL AND is_active = true;

    -- Priorité 2 : workflow default de l'org pour AWARD_GRANT
    IF NOT FOUND THEN
      SELECT * INTO v_workflow FROM approval_workflows
       WHERE org_id = v_org_id
         AND applies_to = 'AWARD_GRANT'
         AND is_default = true
         AND deleted_at IS NULL AND is_active = true;
    END IF;
  END IF;

  IF v_workflow.id IS NULL THEN
    -- Pas de workflow configuré → return null, le caller gère le legacy behavior
    RETURN jsonb_build_object(
      'request_id', NULL,
      'workflow_id', NULL,
      'reason', 'no_workflow_configured'
    );
  END IF;

  -- 3. Charger le step 1
  SELECT * INTO v_step FROM approval_workflow_steps
   WHERE workflow_id = v_workflow.id AND step_order = 1
   ORDER BY step_order LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow % has no step 1', v_workflow.id;
  END IF;

  -- 4. Résoudre les approbateurs du step 1
  v_resolved_users := ARRAY[]::UUID[];

  IF v_step.approver_type = 'USER' AND v_step.approver_user_id IS NOT NULL THEN
    v_resolved_users := ARRAY[v_step.approver_user_id];
  ELSIF v_step.approver_type IN ('ROLE','ANY_OF_ROLE','ALL_OF_ROLE') THEN
    SELECT array_agg(user_id) INTO v_resolved_users
      FROM memberships
     WHERE org_id = v_org_id
       AND v_step.approver_role = ANY(roles)
       AND status = 'ACTIVE';
  END IF;

  IF v_resolved_users IS NULL OR array_length(v_resolved_users, 1) IS NULL THEN
    RAISE EXCEPTION 'No approvers resolved for step 1 (type=%, role=%)',
      v_step.approver_type, v_step.approver_role;
  END IF;

  -- 5. Créer l'approval_request (subject_id ET award_id pour double-cohérence)
  INSERT INTO approval_requests (
    org_id, workflow_id,
    subject_type, subject_id, award_id, plan_id,
    status, current_step_order, current_step_id,
    requested_by, started_by, started_at
  ) VALUES (
    v_org_id, v_workflow.id,
    'AWARD', p_award_id, p_award_id, v_award.plan_id,
    'IN_PROGRESS', 1, v_step.id,
    v_user_id, v_user_id, now()
  )
  RETURNING id INTO v_request_id;

  -- 6. Insert les decisions PENDING + notifications
  FOREACH v_user_id_iter IN ARRAY v_resolved_users
  LOOP
    INSERT INTO approval_decisions (
      org_id, request_id, step_id, step_order,
      approver_user_id, approver_role, status, notified_at
    ) VALUES (
      v_org_id, v_request_id, v_step.id, v_step.step_order,
      v_user_id_iter, v_step.approver_role, 'PENDING', now()
    );
    v_decision_count := v_decision_count + 1;

    INSERT INTO notifications (
      org_id, user_id, channel, template_code, status,
      related_entity_type, related_entity_id, variables_used
    ) VALUES (
      v_org_id, v_user_id_iter, 'IN_APP', 'approval_pending', 'PENDING',
      'approval_request', v_request_id,
      jsonb_build_object(
        'award_id', p_award_id,
        'award_number', v_award.award_number,
        'step_order', v_step.step_order,
        'step_name', v_step.step_name
      )
    );
  END LOOP;

  -- 7. Audit
  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'approval.workflow_started',
    'approval_request', v_request_id,
    jsonb_build_object(
      'workflow_id', v_workflow.id,
      'award_id', p_award_id,
      'decisions_count', v_decision_count
    )
  );

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'workflow_id', v_workflow.id,
    'decisions_count', v_decision_count
  );
END $$;

GRANT EXECUTE ON FUNCTION start_approval_workflow(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC 2 — record_approval_decision
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_approval_decision(
  p_decision_id UUID,
  p_status      TEXT,        -- 'APPROVED' ou 'REJECTED'
  p_comment     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_org_id   UUID := current_org_id();
  v_decision approval_decisions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;

  IF NOT user_has_permission('approvals.act') THEN
    RAISE EXCEPTION 'Permission denied: approvals.act';
  END IF;

  SELECT * INTO v_decision FROM approval_decisions
   WHERE id = p_decision_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found';
  END IF;

  IF v_decision.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Decision already resolved (status=%)', v_decision.status;
  END IF;

  -- Si la decision a un approver_user_id explicite, c'est lui qui doit décider.
  -- Si pas d'approver_user_id (rare, cas ROLE pur sans résolution), n'importe
  -- quel user avec approvals.act dans l'org peut décider.
  IF v_decision.approver_user_id IS NOT NULL
     AND v_decision.approver_user_id <> v_user_id THEN
    RAISE EXCEPTION 'You are not the designated approver for this decision';
  END IF;

  -- Update la decision (le trigger d'audit s'occupe de l'event)
  UPDATE approval_decisions
     SET status     = p_status,
         decided_at = now(),
         decided_by = v_user_id,
         comment    = p_comment,
         updated_at = now()
   WHERE id = p_decision_id;

  -- Évaluer le request (cascade à la fonction d'évaluation)
  RETURN evaluate_approval_request(v_decision.request_id);
END $$;

GRANT EXECUTE ON FUNCTION record_approval_decision(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC 3 — evaluate_approval_request (interne mais GRANTed pour flexibility)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION evaluate_approval_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request   approval_requests%ROWTYPE;
  v_step      approval_workflow_steps%ROWTYPE;
  v_next_step approval_workflow_steps%ROWTYPE;
  v_step_approved_count INTEGER;
  v_step_rejected_count INTEGER;
  v_step_total_count    INTEGER;
  v_resolved_users UUID[];
  v_user_id_iter   UUID;
  v_reject_comment TEXT;
BEGIN
  SELECT * INTO v_request FROM approval_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found', p_request_id;
  END IF;

  IF v_request.status <> 'IN_PROGRESS' THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'status', v_request.status,
      'reason', 'already_resolved'
    );
  END IF;

  -- Charger le step courant (par order)
  SELECT * INTO v_step FROM approval_workflow_steps
   WHERE workflow_id = v_request.workflow_id
     AND step_order = v_request.current_step_order;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step % not found for workflow %',
      v_request.current_step_order, v_request.workflow_id;
  END IF;

  -- Compter les décisions du step courant
  SELECT
    COUNT(*) FILTER (WHERE status = 'APPROVED'),
    COUNT(*) FILTER (WHERE status = 'REJECTED'),
    COUNT(*)
  INTO v_step_approved_count, v_step_rejected_count, v_step_total_count
  FROM approval_decisions
  WHERE request_id = p_request_id AND step_order = v_step.step_order;

  -- ---- 1. REJECT dans le step → workflow KO ----
  IF v_step_rejected_count > 0 THEN
    SELECT comment INTO v_reject_comment
      FROM approval_decisions
     WHERE request_id = p_request_id
       AND status = 'REJECTED'
     ORDER BY decided_at DESC NULLS LAST LIMIT 1;

    UPDATE approval_requests
       SET status          = 'REJECTED',
           resolved_at     = now(),
           rejected_reason = v_reject_comment,
           resolution      = 'REJECTED',
           resolution_message = v_reject_comment
     WHERE id = p_request_id;

    -- Marquer toutes les PENDING comme SKIPPED (audit trigger logguera chaque)
    UPDATE approval_decisions
       SET status = 'SKIPPED', updated_at = now()
     WHERE request_id = p_request_id AND status = 'PENDING';

    INSERT INTO audit_events (
      org_id, user_id, event_type, resource_type, resource_id, metadata
    ) VALUES (
      v_request.org_id, auth.uid(), 'approval.workflow_rejected',
      'approval_request', p_request_id,
      jsonb_build_object(
        'award_id', v_request.award_id,
        'rejected_reason', v_reject_comment
      )
    );

    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'status', 'REJECTED',
      'next_award_status', 'DRAFT',
      'rejected_reason', v_reject_comment
    );
  END IF;

  -- ---- 2. required_approvals atteint dans le step → step OK ----
  IF v_step_approved_count >= v_step.required_approvals THEN
    -- SKIP les remaining PENDING (cas ANY_OF_ROLE atteint)
    UPDATE approval_decisions
       SET status = 'SKIPPED', updated_at = now()
     WHERE request_id = p_request_id
       AND step_order = v_step.step_order
       AND status = 'PENDING';

    -- Step suivant ?
    SELECT * INTO v_next_step FROM approval_workflow_steps
     WHERE workflow_id = v_request.workflow_id
       AND step_order = v_step.step_order + 1
     ORDER BY step_order LIMIT 1;

    IF FOUND THEN
      -- Avancer
      UPDATE approval_requests
         SET current_step_order = v_next_step.step_order,
             current_step_id    = v_next_step.id,
             updated_at         = now()
       WHERE id = p_request_id;

      -- Résoudre les approvers du next step
      v_resolved_users := ARRAY[]::UUID[];

      IF v_next_step.approver_type = 'USER' AND v_next_step.approver_user_id IS NOT NULL THEN
        v_resolved_users := ARRAY[v_next_step.approver_user_id];
      ELSIF v_next_step.approver_type IN ('ROLE','ANY_OF_ROLE','ALL_OF_ROLE') THEN
        SELECT array_agg(user_id) INTO v_resolved_users
          FROM memberships
         WHERE org_id = v_request.org_id
           AND v_next_step.approver_role = ANY(roles)
           AND status = 'ACTIVE';
      END IF;

      IF v_resolved_users IS NULL OR array_length(v_resolved_users, 1) IS NULL THEN
        RAISE EXCEPTION 'No approvers resolved for step % (type=%, role=%)',
          v_next_step.step_order, v_next_step.approver_type, v_next_step.approver_role;
      END IF;

      FOREACH v_user_id_iter IN ARRAY v_resolved_users
      LOOP
        INSERT INTO approval_decisions (
          org_id, request_id, step_id, step_order,
          approver_user_id, approver_role, status, notified_at
        ) VALUES (
          v_request.org_id, p_request_id, v_next_step.id, v_next_step.step_order,
          v_user_id_iter, v_next_step.approver_role, 'PENDING', now()
        );

        INSERT INTO notifications (
          org_id, user_id, channel, template_code, status,
          related_entity_type, related_entity_id, variables_used
        ) VALUES (
          v_request.org_id, v_user_id_iter, 'IN_APP', 'approval_pending', 'PENDING',
          'approval_request', p_request_id,
          jsonb_build_object(
            'award_id', v_request.award_id,
            'step_order', v_next_step.step_order,
            'step_name', v_next_step.step_name
          )
        );
      END LOOP;

      RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'IN_PROGRESS',
        'next_step_order', v_next_step.step_order
      );
    ELSE
      -- Dernier step → workflow OK
      UPDATE approval_requests
         SET status      = 'APPROVED',
             resolved_at = now(),
             resolution  = 'APPROVED'
       WHERE id = p_request_id;

      INSERT INTO audit_events (
        org_id, user_id, event_type, resource_type, resource_id, metadata
      ) VALUES (
        v_request.org_id, auth.uid(), 'approval.workflow_approved',
        'approval_request', p_request_id,
        jsonb_build_object('award_id', v_request.award_id)
      );

      RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'APPROVED',
        'next_award_status', 'APPROVED'
      );
    END IF;
  END IF;

  -- ---- 3. Encore en attente ----
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'IN_PROGRESS',
    'pending_in_current_step',
      v_step_total_count - v_step_approved_count - v_step_rejected_count
  );
END $$;

GRANT EXECUTE ON FUNCTION evaluate_approval_request(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC 4 — cancel_approval_request
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_approval_request(
  p_request_id UUID,
  p_reason     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org_id UUID := current_org_id();
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('approvals.configure') THEN
    RAISE EXCEPTION 'Permission denied: approvals.configure';
  END IF;

  UPDATE approval_requests
     SET status          = 'CANCELLED',
         resolved_at     = now(),
         rejected_reason = p_reason,
         resolution_message = p_reason
   WHERE id = p_request_id
     AND org_id = v_org_id
     AND status = 'IN_PROGRESS';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found or not IN_PROGRESS', p_request_id;
  END IF;

  UPDATE approval_decisions
     SET status = 'SKIPPED', updated_at = now()
   WHERE request_id = p_request_id AND status = 'PENDING';

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'approval.workflow_cancelled',
    'approval_request', p_request_id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN p_request_id;
END $$;

GRANT EXECUTE ON FUNCTION cancel_approval_request(UUID, TEXT) TO authenticated;
