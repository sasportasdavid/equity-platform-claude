-- =============================================================================
-- Module 4 — sous-module B1.2 : RPC transition_beneficiary_lifecycle
-- =============================================================================
-- Atomique. Lock row + check perm + check transition + UPDATE.
-- Le trigger trg_beneficiary_lifecycle (00025) gère l'audit en BEFORE.
-- =============================================================================

CREATE OR REPLACE FUNCTION transition_beneficiary_lifecycle(
  p_beneficiary_id UUID,
  p_to_status TEXT,
  p_reason TEXT,
  p_termination_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_beneficiary RECORD;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié ou org active manquante';
  END IF;

  IF NOT user_has_permission('beneficiaries.lifecycle') THEN
    RAISE EXCEPTION 'Permission denied : beneficiaries.lifecycle requise';
  END IF;

  -- Lock + load
  SELECT * INTO v_beneficiary FROM beneficiaries
   WHERE id = p_beneficiary_id AND org_id = v_org_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beneficiary % introuvable ou non accessible dans l''org', p_beneficiary_id;
  END IF;

  -- Validate transition (active <-> on_leave, active|on_leave -> terminated)
  IF NOT (
    (v_beneficiary.status = 'active' AND p_to_status IN ('on_leave', 'terminated'))
    OR (v_beneficiary.status = 'on_leave' AND p_to_status IN ('active', 'terminated'))
  ) THEN
    RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', v_beneficiary.status, p_to_status;
  END IF;

  -- termination_date requis quand on transitionne vers terminated
  IF p_to_status = 'terminated' AND p_termination_date IS NULL THEN
    RAISE EXCEPTION 'termination_date required when transitioning to terminated';
  END IF;

  -- Apply (le trigger trg_beneficiary_lifecycle gère l'audit + lifecycle_changed_at)
  UPDATE beneficiaries
     SET status = p_to_status,
         termination_date = COALESCE(p_termination_date, termination_date),
         lifecycle_change_reason = p_reason
   WHERE id = p_beneficiary_id;

  RETURN p_beneficiary_id;
END $$;

GRANT EXECUTE ON FUNCTION transition_beneficiary_lifecycle(UUID, TEXT, TEXT, DATE) TO authenticated;

COMMENT ON FUNCTION transition_beneficiary_lifecycle(UUID, TEXT, TEXT, DATE) IS
  'Module 4 B1 — Transition atomique du statut bénéficiaire (active/on_leave/terminated). Permission beneficiaries.lifecycle requise. Audit géré par trigger trg_beneficiary_lifecycle.';
