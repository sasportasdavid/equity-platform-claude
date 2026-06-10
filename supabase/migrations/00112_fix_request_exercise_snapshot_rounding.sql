-- ============================================================
-- Fix métier (audit 2026-06-10, arrondis vesting) — fallback snapshot
-- request_exercise aligné sur materialize_vesting_events
-- ============================================================
--
-- La branche fallback (Source 3) de request_exercise calculait les units
-- acquises par tranche avec ((pct * granted / 100)::BIGINT) → TRONCATURE par
-- tranche, sans correction de drift. Sur 1001 units en 4×25%, le total des
-- disponibles pouvait sous-estimer → un bénéficiaire pouvait se voir refuser
-- l'exercice de ses dernières units.
--
-- Correctif : même logique que materialize_vesting_events (00021) —
-- ROUND() par tranche + drift résiduel (granted - SUM) absorbé par la tranche
-- chronologiquement la plus tardive, puis somme des tranches déjà acquises
-- (vesting_date <= today). buildVestingTimeline (côté TS) a été aligné en
-- parallèle (apps/web/src/lib/portal/vesting.ts).
--
-- Reste du corps identique à la version déployée. CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_exercise(
  p_award_id uuid,
  p_units_to_exercise bigint,
  p_payment_method text DEFAULT 'BANK_TRANSFER'::text,
  p_beneficiary_notes text DEFAULT NULL::text,
  p_tax_simulation jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_beneficiary_id UUID;
  v_award RECORD;
  v_plan RECORD;
  v_company_id UUID;
  v_org_id UUID;
  v_units_vested_from_events BIGINT;
  v_units_vested_from_snapshot BIGINT;
  v_units_available BIGINT;
  v_units_source TEXT;
  v_total_amount NUMERIC;
  v_fmv NUMERIC;
  v_fmv_date DATE;
  v_exercise_id UUID;
  v_request_number TEXT;
  v_workflow_id UUID;
  v_approval_request_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_units_to_exercise IS NULL OR p_units_to_exercise <= 0 THEN
    RAISE EXCEPTION 'units_to_exercise must be positive';
  END IF;

  SELECT id INTO v_beneficiary_id
    FROM beneficiaries
   WHERE user_id = v_user_id AND deleted_at IS NULL;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM beneficiaries
     WHERE id = v_beneficiary_id
       AND first_name IS NOT NULL
       AND last_name IS NOT NULL
       AND tax_residence_country IS NOT NULL
       AND address_line_1 IS NOT NULL
       AND country IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'EXERCISE_PROFILE_COMPLETE: Profile incomplete. Please complete /portal/profile.';
  END IF;

  SELECT * INTO v_award FROM awards
   WHERE id = p_award_id
     AND beneficiary_id = v_beneficiary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  v_org_id := v_award.org_id;

  IF v_award.status NOT IN (
    'GRANTED','VESTING','PARTIALLY_VESTED','FULLY_VESTED','PARTIALLY_EXERCISED'
  ) THEN
    RAISE EXCEPTION 'EXERCISE_AWARD_GRANTED: Award status % not exercisable', v_award.status;
  END IF;

  SELECT * INTO v_plan FROM plans WHERE id = v_award.plan_id;
  v_company_id := v_plan.company_id;

  IF v_plan.plan_type NOT IN ('BSPCE','STOCK_OPTION','BSA') THEN
    RAISE EXCEPTION 'EXERCISE_PLAN_TYPE_EXERCISABLE: Plan type % not exercisable (AGA = no exercise)',
      v_plan.plan_type;
  END IF;

  IF v_award.expiry_date IS NOT NULL AND v_award.expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'EXERCISE_NOT_EXPIRED: Award expired on %', v_award.expiry_date;
  END IF;

  SELECT COALESCE(SUM(units_vested), 0)::BIGINT INTO v_units_vested_from_events
    FROM vesting_events
   WHERE award_id = p_award_id
     AND status = 'VESTED'
     AND scheduled_date <= CURRENT_DATE;

  IF v_units_vested_from_events > 0 THEN
    v_units_available := v_units_vested_from_events - v_award.units_exercised;
    v_units_source := 'events';
  ELSIF v_award.units_vested > 0 THEN
    v_units_available := v_award.units_vested - v_award.units_exercised;
    v_units_source := 'awards.units_vested';
  ELSE
    -- Source 3 : fallback snapshot (cas V1 dominant).
    -- Aligné sur materialize_vesting_events (00021) : ROUND() par tranche +
    -- drift résiduel absorbé par la dernière tranche (la plus tardive), puis
    -- somme des tranches déjà acquises (vesting_date <= today).
    WITH ranked AS (
      SELECT
        (tranche->>'vesting_date')::DATE AS vesting_date,
        ROUND(
          v_award.units_granted
          * COALESCE(
              (tranche->>'percentage_of_award')::NUMERIC,
              (tranche->>'percentage')::NUMERIC,
              0
            ) / 100.0
        )::BIGINT AS units,
        ROW_NUMBER() OVER (ORDER BY (tranche->>'vesting_date')::DATE) AS rn,
        COUNT(*) OVER () AS total_tranches
      FROM jsonb_array_elements(
        COALESCE(v_award.vesting_schedule_snapshot->'tranches', '[]'::jsonb)
      ) tranche
    ),
    with_drift AS (
      SELECT
        vesting_date,
        CASE
          WHEN rn = total_tranches
          THEN units + (v_award.units_granted - SUM(units) OVER ())
          ELSE units
        END AS units
      FROM ranked
    )
    SELECT COALESCE(SUM(units), 0)::BIGINT
      INTO v_units_vested_from_snapshot
      FROM with_drift
     WHERE vesting_date <= CURRENT_DATE;

    v_units_available := v_units_vested_from_snapshot - v_award.units_exercised;
    v_units_source := 'snapshot_fallback';
  END IF;

  IF p_units_to_exercise > v_units_available THEN
    RAISE EXCEPTION 'EXERCISE_UNITS_AVAILABLE: Cannot exercise % units (available: %, source: %)',
      p_units_to_exercise, v_units_available, v_units_source;
  END IF;

  v_total_amount := p_units_to_exercise * v_award.exercise_price;

  SELECT last_known_fmv_per_share, fmv_as_of_date
    INTO v_fmv, v_fmv_date
    FROM companies WHERE id = v_company_id;

  v_request_number := generate_exercise_request_number(v_org_id);

  INSERT INTO exercise_requests (
    org_id, award_id, beneficiary_id, request_number,
    units_to_exercise, exercise_price_per_unit,
    fmv_per_unit_at_request,
    status, requested_at, beneficiary_notes, payment_method,
    tax_simulation_snapshot
  )
  VALUES (
    v_org_id, p_award_id, v_beneficiary_id, v_request_number,
    p_units_to_exercise, v_award.exercise_price,
    v_fmv,
    'PENDING', now(), p_beneficiary_notes, p_payment_method,
    p_tax_simulation
  )
  RETURNING id INTO v_exercise_id;

  SELECT id INTO v_workflow_id
    FROM approval_workflows
   WHERE org_id = v_org_id
     AND applies_to = 'EXERCISE_REQUEST'
     AND is_active = true
     AND deleted_at IS NULL
     AND (
       v_plan.plan_type = ANY(plan_type_filter)
       OR plan_type_filter IS NULL
     )
   ORDER BY (plan_type_filter IS NOT NULL) DESC, is_default DESC
   LIMIT 1;

  IF v_workflow_id IS NULL THEN
    RAISE EXCEPTION 'No EXERCISE_REQUEST workflow configured for org %', v_org_id;
  END IF;

  v_approval_request_id := start_approval_workflow_for_exercise(
    v_exercise_id, v_workflow_id, v_total_amount
  );

  UPDATE exercise_requests
     SET approval_request_id = v_approval_request_id
   WHERE id = v_exercise_id;

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'exercise.requested', 'exercise_request', v_exercise_id,
    jsonb_build_object(
      'award_id', p_award_id,
      'units_to_exercise', p_units_to_exercise,
      'total_amount', v_total_amount,
      'fmv_at_request', v_fmv,
      'units_source', v_units_source
    )
  );

  RETURN jsonb_build_object(
    'exercise_request_id', v_exercise_id,
    'request_number', v_request_number,
    'approval_request_id', v_approval_request_id,
    'total_amount', v_total_amount,
    'fmv_per_unit_at_request', v_fmv,
    'status', 'PENDING',
    'units_source', v_units_source
  );
END $function$;
