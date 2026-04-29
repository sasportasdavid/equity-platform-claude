-- =============================================================================
-- Module 3b — sous-module B1.2 : RPCs create_award_full + materialize + bulk
-- =============================================================================
--
-- 3 RPCs SECURITY DEFINER pour la création d'awards et la matérialisation
-- des vesting_events :
--
--   1. create_award_full(p_data JSONB) → UUID
--      Insère 1 award avec snapshots (vesting + conditions + leavers)
--      figés au moment de la création. Atomique.
--
--   2. materialize_vesting_events(p_award_id UUID) → INTEGER
--      Génère N rows dans vesting_events à partir du snapshot vesting.
--      Idempotent (skip si déjà matérialisé). Drift correction sur la
--      dernière tranche pour SUM = units_granted exact.
--
--   3. bulk_create_awards(p_rows JSONB) → JSONB { created: int, errors: array }
--      Wrap N appels à create_award_full dans une transaction atomique.
--      Rollback total si une seule row échoue. Limite 500 rows.
--
-- Tous les checks de permission/auth/org sont faits par les RPCs (pas
-- besoin de duplicater côté Server Action).
--
-- Note audit : la table audit_events utilise `user_id` (pas `actor_id`
-- comme dans la spec — divergence DB/spec déjà observée en Module 3a).
--
-- Cf. memory/module_3b_b1_recon.md pour les écarts vs spec.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_award_full
-- ---------------------------------------------------------------------------

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

  -- Charger le plan (RLS plans.read filtre à l'org active)
  SELECT * INTO v_plan_record
    FROM plans
   WHERE id = v_plan_id
     AND org_id = v_org_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % introuvable ou non accessible dans l''org %', v_plan_id, v_org_id;
  END IF;

  -- Build snapshot vesting (schedule + tranches)
  -- Important : si le plan n'a pas de vesting_schedule (cas dégénéré), snapshot null.
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

  -- Audit (note : audit_events.user_id, pas actor_id comme dans la spec)
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

GRANT EXECUTE ON FUNCTION create_award_full(JSONB) TO authenticated;

COMMENT ON FUNCTION create_award_full(JSONB) IS
  'Module 3b B1 — Crée un award avec snapshots JSONB figés (vesting + conditions + leavers). Audit + permission check intégrés. Cf. server/actions/awards.ts (à venir B2).';

-- ---------------------------------------------------------------------------
-- 2. materialize_vesting_events
-- ---------------------------------------------------------------------------
-- Idempotent : skip si l'award a déjà des vesting_events.
-- Drift correction : la dernière tranche absorbe l'écart d'arrondi pour
-- garantir SUM(units_to_vest) = units_granted exact.

CREATE OR REPLACE FUNCTION materialize_vesting_events(p_award_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_award          RECORD;
  v_tranche        JSONB;
  v_count          INTEGER := 0;
  v_units          BIGINT;
  v_total_alloc    BIGINT := 0;
  v_total_tranches INTEGER;
  v_last_event_id  UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % introuvable', p_award_id;
  END IF;

  -- Idempotence : si déjà matérialisé, return 0
  IF EXISTS (SELECT 1 FROM vesting_events WHERE award_id = p_award_id) THEN
    RETURN 0;
  END IF;

  IF v_award.vesting_schedule_snapshot IS NULL
     OR v_award.vesting_schedule_snapshot->'tranches' IS NULL
     OR jsonb_array_length(v_award.vesting_schedule_snapshot->'tranches') = 0
  THEN
    RAISE EXCEPTION 'Award % n''a pas de vesting_schedule_snapshot.tranches', p_award_id;
  END IF;

  v_total_tranches := jsonb_array_length(v_award.vesting_schedule_snapshot->'tranches');

  -- Boucle sur les tranches du snapshot
  FOR v_tranche IN
    SELECT jsonb_array_elements(v_award.vesting_schedule_snapshot->'tranches')
  LOOP
    -- Calcul du nombre d'unités pour cette tranche (round)
    v_units := round(v_award.units_granted *
                     COALESCE((v_tranche->>'percentage_of_award')::NUMERIC,
                              (v_tranche->>'percentage')::NUMERIC, 0) / 100);
    v_total_alloc := v_total_alloc + v_units;

    INSERT INTO vesting_events (
      org_id, award_id, tranche_id, scheduled_date, units_to_vest, status
    ) VALUES (
      v_award.org_id,
      p_award_id,
      NULLIF(v_tranche->>'id', '')::UUID,
      (v_tranche->>'vesting_date')::DATE,
      v_units,
      'PENDING'
    )
    RETURNING id INTO v_last_event_id;

    v_count := v_count + 1;
  END LOOP;

  -- Drift correction : la dernière tranche absorbe l'écart d'arrondi
  IF v_total_alloc <> v_award.units_granted AND v_last_event_id IS NOT NULL THEN
    UPDATE vesting_events
       SET units_to_vest = units_to_vest + (v_award.units_granted - v_total_alloc)
     WHERE id = v_last_event_id;
  END IF;

  -- Audit
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_award.org_id, auth.uid(), 'award.vesting_materialized', 'AWARD', p_award_id,
    jsonb_build_object('events_count', v_count, 'total_units', v_award.units_granted)
  );

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION materialize_vesting_events(UUID) TO authenticated;

COMMENT ON FUNCTION materialize_vesting_events(UUID) IS
  'Module 3b B1 — Génère N vesting_events à partir du vesting_schedule_snapshot d''un award. Idempotent + drift correction sur la dernière tranche. À appeler à GRANTED.';

-- ---------------------------------------------------------------------------
-- 3. bulk_create_awards
-- ---------------------------------------------------------------------------
-- Wrap N appels create_award_full dans une seule transaction. Si UNE row
-- échoue, ROLLBACK total via une exception. Limite 500 rows.

CREATE OR REPLACE FUNCTION bulk_create_awards(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_org_id       UUID := current_org_id();
  v_row          JSONB;
  v_award_id     UUID;
  v_created_ids  UUID[] := ARRAY[]::UUID[];
  v_count        INTEGER := 0;
  v_idx          INTEGER := 0;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié ou org active manquante';
  END IF;

  IF NOT user_has_permission('awards.bulk_import') THEN
    RAISE EXCEPTION 'Permission denied : awards.bulk_import requise';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows doit être un array JSONB';
  END IF;

  IF jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'p_rows vide — au moins 1 row requise';
  END IF;

  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'p_rows dépasse 500 rows (got %)', jsonb_array_length(p_rows);
  END IF;

  -- Boucle séquentielle. Si UNE row échoue, l'exception remonte et la
  -- transaction est rollback (atomicité totale).
  FOR v_row IN SELECT jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    BEGIN
      v_award_id := create_award_full(v_row);
      v_created_ids := v_created_ids || v_award_id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'bulk_create_awards row #% failed: %', v_idx, SQLERRM
        USING ERRCODE = SQLSTATE;
    END;
  END LOOP;

  -- Audit du bulk
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'award.bulk_imported', 'AWARD', NULL,
    jsonb_build_object('count', v_count, 'award_ids', to_jsonb(v_created_ids))
  );

  RETURN jsonb_build_object(
    'created', v_count,
    'award_ids', to_jsonb(v_created_ids)
  );
END $$;

GRANT EXECUTE ON FUNCTION bulk_create_awards(JSONB) TO authenticated;

COMMENT ON FUNCTION bulk_create_awards(JSONB) IS
  'Module 3b B1 — Bulk insert atomique d''awards via N appels create_award_full. Limite 500 rows. Rollback total si une seule row échoue.';
