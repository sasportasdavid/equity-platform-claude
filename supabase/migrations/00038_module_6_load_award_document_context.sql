-- ============================================================================
-- MODULE 6 B2 — RPC load_award_document_context
--
-- Helper appelé par la Server Action generateAwardDocument pour charger en
-- 1 RTT le contexte complet (award + plan + beneficiary + org). Adapté
-- au schema réel : beneficiaries.first_name + last_name (pas full_name),
-- tax_residence_country (pas tax_residence).
--
-- Permission : documents.send_for_signature (recon B1 — pas de
-- documents.generate côté DB).
-- ============================================================================

CREATE OR REPLACE FUNCTION load_award_document_context(
  p_award_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('documents.send_for_signature') THEN
    RAISE EXCEPTION 'Permission denied: documents.send_for_signature';
  END IF;

  SELECT jsonb_build_object(
    'award', jsonb_build_object(
      'id', a.id,
      'award_number', a.award_number,
      'status', a.status,
      'units_granted', a.units_granted,
      'exercise_price', a.exercise_price,
      'grant_date', a.grant_date,
      'vesting_start_date', a.vesting_start_date,
      'expiry_date', a.expiry_date
    ),
    'plan', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'plan_type', p.plan_type
    ),
    'beneficiary', jsonb_build_object(
      'id', b.id,
      'full_name', TRIM(COALESCE(b.first_name, '') || ' ' || COALESCE(b.last_name, '')),
      'first_name', b.first_name,
      'last_name', b.last_name,
      'email', b.email,
      'tax_residence', b.tax_residence_country,
      'address_line_1', b.address_line_1,
      'postal_code', b.postal_code,
      'city', b.city,
      'country', b.country
    ),
    'org', jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'legal_name', o.legal_name,
      'siren', o.siren,
      'registered_address', o.registered_address
    )
  ) INTO v_result
  FROM awards a
    JOIN plans p ON p.id = a.plan_id
    JOIN beneficiaries b ON b.id = a.beneficiary_id
    JOIN organizations o ON o.id = a.org_id
  WHERE a.id = p_award_id AND a.org_id = v_org_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Award % not found in org %', p_award_id, v_org_id;
  END IF;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION load_award_document_context(UUID) TO authenticated;
