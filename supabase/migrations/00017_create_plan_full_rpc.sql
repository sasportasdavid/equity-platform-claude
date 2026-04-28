-- =============================================================================
-- Module 3a — sous-module B2 : RPC create_plan_full
-- =============================================================================
--
-- Crée un plan complet en cascade dans 6 tables (7 si on compte le auto-create
-- de la company) atomiquement. Si une étape échoue, tout est rollback car la
-- fonction PL/pgSQL roule dans la transaction implicite de l'appel RPC.
--
-- Ordre d'insertion :
--   1. (auto) companies — si org sans company, en crée une avec le nom de l'org
--   2. plans
--   3. vesting_schedules (1 par plan, FK vers plans)
--   4. vesting_tranches (N par schedule, mode `tranches` uniquement)
--   5. performance_conditions (N par plan, mode `hasPerformanceConditions`)
--   6. early_termination_rules (N par plan, depuis leaverRules)
--   7. hypothesis_sets (1 par plan)
--   8. volatility_schemes (1 par hypothesis_set)
--   9. simulation_configs (1 par hypothesis_set)
--
-- Sécurité : SECURITY DEFINER + check explicite `user_has_permission('plans.create')`
-- pour bypass RLS sur companies (si auto-create) et garantir l'atomicité totale
-- — l'utilisateur passe sinon par 9 INSERT distincts soumis aux RLS, ce qui
-- multiplie les points de panne et casse l'atomicité.
--
-- Convention payload : tous les champs en `snake_case` (= noms de colonnes DB).
-- Le mapping wizard CamelCase → snake_case est fait côté Server Action
-- (`buildPayloadFor*` dans plans.ts). Cf. memory/module_3a_b1_post_check.md
-- écarts 2 + 3 pour la liste exhaustive des renommages requis.
--
-- Note écart 5 (memory b1_post_check) : on n'écrit PAS dans valuation_runs
-- ici. valuation_runs est créé dynamiquement par runValuation (Module 3a §4.3,
-- livré en B5).
-- =============================================================================

CREATE OR REPLACE FUNCTION create_plan_full(
  p_org_id UUID,
  p_company_id UUID,
  p_plan_data JSONB,
  p_vesting JSONB,
  p_conditions JSONB,
  p_leaver_rules JSONB,
  p_hypothesis JSONB,
  p_volatility JSONB,
  p_simulation JSONB,
  p_compliance_warnings JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id           UUID := auth.uid();
  v_org_name          TEXT;
  v_company_id        UUID := p_company_id;
  v_plan_id           UUID;
  v_vesting_id        UUID;
  v_hypothesis_id     UUID;
  v_volatility_id     UUID;
  v_simulation_id     UUID;
  v_tranche           JSONB;
  v_condition         JSONB;
  v_leaver            JSONB;
  v_pool_size         BIGINT;
  v_grant_date        DATE;
  v_board_date        DATE;
BEGIN
  -- ===========================================================================
  -- 1. Permission + auth checks
  -- ===========================================================================
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id requis';
  END IF;

  IF NOT user_has_permission('plans.create') THEN
    RAISE EXCEPTION 'Permission denied : plans.create requise';
  END IF;

  -- Vérification membership : l'utilisateur doit appartenir activement à l'org
  -- demandée. Sans ça, un user mal intentionné pourrait passer un p_org_id
  -- d'une autre organisation et y créer des plans (la SECURITY DEFINER
  -- bypasserait les RLS).
  IF NOT EXISTS (
    SELECT 1 FROM memberships
     WHERE user_id = v_user_id AND org_id = p_org_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Membership inactif ou inexistant pour l''org %', p_org_id;
  END IF;

  -- ===========================================================================
  -- 2. Validation sanity du payload
  -- ===========================================================================
  v_pool_size := (p_plan_data->>'pool_size')::BIGINT;
  v_grant_date := (p_plan_data->>'grant_date')::DATE;
  v_board_date := (p_plan_data->>'board_date')::DATE;

  IF p_plan_data->>'name' IS NULL OR length(trim(p_plan_data->>'name')) = 0 THEN
    RAISE EXCEPTION 'plan_data.name requis';
  END IF;
  IF p_plan_data->>'plan_type' IS NULL THEN
    RAISE EXCEPTION 'plan_data.plan_type requis';
  END IF;
  IF v_pool_size IS NULL OR v_pool_size <= 0 THEN
    RAISE EXCEPTION 'plan_data.pool_size doit être > 0';
  END IF;
  IF v_grant_date IS NULL THEN
    RAISE EXCEPTION 'plan_data.grant_date requis';
  END IF;

  -- ===========================================================================
  -- 3. Auto-create company si nécessaire
  -- ===========================================================================
  -- Si Server Action n'a pas pu résoudre une company pour cette org, on en
  -- crée une avec le nom de l'org. C'est un fallback MVP — en production, le
  -- premier flow d'onboarding devra inviter le user à créer une company avec
  -- siren/legal_form/etc. corrects (cf. Module 3b à venir).
  IF v_company_id IS NULL THEN
    SELECT name INTO v_org_name FROM organizations WHERE id = p_org_id;
    IF v_org_name IS NULL THEN
      RAISE EXCEPTION 'Organisation % introuvable', p_org_id;
    END IF;

    INSERT INTO companies (org_id, name, country_code)
    VALUES (p_org_id, v_org_name, 'FR')
    RETURNING id INTO v_company_id;

    RAISE NOTICE '[create_plan_full] auto-created company % for org % (%)',
      v_company_id, v_org_name, p_org_id;
  END IF;

  -- ===========================================================================
  -- 4. INSERT plan
  -- ===========================================================================
  INSERT INTO plans (
    org_id, company_id, name, description, plan_type, settlement_type,
    board_date, shareholder_meeting_date, shareholder_authorization_expires_at,
    grant_date, pool_size, exercise_price, reference_share_price,
    performance_combination_type, performance_evaluation_moment,
    performance_failure_action, status, version, is_locked,
    compliance_warnings, created_by
  )
  VALUES (
    p_org_id,
    v_company_id,
    p_plan_data->>'name',
    p_plan_data->>'description',
    p_plan_data->>'plan_type',
    COALESCE(p_plan_data->>'settlement_type', 'EQUITY'),
    v_board_date,
    NULLIF(p_plan_data->>'shareholder_meeting_date', '')::DATE,
    NULLIF(p_plan_data->>'shareholder_authorization_expires_at', '')::DATE,
    v_grant_date,
    v_pool_size,
    NULLIF(p_plan_data->>'exercise_price', '')::NUMERIC,
    NULLIF(p_plan_data->>'reference_share_price', '')::NUMERIC,
    COALESCE(p_plan_data->>'performance_combination_type', 'WEIGHTED'),
    COALESCE(p_plan_data->>'performance_evaluation_moment', 'END'),
    COALESCE(p_plan_data->>'performance_failure_action', 'FORFEIT'),
    COALESCE(p_plan_data->>'status', 'DRAFT'),
    1,
    false,
    COALESCE(p_compliance_warnings, '[]'::jsonb),
    v_user_id
  )
  RETURNING id INTO v_plan_id;

  RAISE NOTICE '[create_plan_full] created plan % (%) for org %',
    v_plan_id, p_plan_data->>'name', p_org_id;

  -- ===========================================================================
  -- 5. INSERT vesting_schedules + vesting_tranches
  -- ===========================================================================
  IF p_vesting IS NULL OR p_vesting->>'vesting_type' IS NULL THEN
    RAISE EXCEPTION 'p_vesting.vesting_type requis';
  END IF;

  INSERT INTO vesting_schedules (
    org_id, plan_id, vesting_type,
    single_vesting_date, cliff_months, cliff_percentage,
    total_months, linear_after_cliff, frequency
  )
  VALUES (
    p_org_id,
    v_plan_id,
    p_vesting->>'vesting_type',
    NULLIF(p_vesting->>'single_vesting_date', '')::DATE,
    NULLIF(p_vesting->>'cliff_months', '')::INTEGER,
    NULLIF(p_vesting->>'cliff_percentage', '')::NUMERIC,
    NULLIF(p_vesting->>'total_months', '')::INTEGER,
    NULLIF(p_vesting->>'linear_after_cliff', '')::BOOLEAN,
    NULLIF(p_vesting->>'frequency', '')
  )
  RETURNING id INTO v_vesting_id;

  IF p_vesting ? 'tranches' AND jsonb_typeof(p_vesting->'tranches') = 'array' THEN
    FOR v_tranche IN SELECT * FROM jsonb_array_elements(p_vesting->'tranches')
    LOOP
      INSERT INTO vesting_tranches (
        schedule_id, sort_order, vesting_date, percentage_of_award,
        performance_condition_id
      )
      VALUES (
        v_vesting_id,
        COALESCE((v_tranche->>'sort_order')::INTEGER, 0),
        (v_tranche->>'vesting_date')::DATE,
        (v_tranche->>'percentage_of_award')::NUMERIC,
        NULLIF(v_tranche->>'performance_condition_id', '')::UUID
      );
    END LOOP;
  END IF;

  -- ===========================================================================
  -- 6. INSERT performance_conditions
  -- ===========================================================================
  IF p_conditions IS NOT NULL AND jsonb_typeof(p_conditions) = 'array' THEN
    FOR v_condition IN SELECT * FROM jsonb_array_elements(p_conditions)
    LOOP
      INSERT INTO performance_conditions (
        org_id, plan_id, name, condition_type, category, weight,
        enable_partial_scoring,
        performance_start_date, performance_end_date,
        metric, target_value, target_unit, comparison_operator,
        threshold_min, threshold_max,
        market_metric_type, reference_index, reference_index_display_name,
        comparison_method, measurement_period_years,
        start_price_method, start_fixed_price, start_averaging_days,
        end_price_method, end_fixed_price, end_averaging_days,
        peer_group, weighted_peer_groups, acquisition_scale
      )
      VALUES (
        p_org_id,
        v_plan_id,
        v_condition->>'name',
        v_condition->>'condition_type',
        v_condition->>'category',
        NULLIF(v_condition->>'weight', '')::NUMERIC,
        COALESCE((v_condition->>'enable_partial_scoring')::BOOLEAN, true),
        NULLIF(v_condition->>'performance_start_date', '')::DATE,
        NULLIF(v_condition->>'performance_end_date', '')::DATE,
        NULLIF(v_condition->>'metric', ''),
        NULLIF(v_condition->>'target_value', ''),
        NULLIF(v_condition->>'target_unit', ''),
        NULLIF(v_condition->>'comparison_operator', ''),
        NULLIF(v_condition->>'threshold_min', '')::NUMERIC,
        NULLIF(v_condition->>'threshold_max', '')::NUMERIC,
        NULLIF(v_condition->>'market_metric_type', ''),
        NULLIF(v_condition->>'reference_index', ''),
        NULLIF(v_condition->>'reference_index_display_name', ''),
        NULLIF(v_condition->>'comparison_method', ''),
        NULLIF(v_condition->>'measurement_period_years', '')::NUMERIC,
        NULLIF(v_condition->>'start_price_method', ''),
        NULLIF(v_condition->>'start_fixed_price', '')::NUMERIC,
        NULLIF(v_condition->>'start_averaging_days', '')::INTEGER,
        NULLIF(v_condition->>'end_price_method', ''),
        NULLIF(v_condition->>'end_fixed_price', '')::NUMERIC,
        NULLIF(v_condition->>'end_averaging_days', '')::INTEGER,
        v_condition->'peer_group',
        v_condition->'weighted_peer_groups',
        v_condition->'acquisition_scale'
      );
    END LOOP;
  END IF;

  -- ===========================================================================
  -- 7. INSERT early_termination_rules
  -- ===========================================================================
  IF p_leaver_rules IS NOT NULL AND jsonb_typeof(p_leaver_rules) = 'array' THEN
    FOR v_leaver IN SELECT * FROM jsonb_array_elements(p_leaver_rules)
    LOOP
      INSERT INTO early_termination_rules (
        org_id, plan_id, leaver_type, treatment,
        acceleration_months, exercise_window_days, custom_logic
      )
      VALUES (
        p_org_id,
        v_plan_id,
        v_leaver->>'leaver_type',
        v_leaver->>'treatment',
        NULLIF(v_leaver->>'acceleration_months', '')::INTEGER,
        NULLIF(v_leaver->>'exercise_window_days', '')::INTEGER,
        v_leaver->'custom_logic'
      );
    END LOOP;
  END IF;

  -- ===========================================================================
  -- 8. INSERT hypothesis_sets
  -- ===========================================================================
  -- Cf. memory/module_3a_b1_post_check.md écart 3 : le mapping camelCase →
  -- snake_case est fait côté Server Action. Ici on lit directement les noms
  -- de colonnes finaux (s0, rate_flat, ticker_override).
  IF p_hypothesis IS NOT NULL THEN
    INSERT INTO hypothesis_sets (
      org_id, plan_id, company_id, as_of_date,
      s0, rate_flat, dividend_yield, vol_method, ticker_override, currency,
      multi_asset_params,
      volatility, volatility_price_type, volatility_winsorizing_pct,
      dividend_input_mode, dividend_amount, lookback_days, correlation_override,
      model_choice, underlying_model, time_horizon_years
    )
    VALUES (
      p_org_id,
      v_plan_id,
      v_company_id,
      NULLIF(p_hypothesis->>'as_of_date', '')::DATE,
      NULLIF(p_hypothesis->>'s0', '')::NUMERIC,
      NULLIF(p_hypothesis->>'rate_flat', '')::NUMERIC,
      NULLIF(p_hypothesis->>'dividend_yield', '')::NUMERIC,
      NULLIF(p_hypothesis->>'vol_method', ''),
      NULLIF(p_hypothesis->>'ticker_override', ''),
      NULLIF(p_hypothesis->>'currency', ''),
      p_hypothesis->'multi_asset_params',
      NULLIF(p_hypothesis->>'volatility', '')::NUMERIC,
      NULLIF(p_hypothesis->>'volatility_price_type', ''),
      NULLIF(p_hypothesis->>'volatility_winsorizing_pct', '')::NUMERIC,
      NULLIF(p_hypothesis->>'dividend_input_mode', ''),
      NULLIF(p_hypothesis->>'dividend_amount', '')::NUMERIC,
      NULLIF(p_hypothesis->>'lookback_days', '')::INTEGER,
      NULLIF(p_hypothesis->>'correlation_override', '')::NUMERIC,
      NULLIF(p_hypothesis->>'model_choice', ''),
      NULLIF(p_hypothesis->>'underlying_model', ''),
      NULLIF(p_hypothesis->>'time_horizon_years', '')::NUMERIC
    )
    RETURNING id INTO v_hypothesis_id;

    -- ===========================================================================
    -- 9. INSERT volatility_schemes (FK vers hypothesis_sets)
    -- ===========================================================================
    IF p_volatility IS NOT NULL THEN
      INSERT INTO volatility_schemes (
        org_id, hypothesis_set_id, method, annualized_sigma,
        lookback_period_days, heston_params, jump_params
      )
      VALUES (
        p_org_id,
        v_hypothesis_id,
        NULLIF(p_volatility->>'method', ''),
        NULLIF(p_volatility->>'annualized_sigma', '')::NUMERIC,
        NULLIF(p_volatility->>'lookback_period_days', '')::INTEGER,
        p_volatility->'heston_params',
        p_volatility->'jump_params'
      )
      RETURNING id INTO v_volatility_id;
    END IF;

    -- ===========================================================================
    -- 10. INSERT simulation_configs (FK vers hypothesis_sets)
    -- ===========================================================================
    IF p_simulation IS NOT NULL THEN
      INSERT INTO simulation_configs (
        org_id, hypothesis_set_id, pricer_type, effective_model,
        underlying_model, num_paths, steps_per_year, time_horizon_years,
        antithetic_variates, heston_params, jump_params
      )
      VALUES (
        p_org_id,
        v_hypothesis_id,
        NULLIF(p_simulation->>'pricer_type', ''),
        NULLIF(p_simulation->>'effective_model', ''),
        NULLIF(p_simulation->>'underlying_model', ''),
        NULLIF(p_simulation->>'num_paths', '')::INTEGER,
        NULLIF(p_simulation->>'steps_per_year', '')::INTEGER,
        NULLIF(p_simulation->>'time_horizon_years', '')::NUMERIC,
        COALESCE((p_simulation->>'antithetic_variates')::BOOLEAN, true),
        p_simulation->'heston_params',
        p_simulation->'jump_params'
      )
      RETURNING id INTO v_simulation_id;
    END IF;
  END IF;

  RAISE NOTICE '[create_plan_full] cascade OK : plan=% vesting=% hypo=% vol=% sim=%',
    v_plan_id, v_vesting_id, v_hypothesis_id, v_volatility_id, v_simulation_id;

  RETURN jsonb_build_object(
    'plan_id', v_plan_id,
    'company_id', v_company_id,
    'vesting_schedule_id', v_vesting_id,
    'hypothesis_set_id', v_hypothesis_id
  );
END $$;

GRANT EXECUTE ON FUNCTION create_plan_full(
  UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated;

COMMENT ON FUNCTION create_plan_full IS
  'Cascade atomique de création d''un plan complet (plans + vesting + tranches +
   conditions + leavers + hypothesis + volatility + simulation). SECURITY
   DEFINER pour bypasser les RLS sur companies (auto-create) et garantir
   l''atomicité totale. Auth check via memberships + user_has_permission.
   Voir docs/MODULE_03A_PLANS.md §3.1 + memory/module_3a_b1_post_check.md.';
