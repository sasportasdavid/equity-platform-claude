-- =============================================================================
-- Module 14 — Fix cross-org leak (Bug #6 sprint 6 mai 2026 PM)
-- =============================================================================
--
-- Bug observé en prod : un award pouvait être inséré avec un
-- beneficiary_id appartenant à une autre organisation que celle du JWT
-- actif. Confirmé en DB : AWD-2026-0012 (org Capiwise) avait Julien Roy
-- (org Paragraphe). Cf. SPRINT_6_MAI_AM_BUGS_PROD.md §"BUG #6".
--
-- Cause : la fonction create_award_full() est SECURITY DEFINER et bypasse
-- donc les policies RLS sur public.beneficiaries. Elle validait bien
-- plan.org_id = current_org_id() mais PAS beneficiary.org_id. Si un
-- beneficiary_id cross-org arrivait dans le payload (cache stale du
-- combobox React Query lors d'un switch d'org, race condition…), l'INSERT
-- était accepté.
--
-- Ce fix ajoute la validation manquante dans la RPC. Les Server Actions
-- (Bug #6 couche 2) et le frontend (couche 3) ajoutent une defense-in-depth
-- supplémentaire mais c'est CETTE MIGRATION qui est la source de vérité.
--
-- bulk_create_awards() délègue à create_award_full() pour chaque row, donc
-- la protection se propage automatiquement aux imports CSV.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_award_full(p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id          UUID := auth.uid();
  v_org_id           UUID := current_org_id();
  v_plan_id          UUID := (p_data->>'planId')::UUID;
  v_beneficiary_id   UUID := NULLIF(p_data->>'beneficiaryId', '')::UUID;
  v_beneficiary_org  UUID;
  v_award_id         UUID;
  v_award_number     TEXT;
  v_plan_record      RECORD;
  v_vesting_snap     JSONB;
  v_conditions_snap  JSONB;
  v_leavers_snap     JSONB;
  v_initial_status   TEXT := COALESCE(p_data->>'initialStatus', 'DRAFT');
BEGIN
  -- Auth + org + permission
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié ou org active manquante';
  END IF;

  IF NOT user_has_permission('awards.propose') THEN
    RAISE EXCEPTION 'Permission denied : awards.propose requise';
  END IF;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'planId requis';
  END IF;

  -- Charger le plan (RLS plans.read filtre à l'org active mais on est
  -- SECURITY DEFINER donc on ré-applique le filtre explicite)
  SELECT * INTO v_plan_record
    FROM plans
   WHERE id = v_plan_id
     AND org_id = v_org_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % introuvable ou non accessible dans l''org %', v_plan_id, v_org_id;
  END IF;

  -- ⚠️ FIX Bug #6 : valider l'org du beneficiary AVANT d'insérer.
  -- Sans ce check, RLS ne nous protège pas (SECURITY DEFINER bypass).
  IF v_beneficiary_id IS NOT NULL THEN
    SELECT org_id INTO v_beneficiary_org
      FROM beneficiaries
     WHERE id = v_beneficiary_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Beneficiary % introuvable ou supprimé', v_beneficiary_id;
    END IF;

    IF v_beneficiary_org <> v_org_id THEN
      RAISE EXCEPTION 'TENANT_VIOLATION: beneficiary % belongs to org %, expected org %',
        v_beneficiary_id, v_beneficiary_org, v_org_id
        USING ERRCODE = 'P0001',
              HINT = 'Verify active_org_id in JWT matches beneficiary org_id';
    END IF;
  END IF;

  -- Build snapshot vesting (schedule + tranches)
  SELECT jsonb_build_object(
    'schedule', row_to_json(vs)::jsonb,
    'tranches', COALESCE(
      (SELECT jsonb_agg(row_to_json(vt)::jsonb ORDER BY vt.sort_order)
         FROM vesting_tranches vt
        WHERE vt.schedule_id = vs.id),
      '[]'::jsonb
    )
  ) INTO v_vesting_snap
  FROM vesting_schedules vs
  WHERE vs.plan_id = v_plan_id
  LIMIT 1;

  -- Build snapshot performance_conditions
  SELECT COALESCE(jsonb_agg(row_to_json(pc)::jsonb ORDER BY pc.created_at), '[]'::jsonb)
    INTO v_conditions_snap
    FROM performance_conditions pc
   WHERE pc.plan_id = v_plan_id;

  -- Build snapshot early_termination_rules
  SELECT COALESCE(jsonb_agg(row_to_json(etr)::jsonb ORDER BY etr.leaver_type), '[]'::jsonb)
    INTO v_leavers_snap
    FROM early_termination_rules etr
   WHERE etr.plan_id = v_plan_id;

  -- Numérotation atomique
  v_award_number := next_award_number(v_org_id);

  -- INSERT award
  INSERT INTO awards (
    org_id, plan_id, beneficiary_id, award_number,
    units_granted, exercise_price,
    grant_date, vesting_start_date, expiry_date, acceptance_deadline,
    status,
    plan_version,
    vesting_schedule_snapshot, performance_conditions_snapshot, leaver_rules_snapshot,
    created_by
  ) VALUES (
    v_org_id, v_plan_id, v_beneficiary_id, v_award_number,
    (p_data->>'unitsGranted')::BIGINT,
    NULLIF(p_data->>'exercisePrice', '')::NUMERIC,
    (p_data->>'grantDate')::DATE,
    NULLIF(p_data->>'vestingStartDate', '')::DATE,
    NULLIF(p_data->>'expiryDate', '')::DATE,
    NULLIF(p_data->>'acceptanceDeadline', '')::DATE,
    v_initial_status,
    v_plan_record.version,
    v_vesting_snap, v_conditions_snap, v_leavers_snap,
    v_user_id
  )
  RETURNING id INTO v_award_id;

  -- Audit
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'award.created', 'AWARD', v_award_id,
    jsonb_build_object(
      'award_number', v_award_number,
      'plan_id', v_plan_id,
      'beneficiary_id', v_beneficiary_id,
      'units_granted', (p_data->>'unitsGranted')::BIGINT,
      'initial_status', v_initial_status
    )
  );

  RETURN v_award_id;
END $$;

COMMENT ON FUNCTION create_award_full(JSONB) IS
  'Module 3b B1 (extended Module 14 fix cross-org leak) — Crée un award avec snapshots JSONB figés (vesting + conditions + leavers). Audit + permission check + tenant guard sur plan ET beneficiary. Cf. server/actions/awards.ts.';
