-- =============================================================================
-- Module 3a — sous-module B3 : RPC duplicate_plan_full
-- =============================================================================
--
-- Duplique un plan existant en cascade dans toutes ses tables liées,
-- atomiquement. Le nouveau plan :
--   - est rattaché à la même org / company que le source
--   - hérite de parent_plan_id = source.id (lineage versions)
--   - démarre en status='DRAFT', is_locked=false
--   - hérite version = source.version + 1
--   - copie : vesting_schedule + tranches, performance_conditions,
--             early_termination_rules, hypothesis_sets (le DERNIER seulement,
--             les autres c'est de l'historique d'études), volatility_schemes,
--             simulation_configs
--   - NE copie PAS : valuation_runs, valuation_results, ifrs2_*, plan_drafts
--     (ces objets sont liés à la lifecycle du plan source, pas du clone)
--
-- Sécurité : SECURITY DEFINER + check explicite `user_has_permission('plans.create')`.
-- L'utilisateur doit aussi avoir accès au plan source (RLS plans.read côté
-- SELECT de la première étape).
--
-- Atomicité : tout dans la transaction implicite de l'appel RPC. Si la
-- copie de la chaîne échoue à mi-parcours, rollback total — pas de plan
-- orphelin partiellement copié.
-- =============================================================================

CREATE OR REPLACE FUNCTION duplicate_plan_full(
  p_source_plan_id UUID,
  p_new_name       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id          UUID := auth.uid();
  v_source           plans%ROWTYPE;
  v_new_plan_id      UUID;
  v_new_version      INTEGER;
  v_new_name         TEXT;
  v_new_vesting_id   UUID;
  v_source_vesting   vesting_schedules%ROWTYPE;
  v_new_hypo_id      UUID;
  v_source_hypo      hypothesis_sets%ROWTYPE;
BEGIN
  -- ===========================================================================
  -- 1. Auth + permission
  -- ===========================================================================
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT user_has_permission('plans.create') THEN
    RAISE EXCEPTION 'Permission denied : plans.create requise';
  END IF;

  -- ===========================================================================
  -- 2. Charger le plan source (RLS plans.read filtre à l'org active)
  -- ===========================================================================
  SELECT * INTO v_source FROM plans
   WHERE id = p_source_plan_id
     AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Plan source introuvable ou non accessible (id=%)', p_source_plan_id;
  END IF;

  -- ===========================================================================
  -- 3. Calculer la nouvelle version (max version du lineage + 1)
  --    Lineage = plan source + ses descendants (ceux dont parent_plan_id = source).
  --    On part de la racine du lineage si source a déjà un parent.
  -- ===========================================================================
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
    FROM plans
   WHERE (id = COALESCE(v_source.parent_plan_id, v_source.id)
       OR parent_plan_id = COALESCE(v_source.parent_plan_id, v_source.id))
     AND deleted_at IS NULL;

  v_new_name := COALESCE(NULLIF(p_new_name, ''), v_source.name || ' (copie v' || v_new_version || ')');

  -- ===========================================================================
  -- 4. INSERT plan dupliqué
  -- ===========================================================================
  INSERT INTO plans (
    org_id, company_id, parent_plan_id, version, name, description,
    plan_type, settlement_type, status, is_locked,
    pool_size, pool_allocated, pool_vested, pool_exercised, pool_cancelled,
    exercise_price, reference_share_price,
    board_date, grant_date,
    shareholder_meeting_date, shareholder_authorization_expires_at,
    performance_combination_type, performance_evaluation_moment, performance_failure_action,
    compliance_warnings,
    created_by
  ) VALUES (
    v_source.org_id, v_source.company_id,
    COALESCE(v_source.parent_plan_id, v_source.id), -- lineage stable à la racine
    v_new_version, v_new_name, v_source.description,
    v_source.plan_type, v_source.settlement_type, 'DRAFT', false,
    v_source.pool_size, 0, 0, 0, 0,                  -- compteurs reset à 0
    v_source.exercise_price, v_source.reference_share_price,
    v_source.board_date, v_source.grant_date,
    v_source.shareholder_meeting_date, v_source.shareholder_authorization_expires_at,
    v_source.performance_combination_type, v_source.performance_evaluation_moment,
    v_source.performance_failure_action,
    '[]'::jsonb,                                     -- compliance_warnings reset
    v_user_id
  ) RETURNING id INTO v_new_plan_id;

  -- ===========================================================================
  -- 5. Copy vesting_schedule + tranches (1 schedule par plan max)
  -- ===========================================================================
  SELECT * INTO v_source_vesting FROM vesting_schedules WHERE plan_id = p_source_plan_id LIMIT 1;
  IF v_source_vesting.id IS NOT NULL THEN
    INSERT INTO vesting_schedules (
      plan_id, vesting_type, cliff_months, cliff_percentage,
      total_months, frequency, linear_after_cliff, single_vesting_date
    ) VALUES (
      v_new_plan_id, v_source_vesting.vesting_type,
      v_source_vesting.cliff_months, v_source_vesting.cliff_percentage,
      v_source_vesting.total_months, v_source_vesting.frequency,
      v_source_vesting.linear_after_cliff, v_source_vesting.single_vesting_date
    ) RETURNING id INTO v_new_vesting_id;

    INSERT INTO vesting_tranches (vesting_schedule_id, sort_order, vesting_date, percentage_of_award)
    SELECT v_new_vesting_id, sort_order, vesting_date, percentage_of_award
      FROM vesting_tranches
     WHERE vesting_schedule_id = v_source_vesting.id;
  END IF;

  -- ===========================================================================
  -- 6. Copy performance_conditions
  -- ===========================================================================
  INSERT INTO performance_conditions (
    plan_id, name, condition_type, category, weight, enable_partial_scoring,
    metric, target_value, target_unit, comparison_operator,
    threshold_min, threshold_max,
    market_metric_type, reference_index, reference_index_display_name,
    comparison_method, measurement_period_years,
    performance_start_date, performance_end_date,
    start_price_method, end_price_method,
    start_fixed_price, end_fixed_price,
    start_averaging_days, end_averaging_days,
    peer_group, weighted_peer_groups, acquisition_scale
  )
  SELECT v_new_plan_id, name, condition_type, category, weight, enable_partial_scoring,
         metric, target_value, target_unit, comparison_operator,
         threshold_min, threshold_max,
         market_metric_type, reference_index, reference_index_display_name,
         comparison_method, measurement_period_years,
         performance_start_date, performance_end_date,
         start_price_method, end_price_method,
         start_fixed_price, end_fixed_price,
         start_averaging_days, end_averaging_days,
         peer_group, weighted_peer_groups, acquisition_scale
    FROM performance_conditions
   WHERE plan_id = p_source_plan_id;

  -- ===========================================================================
  -- 7. Copy early_termination_rules
  -- ===========================================================================
  INSERT INTO early_termination_rules (
    plan_id, leaver_type, treatment, acceleration_months, exercise_window_days
  )
  SELECT v_new_plan_id, leaver_type, treatment, acceleration_months, exercise_window_days
    FROM early_termination_rules
   WHERE plan_id = p_source_plan_id;

  -- ===========================================================================
  -- 8. Copy DERNIÈRE hypothesis_set + volatility_scheme + simulation_config
  --    On ne copie pas l'historique (les hypos précédentes sont des études
  --    figées propres au plan source).
  -- ===========================================================================
  SELECT * INTO v_source_hypo
    FROM hypothesis_sets
   WHERE plan_id = p_source_plan_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_source_hypo.id IS NOT NULL THEN
    INSERT INTO hypothesis_sets (
      plan_id, as_of_date, s0, rate_flat, dividend_yield,
      vol_method, ticker_override, currency, volatility,
      underlying_model, model_choice, time_horizon_years
    ) VALUES (
      v_new_plan_id, v_source_hypo.as_of_date, v_source_hypo.s0,
      v_source_hypo.rate_flat, v_source_hypo.dividend_yield,
      v_source_hypo.vol_method, v_source_hypo.ticker_override, v_source_hypo.currency,
      v_source_hypo.volatility, v_source_hypo.underlying_model, v_source_hypo.model_choice,
      v_source_hypo.time_horizon_years
    ) RETURNING id INTO v_new_hypo_id;

    INSERT INTO volatility_schemes (
      hypothesis_set_id, method, annualized_sigma, lookback_period_days,
      heston_params, jump_params
    )
    SELECT v_new_hypo_id, method, annualized_sigma, lookback_period_days,
           heston_params, jump_params
      FROM volatility_schemes
     WHERE hypothesis_set_id = v_source_hypo.id
     LIMIT 1;

    INSERT INTO simulation_configs (
      hypothesis_set_id, num_paths, steps_per_year, time_horizon_years, antithetic_variates
    )
    SELECT v_new_hypo_id, num_paths, steps_per_year, time_horizon_years, antithetic_variates
      FROM simulation_configs
     WHERE hypothesis_set_id = v_source_hypo.id
     LIMIT 1;
  END IF;

  -- ===========================================================================
  -- 9. Audit + return
  -- ===========================================================================
  -- Note : audit_events est aussi loggé côté Server Action ; redondant ici
  -- mais utile si un jour la fonction est appelée hors Server Action.
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_source.org_id, v_user_id, 'plan.duplicated', 'PLAN', v_new_plan_id,
    jsonb_build_object('source_plan_id', p_source_plan_id, 'new_version', v_new_version)
  );

  RETURN jsonb_build_object(
    'plan_id', v_new_plan_id,
    'version', v_new_version
  );
END;
$$;

GRANT EXECUTE ON FUNCTION duplicate_plan_full(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION duplicate_plan_full(UUID, TEXT) IS
  'Module 3a B3 — Duplique un plan en cascade atomique. Le nouveau plan part en DRAFT/v+1 du même lineage. Ne copie pas les valuation_runs / ifrs2_* (lifecycle propre). Cf. server/actions/plan-mutations.ts duplicatePlan().';
