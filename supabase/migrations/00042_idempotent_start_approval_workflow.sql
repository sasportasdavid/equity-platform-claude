-- =============================================================================
-- PR #9 Bug #31 — start_approval_workflow idempotency
-- =============================================================================
-- Symptôme : double-clic sur "Proposer" côté UI crée 2 approval_requests
-- (et 2× les approval_decisions + notifications). UI guard via useTransition
-- + disabled={pending} en place mais reste fragile sur réseau lent (race
-- entre les 2 POSTs avant que le state pending propage).
--
-- Fix au niveau RPC : pré-check d'existence — si un approval_request
-- IN_PROGRESS existe déjà pour cet award, on retourne son id sans rien
-- créer (idempotent return). Le 2e clic est alors un no-op qui retourne
-- la même valeur que le 1er.
--
-- Garanti à coût ~0 (1 SELECT par appel) et zero risque de doublon —
-- la défense en profondeur côté DB est l'autorité finale.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.start_approval_workflow(
  p_award_id UUID,
  p_workflow_id UUID DEFAULT NULL::UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id  UUID := auth.uid();
  v_org_id   UUID := current_org_id();
  v_award    RECORD;
  v_workflow approval_workflows%ROWTYPE;
  v_step     approval_workflow_steps%ROWTYPE;
  v_request_id UUID;
  v_existing_request_id UUID;
  v_decision_count INTEGER := 0;
  v_resolved_users UUID[];
  v_user_id_iter UUID;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- =========================================================================
  -- IDEMPOTENCY GUARD (PR #9 Bug #31) — si un approval_request IN_PROGRESS
  -- existe déjà pour cet award, on retourne son id sans rien créer.
  -- Couvre le double-clic UI : 2e POST = no-op, retourne le même request_id
  -- que le 1er. Le caller (transitionAward) re-tente la transition vers
  -- PENDING_APPROVAL avec skipApprovalHook=true, qui est elle-même idempotente
  -- (déjà PENDING_APPROVAL → no-op ou erreur de transition acceptée).
  -- =========================================================================
  SELECT id INTO v_existing_request_id
    FROM approval_requests
   WHERE award_id = p_award_id
     AND org_id = v_org_id
     AND status = 'IN_PROGRESS'
   LIMIT 1;

  IF v_existing_request_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'request_id', v_existing_request_id,
      'idempotent', true,
      'reason', 'request_already_in_progress'
    );
  END IF;

  SELECT * INTO v_award FROM awards WHERE id = p_award_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found in org %', p_award_id, v_org_id;
  END IF;

  IF p_workflow_id IS NOT NULL THEN
    SELECT * INTO v_workflow FROM approval_workflows
     WHERE id = p_workflow_id AND org_id = v_org_id AND deleted_at IS NULL AND is_active = true;
  ELSE
    SELECT * INTO v_workflow FROM approval_workflows
     WHERE attach_to_plan_id = v_award.plan_id
       AND deleted_at IS NULL AND is_active = true;
    IF NOT FOUND THEN
      SELECT * INTO v_workflow FROM approval_workflows
       WHERE org_id = v_org_id AND applies_to = 'AWARD_GRANT'
         AND is_default = true AND deleted_at IS NULL AND is_active = true;
    END IF;
  END IF;

  IF v_workflow.id IS NULL THEN
    RETURN jsonb_build_object('request_id', NULL, 'workflow_id', NULL, 'reason', 'no_workflow_configured');
  END IF;

  SELECT * INTO v_step FROM approval_workflow_steps
   WHERE workflow_id = v_workflow.id AND step_order = 1
   ORDER BY step_order LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow % has no step 1', v_workflow.id;
  END IF;

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
END $function$;

COMMENT ON FUNCTION public.start_approval_workflow(UUID, UUID) IS
  'PR #9 Bug #31 : pré-check idempotent — si approval_request IN_PROGRESS existe déjà pour cet award, retourne son id sans créer de doublon. Couvre le double-clic UI sur Proposer.';
