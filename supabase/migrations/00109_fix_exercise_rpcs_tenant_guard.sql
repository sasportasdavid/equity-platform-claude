-- ============================================================
-- Fix sécurité (audit 2026-06-10, P0-2) — tenant guard sur RPC exercise
-- ============================================================
--
-- confirm_exercise_payment et cancel_exercise_request sont SECURITY DEFINER
-- et ne vérifiaient QUE user_has_permission() — scopée sur l'org active du
-- caller, jamais comparée à l'org de la demande d'exercice. Un admin d'une org
-- tierce connaissant un UUID pouvait confirmer un paiement (création de
-- positions au capital sans paiement réel) ou annuler une demande d'une autre
-- organisation.
--
-- Le helper _enforce_tenant_org(p_org_id) (migration 00105) lève
-- TENANT_VIOLATION si p_org_id <> current_org_id(). On l'ajoute :
--   - confirm_exercise_payment : action purement admin → guard systématique.
--   - cancel_exercise_request : le bénéficiaire propriétaire est déjà scopé par
--     benef_user_id = auth.uid() (et peut avoir un active_org_id NULL) ; on
--     n'applique le guard que sur le chemin admin (NOT v_is_owner).
-- ============================================================

-- ============================================================
-- 1. confirm_exercise_payment (+ tenant guard)
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_exercise_payment(
  p_exercise_request_id UUID,
  p_payment_amount_received NUMERIC,
  p_payment_reference TEXT,
  p_payment_received_at TIMESTAMPTZ DEFAULT now(),
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
  v_award RECORD;
  v_new_award_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('exercises.confirm_payment') THEN
    RAISE EXCEPTION 'Permission denied: exercises.confirm_payment required';
  END IF;

  SELECT * INTO v_request FROM exercise_requests
   WHERE id = p_exercise_request_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exercise request not found';
  END IF;

  -- Tenant guard : la demande doit appartenir à l'org active du caller
  PERFORM _enforce_tenant_org(v_request.org_id);

  -- Status doit être SIGNED (bulletin signé) ou APPROVED (signature skip V1)
  IF v_request.status NOT IN ('SIGNED','APPROVED') THEN
    RAISE EXCEPTION 'Cannot confirm payment for status %', v_request.status;
  END IF;

  -- Update exercise_request → COMPLETED
  UPDATE exercise_requests
     SET status = 'COMPLETED',
         payment_amount_received = p_payment_amount_received,
         payment_received_at = p_payment_received_at,
         payment_reference = p_payment_reference,
         admin_notes = COALESCE(admin_notes, '') ||
                       CASE WHEN p_admin_notes IS NULL THEN ''
                            ELSE E'\n[CONFIRM PAYMENT] ' || p_admin_notes
                       END,
         completed_at = now(),
         updated_at = now()
   WHERE id = p_exercise_request_id;

  -- Update award : units_exercised + status (PARTIALLY/FULLY_EXERCISED)
  SELECT * INTO v_award FROM awards WHERE id = v_request.award_id;

  v_new_award_status := CASE
    WHEN v_award.units_exercised + v_request.units_to_exercise >= v_award.units_granted
      THEN 'FULLY_EXERCISED'
    ELSE 'PARTIALLY_EXERCISED'
  END;

  UPDATE awards
     SET units_exercised = units_exercised + v_request.units_to_exercise,
         status = v_new_award_status,
         updated_at = now()
   WHERE id = v_request.award_id;

  -- Audit
  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_request.org_id, v_user_id, 'exercise.completed',
    'exercise_request', p_exercise_request_id,
    jsonb_build_object(
      'award_id', v_request.award_id,
      'units_exercised', v_request.units_to_exercise,
      'payment_amount', p_payment_amount_received,
      'payment_reference', p_payment_reference,
      'new_award_status', v_new_award_status
    )
  );

  RETURN jsonb_build_object(
    'exercise_request_id', p_exercise_request_id,
    'status', 'COMPLETED',
    'award_status', v_new_award_status,
    'units_exercised', v_award.units_exercised + v_request.units_to_exercise
  );
END $$;

GRANT EXECUTE ON FUNCTION confirm_exercise_payment(UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

-- ============================================================
-- 2. cancel_exercise_request (+ tenant guard sur chemin admin)
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_exercise_request(
  p_exercise_request_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
  v_is_owner BOOLEAN;
  v_can_cancel BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT er.*, b.user_id AS benef_user_id
    INTO v_request
    FROM exercise_requests er
    JOIN beneficiaries b ON b.id = er.beneficiary_id
   WHERE er.id = p_exercise_request_id
     AND er.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exercise request not found';
  END IF;

  v_is_owner := (v_request.benef_user_id = v_user_id);

  -- Tenant guard : le chemin admin doit opérer sur l'org active du caller.
  -- Le chemin propriétaire est déjà scopé par benef_user_id = auth.uid()
  -- (un bénéficiaire pur peut avoir un active_org_id NULL → on ne l'enforce pas).
  IF NOT v_is_owner THEN
    PERFORM _enforce_tenant_org(v_request.org_id);
  END IF;

  -- Bénéficiaire : cancel uniquement PENDING/APPROVED
  -- Admin : cancel partout sauf états terminaux
  v_can_cancel := (
    (v_is_owner
     AND user_has_permission('exercises.cancel.own')
     AND v_request.status IN ('PENDING','APPROVED'))
    OR
    (user_has_permission('exercises.cancel.any')
     AND v_request.status NOT IN ('COMPLETED','CANCELLED','REJECTED'))
  );

  IF NOT v_can_cancel THEN
    RAISE EXCEPTION 'Cannot cancel exercise request in status %', v_request.status;
  END IF;

  UPDATE exercise_requests
     SET status = 'CANCELLED',
         cancelled_at = now(),
         cancelled_by = v_user_id,
         cancellation_reason = p_reason,
         updated_at = now()
   WHERE id = p_exercise_request_id;

  -- Cancel approval_request associée si encore en cours
  IF v_request.approval_request_id IS NOT NULL THEN
    UPDATE approval_requests
       SET status = 'CANCELLED',
           resolved_at = now()
     WHERE id = v_request.approval_request_id
       AND status NOT IN ('APPROVED','REJECTED','CANCELLED');
  END IF;

  -- Audit
  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_request.org_id, v_user_id, 'exercise.cancelled',
    'exercise_request', p_exercise_request_id,
    jsonb_build_object(
      'reason', p_reason,
      'cancelled_by_owner', v_is_owner,
      'previous_status', v_request.status
    )
  );

  RETURN jsonb_build_object(
    'exercise_request_id', p_exercise_request_id,
    'status', 'CANCELLED'
  );
END $$;

GRANT EXECUTE ON FUNCTION cancel_exercise_request(UUID, TEXT) TO authenticated;
