-- ============================================================================
-- Module 9 B5 — Seed 2 doc_templates exercise + RPC load_exercise_document_context
-- ============================================================================
--
-- 1. Seed `document_templates` per-org pour les 2 templates V1 :
--    - EXERCISE_NOTIFICATION (category EXERCISE_NOTICE) — react-pdf
--      ExerciseNotificationTemplate, livré C4
--    - SUBSCRIPTION_BULLETIN (category CERTIFICATE) — react-pdf
--      SubscriptionBulletinTemplate, livré C4
--
--    Pattern Module 6 reproduit : SELECT FROM organizations + WHERE NOT EXISTS,
--    `template_engine='REACT_PDF'`, `content_format='CODE'`, `content` pointe
--    sur le componentName, `applies_to_plan_types` restreint aux plans qui
--    ont un workflow d'exercice (BSPCE, STOCK_OPTION, BSA — pas AGA).
--
-- 2. RPC `load_exercise_document_context(p_exercise_request_id UUID)` :
--    Retourne JSONB avec exercise/award/plan/beneficiary/company/org pour
--    consommation par les Server Actions C6 PDF generators.
--
--    SECURITY INVOKER (RLS user-scoped — caller doit avoir read sur
--    exercise_requests). Pas STABLE car on lit potentiellement des updates
--    récents juste après transition de status.
--
--    Contrats :
--    - exercise_id NULL ou non trouvé → renvoie NULL (pas d'exception)
--    - FK cassée (org sans bank_iban, plan deleted) → partial avec NULL,
--      pas d'exception (les hooks PDF doivent dégrader proprement)

-- ============================================================
-- 1. Seed EXERCISE_NOTIFICATION
-- ============================================================
INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'EXERCISE_NOTIFICATION',
  'Notification d''exercice',
  'Notification d''exercice — instructions de paiement (envoyée au bénéficiaire après approbation)',
  'EXERCISE_NOTICE',
  ARRAY['BSPCE', 'STOCK_OPTION', 'BSA'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "ExerciseNotificationTemplate"}'::jsonb,
  '{"exercise": ["request_number","units_to_exercise","exercise_cost_total","fmv_at_request","tax_simulation_snapshot","approved_at"], "award": ["award_number","grant_date","exercise_price"], "plan": ["plan_type","name"], "beneficiary": ["first_name","last_name","email","address_line_1","postal_code","city","country"], "company": ["name","siren"], "org": ["name","bank_iban","bank_bic","bank_name","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
   WHERE dt.org_id = o.id
     AND dt.code = 'EXERCISE_NOTIFICATION'
     AND dt.deleted_at IS NULL
);

-- ============================================================
-- 2. Seed SUBSCRIPTION_BULLETIN
-- ============================================================
INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'SUBSCRIPTION_BULLETIN',
  'Bulletin de souscription',
  'Bulletin de souscription d''actions issues de l''exercice de BSPCE/Stock Options (généré post-paiement)',
  'CERTIFICATE',
  ARRAY['BSPCE', 'STOCK_OPTION', 'BSA'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "SubscriptionBulletinTemplate"}'::jsonb,
  '{"exercise": ["request_number","units_to_exercise","exercise_cost_total","payment_received_at","payment_reference","completed_at"], "award": ["award_number","grant_date","exercise_price"], "plan": ["plan_type","name"], "beneficiary": ["first_name","last_name","address_line_1","postal_code","city","country"], "company": ["name","siren","share_capital"], "org": ["name","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
   WHERE dt.org_id = o.id
     AND dt.code = 'SUBSCRIPTION_BULLETIN'
     AND dt.deleted_at IS NULL
);

-- ============================================================
-- 3. RPC load_exercise_document_context
-- ============================================================
CREATE OR REPLACE FUNCTION load_exercise_document_context(p_exercise_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exercise   RECORD;
  v_award      RECORD;
  v_plan       RECORD;
  v_beneficiary RECORD;
  v_company    RECORD;
  v_org        RECORD;
  v_email      TEXT;
BEGIN
  IF p_exercise_request_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Charger l'exercise_request (RLS user-scoped via SECURITY INVOKER)
  SELECT * INTO v_exercise
    FROM exercise_requests
   WHERE id = p_exercise_request_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 2. Award (best-effort : si deleted, on continue avec NULLs)
  SELECT * INTO v_award
    FROM awards
   WHERE id = v_exercise.award_id
     AND deleted_at IS NULL;

  -- 3. Plan
  IF v_award.plan_id IS NOT NULL THEN
    SELECT * INTO v_plan
      FROM plans
     WHERE id = v_award.plan_id
       AND deleted_at IS NULL;
  END IF;

  -- 4. Beneficiary + email (priorité : beneficiaries.email, fallback auth.users)
  SELECT * INTO v_beneficiary
    FROM beneficiaries
   WHERE id = v_exercise.beneficiary_id
     AND deleted_at IS NULL;

  v_email := v_beneficiary.email;
  IF v_email IS NULL AND v_beneficiary.user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_beneficiary.user_id;
  END IF;

  -- 5. Company (via plans.company_id si dispo, sinon NULL)
  IF v_plan.company_id IS NOT NULL THEN
    SELECT * INTO v_company
      FROM companies
     WHERE id = v_plan.company_id
       AND deleted_at IS NULL;
  END IF;

  -- 6. Organization
  SELECT * INTO v_org
    FROM organizations
   WHERE id = v_exercise.org_id
     AND deleted_at IS NULL;

  -- 7. Construit le JSON de retour (NULLs ok pour les FK partielles)
  RETURN jsonb_build_object(
    'exercise', jsonb_build_object(
      'id', v_exercise.id,
      'request_number', v_exercise.request_number,
      'status', v_exercise.status,
      'units_to_exercise', v_exercise.units_to_exercise,
      'exercise_price_per_unit', v_exercise.exercise_price_per_unit,
      'exercise_cost_total', v_exercise.total_exercise_amount,
      'fmv_at_request', v_exercise.fmv_per_unit_at_request,
      'payment_method', v_exercise.payment_method,
      'payment_reference', v_exercise.payment_reference,
      'payment_amount_received', v_exercise.payment_amount_received,
      'payment_received_at', v_exercise.payment_received_at,
      'tax_simulation_snapshot', v_exercise.tax_simulation_snapshot,
      'beneficiary_notes', v_exercise.beneficiary_notes,
      'admin_notes', v_exercise.admin_notes,
      'requested_at', v_exercise.requested_at,
      'approved_at', v_exercise.approved_at,
      'confirmed_at', v_exercise.completed_at,
      'cancelled_at', v_exercise.cancelled_at,
      'rejection_reason', v_exercise.rejected_reason,
      'cancellation_reason', v_exercise.cancellation_reason
    ),
    'award', CASE WHEN v_award.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_award.id,
        'award_number', v_award.award_number,
        'grant_date', v_award.grant_date,
        'exercise_price', v_award.exercise_price,
        'units_granted', v_award.units_granted,
        'units_already_exercised', v_award.units_exercised,
        'expiry_date', v_award.expiry_date
      )
    ELSE NULL END,
    'plan', CASE WHEN v_plan.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_plan.id,
        'name', v_plan.name,
        'plan_type', v_plan.plan_type
      )
    ELSE NULL END,
    'beneficiary', CASE WHEN v_beneficiary.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_beneficiary.id,
        'first_name', v_beneficiary.first_name,
        'last_name', v_beneficiary.last_name,
        'email', v_email,
        'address_line_1', v_beneficiary.address_line_1,
        'address_line_2', v_beneficiary.address_line_2,
        'postal_code', v_beneficiary.postal_code,
        'city', v_beneficiary.city,
        'country', v_beneficiary.country,
        'tax_residence_country', v_beneficiary.tax_residence_country,
        'hire_date', v_beneficiary.hire_date
      )
    ELSE NULL END,
    'company', CASE WHEN v_company.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_company.id,
        'name', v_company.name,
        'legal_name', v_company.legal_name,
        'siren', v_company.siren,
        'share_capital', v_company.share_capital,
        'last_known_fmv_per_share', v_company.last_known_fmv_per_share
      )
    ELSE NULL END,
    'org', CASE WHEN v_org.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_org.id,
        'name', v_org.name,
        'legal_name', v_org.legal_name,
        'siren', v_org.siren,
        'registered_address', v_org.registered_address,
        'bank_iban', v_org.bank_iban,
        'bank_bic', v_org.bank_bic,
        'bank_name', v_org.bank_name
      )
    ELSE NULL END
  );
END $$;

GRANT EXECUTE ON FUNCTION load_exercise_document_context(UUID) TO authenticated;

COMMENT ON FUNCTION load_exercise_document_context(UUID) IS
  'Module 9 B5 — charge le contexte JSONB pour les templates PDF EXERCISE_NOTIFICATION et SUBSCRIPTION_BULLETIN. SECURITY INVOKER (RLS user-scoped). Renvoie NULL si exercise_request introuvable.';
