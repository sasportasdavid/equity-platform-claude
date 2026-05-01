-- Module 8 B4 — Étend simulate_leaver_scenario pour gérer le treatment
-- 'full_accelerate' (présent en DB sur les leaver_rules réels mais non
-- implémenté en B1).
--
-- Recon B4 a révélé 5 treatments distincts en DB :
--   - forfeit_all       (B1 OK)
--   - keep_vested       (B1 OK)
--   - pro_rata          (B1 OK, alias keep_vested V1)
--   - accelerate        (B1 OK avec acceleration_months)
--   - full_accelerate   (B1 KO → safety net forfeit_all)
--
-- Sémantique 'full_accelerate' (cf wizard Step5Leavers Module 3a) :
-- TOUTES les unités non encore acquises au moment du départ sont
-- considérées comme acquises immédiatement, indépendamment du calendrier.
-- Typique pour 'company_sale' / 'death' (cas où la société accorde
-- l'intégralité des droits).
--
-- Différence avec 'accelerate' :
--   - 'accelerate' : seules les tranches dans
--     [termination_date, termination_date + acceleration_months] sont
--     accélérées (acceleration partielle)
--   - 'full_accelerate' : toutes les tranches futures sont accélérées
--     (acceleration totale, ignore acceleration_months)
--
-- Aucune autre logique n'est modifiée. Le branch 'full_accelerate' est
-- ajouté entre 'accelerate' et le safety net.

CREATE OR REPLACE FUNCTION public.simulate_leaver_scenario(
  p_award_id UUID,
  p_leaver_type TEXT,
  p_termination_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id              UUID := auth.uid();
  v_beneficiary_id       UUID;
  v_award                public.awards%ROWTYPE;
  v_plan_type            TEXT;
  v_leaver_rule          JSONB;
  v_treatment            TEXT;
  v_acceleration_months  INTEGER := 0;
  v_exercise_window_days INTEGER := 0;
  v_units_already_vested BIGINT  := 0;
  v_units_accelerated    BIGINT  := 0;
  v_units_forfeited      BIGINT  := 0;
  v_exercise_deadline    DATE;
  v_vesting_events_count INTEGER;
  v_used_snapshot_fallback BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_beneficiary_id
    FROM public.beneficiaries
   WHERE user_id = v_user_id AND deleted_at IS NULL;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_award
    FROM public.awards
   WHERE id = p_award_id
     AND beneficiary_id = v_beneficiary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT plan_type INTO v_plan_type
    FROM public.plans WHERE id = v_award.plan_id;

  SELECT rule INTO v_leaver_rule
    FROM jsonb_array_elements(v_award.leaver_rules_snapshot) rule
   WHERE rule->>'leaver_type' = p_leaver_type
   LIMIT 1;

  IF v_leaver_rule IS NULL THEN
    v_treatment := 'forfeit_all';
  ELSE
    v_treatment            := v_leaver_rule->>'treatment';
    v_acceleration_months  := COALESCE((v_leaver_rule->>'acceleration_months')::INTEGER, 0);
    v_exercise_window_days := COALESCE((v_leaver_rule->>'exercise_window_days')::INTEGER, 0);
  END IF;

  SELECT COUNT(*) INTO v_vesting_events_count
    FROM public.vesting_events WHERE award_id = p_award_id;

  IF v_vesting_events_count > 0 THEN
    SELECT COALESCE(SUM(units_vested), 0) INTO v_units_already_vested
      FROM public.vesting_events
     WHERE award_id = p_award_id
       AND status = 'VESTED'
       AND scheduled_date <= p_termination_date;
  ELSE
    v_used_snapshot_fallback := true;
    SELECT COALESCE(
      SUM(((tranche->>'percentage_of_award')::NUMERIC * v_award.units_granted / 100)::BIGINT),
      0
    ) INTO v_units_already_vested
      FROM jsonb_array_elements(
        COALESCE(v_award.vesting_schedule_snapshot->'tranches', '[]'::jsonb)
      ) tranche
     WHERE (tranche->>'vesting_date')::DATE <= p_termination_date;
  END IF;

  IF v_units_already_vested > v_award.units_granted THEN
    v_units_already_vested := v_award.units_granted;
  END IF;

  IF v_treatment = 'forfeit_all' THEN
    v_units_forfeited      := v_award.units_granted;
    v_units_already_vested := 0;
    v_units_accelerated    := 0;
  ELSIF v_treatment = 'keep_vested' OR v_treatment = 'pro_rata' THEN
    v_units_forfeited   := v_award.units_granted - v_units_already_vested;
    v_units_accelerated := 0;
  ELSIF v_treatment = 'accelerate' THEN
    IF v_vesting_events_count > 0 THEN
      SELECT COALESCE(SUM(units_to_vest), 0) INTO v_units_accelerated
        FROM public.vesting_events
       WHERE award_id = p_award_id
         AND status = 'PENDING'
         AND scheduled_date >  p_termination_date
         AND scheduled_date <= p_termination_date + (v_acceleration_months || ' months')::INTERVAL;
    ELSE
      SELECT COALESCE(
        SUM(((tranche->>'percentage_of_award')::NUMERIC * v_award.units_granted / 100)::BIGINT),
        0
      ) INTO v_units_accelerated
        FROM jsonb_array_elements(
          COALESCE(v_award.vesting_schedule_snapshot->'tranches', '[]'::jsonb)
        ) tranche
       WHERE (tranche->>'vesting_date')::DATE >  p_termination_date
         AND (tranche->>'vesting_date')::DATE <= p_termination_date + (v_acceleration_months || ' months')::INTERVAL;
    END IF;
    v_units_forfeited := v_award.units_granted - v_units_already_vested - v_units_accelerated;
  ELSIF v_treatment = 'full_accelerate' THEN
    -- TOUTES les unités non acquises sont accélérées (ignore acceleration_months).
    v_units_accelerated := v_award.units_granted - v_units_already_vested;
    IF v_units_accelerated < 0 THEN v_units_accelerated := 0; END IF;
    v_units_forfeited   := 0;
  ELSE
    -- Safety net : treatment inconnu → on traite comme forfeit_all
    v_treatment            := 'forfeit_all';
    v_units_forfeited      := v_award.units_granted;
    v_units_already_vested := 0;
    v_units_accelerated    := 0;
  END IF;

  IF v_units_forfeited < 0 THEN v_units_forfeited := 0; END IF;

  IF v_plan_type IN ('BSPCE','STOCK_OPTION','BSA') AND v_exercise_window_days > 0 THEN
    v_exercise_deadline := p_termination_date + (v_exercise_window_days || ' days')::INTERVAL;
  ELSE
    v_exercise_deadline := NULL;
  END IF;

  RETURN jsonb_build_object(
    'leaver_type',              p_leaver_type,
    'termination_date',         p_termination_date,
    'treatment',                v_treatment,
    'units_granted',            v_award.units_granted,
    'units_already_vested',     v_units_already_vested,
    'units_accelerated',        v_units_accelerated,
    'units_forfeited',          v_units_forfeited,
    'units_total_after_leave',  v_units_already_vested + v_units_accelerated,
    'exercise_window_days',     v_exercise_window_days,
    'exercise_deadline',        v_exercise_deadline,
    'acceleration_months',      v_acceleration_months,
    'used_snapshot_fallback',   v_used_snapshot_fallback
  );
END $$;

GRANT EXECUTE ON FUNCTION public.simulate_leaver_scenario(UUID, TEXT, DATE) TO authenticated;
