-- =============================================================================
-- Module 10 B1 — Migration 00085 : RPC compute_cap_table + helper apply_scenario
-- =============================================================================
--
-- Single source of truth pour le calcul de la cap table.
-- Retourne un JSONB avec : positions résolues + totaux + métriques.
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.6
--
-- ⚠️ Pas de GRANT EXECUTE sur apply_scenario (helper privé). Elle est
-- appelée uniquement depuis compute_cap_table qui a déjà checké la
-- permission cap_table.read.all. Cf. piège #3 du chat user.
-- =============================================================================

-- Helper privé (pas de SECURITY DEFINER, pas de GRANT)
CREATE OR REPLACE FUNCTION apply_scenario(p_positions JSONB, p_scenario JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_scenario_type TEXT;
  v_params JSONB;
  v_result JSONB;
BEGIN
  v_scenario_type := p_scenario->>'scenario_type';
  v_params := p_scenario->'parameters';

  IF v_scenario_type = 'NEW_ROUND' THEN
    -- Ajouter une position investisseur fictive
    -- price_per_share = pre_money / total_shares_pre + amount_raised / new_shares
    -- V1 simplifié : new_shares = amount_raised / price_per_share (price fourni)
    v_result := COALESCE(p_positions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'stakeholder_type', 'INVESTOR',
      'stakeholder_id', NULL,
      'stakeholder_name', COALESCE(v_params->>'investor_name', 'New investor (scenario)'),
      'share_class_code', COALESCE(v_params->>'share_class_code', 'PREF_NEW'),
      'share_class_type', 'PREFERRED',
      'units', COALESCE(
        (v_params->>'amount_raised')::numeric / NULLIF((v_params->>'price_per_share')::numeric, 0),
        0
      ),
      'source', 'SCENARIO_NEW_ROUND',
      'acquired_at', CURRENT_DATE
    ));
  ELSIF v_scenario_type = 'POOL_TOPUP' THEN
    v_result := COALESCE(p_positions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'stakeholder_type', 'POOL_RESERVE',
      'stakeholder_id', NULL,
      'stakeholder_name', 'Pool ESOP top-up (scenario)',
      'share_class_code', 'ESOP',
      'share_class_type', 'ESOP',
      'units', COALESCE((v_params->>'additional_units')::numeric, 0),
      'source', 'SCENARIO_POOL_TOPUP',
      'acquired_at', CURRENT_DATE
    ));
  ELSIF v_scenario_type = 'BULK_EXERCISE' THEN
    -- V1 : marker scenario only — la matrice change pas (les awards GRANTED
    -- virtuels sont déjà dans positions en mode DILUTED). Le scénario sert à
    -- recommuter avec les awards convertis en émissions COMMON.
    -- V2 = vraie transformation des positions virtuelles ESOP_VIRTUAL en COMMON.
    v_result := COALESCE(p_positions, '[]'::jsonb);
  ELSIF v_scenario_type = 'EXIT' THEN
    -- V1 : conserve les positions (le calcul waterfall est fait côté lib TS
    -- dilution-comparator). V2 = appliquer conversion preferred → common selon
    -- conversion_strategy.
    v_result := COALESCE(p_positions, '[]'::jsonb);
  ELSE
    -- COMBINED ou type inconnu : pas de mutation
    v_result := COALESCE(p_positions, '[]'::jsonb);
  END IF;

  RETURN v_result;
END $$;

-- ⚠️ Pas de GRANT EXECUTE sur apply_scenario (helper privé)

-- ---------------------------------------------------------------------------
-- compute_cap_table — RPC principal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_cap_table(
  p_org_id UUID,
  p_asof_date DATE DEFAULT CURRENT_DATE,
  p_scenario_id UUID DEFAULT NULL,
  p_view_mode TEXT DEFAULT 'CONSOLIDATED'  -- 'CONSOLIDATED' | 'DILUTED' | 'PRO_FORMA'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_positions JSONB;
  v_grand_total NUMERIC := 0;
  v_totals JSONB := '{}'::jsonb;
  v_scenario JSONB;
  v_diluted_extras JSONB;
BEGIN
  -- 1. Permission check
  IF NOT user_has_permission('cap_table.read.all') THEN
    RAISE EXCEPTION 'Insufficient permissions to read cap table' USING ERRCODE = '42501';
  END IF;

  -- 2. Validation view_mode
  IF p_view_mode NOT IN ('CONSOLIDATED', 'DILUTED', 'PRO_FORMA') THEN
    RAISE EXCEPTION 'Invalid view_mode: %', p_view_mode USING ERRCODE = '22023';
  END IF;

  -- 3. Charger les positions actives à la date demandée (sources 1, 2, 4)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'stakeholder_type', p.stakeholder_type,
    'stakeholder_id', p.stakeholder_id,
    'stakeholder_name', p.stakeholder_name,
    'stakeholder_email', p.stakeholder_email,
    'share_class_id', p.share_class_id,
    'share_class_code', sc.code,
    'share_class_type', sc.class_type,
    'units', p.units,
    'cost_basis_total', p.cost_basis_total,
    'source', p.source,
    'source_id', p.source_id,
    'acquired_at', p.acquired_at
  )), '[]'::jsonb)
  INTO v_positions
  FROM cap_table_positions p
  JOIN share_classes sc ON sc.id = p.share_class_id
  WHERE p.org_id = p_org_id
    AND p.acquired_at <= p_asof_date
    AND (p.position_closed_at IS NULL OR p.position_closed_at > p_asof_date::timestamptz);

  -- 4. Si view DILUTED ou PRO_FORMA : ajouter les awards GRANTED non exercés (virtuels)
  IF p_view_mode IN ('DILUTED', 'PRO_FORMA') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stakeholder_type', 'BENEFICIARY',
      'stakeholder_id', a.beneficiary_id,
      'stakeholder_name', COALESCE(b.first_name || ' ' || b.last_name, 'Beneficiary'),
      'share_class_code', 'ESOP_VIRTUAL',
      'share_class_type', 'ESOP',
      'units', a.units_outstanding - COALESCE(a.units_exercised, 0),
      'source', 'AWARD_GRANTED_VIRTUAL',
      'source_id', a.id,
      'acquired_at', a.grant_date
    )), '[]'::jsonb)
    INTO v_diluted_extras
    FROM awards a
    JOIN beneficiaries b ON b.id = a.beneficiary_id
    WHERE a.org_id = p_org_id
      AND a.status IN ('GRANTED', 'VESTING', 'PARTIALLY_VESTED', 'FULLY_VESTED', 'PARTIALLY_EXERCISED')
      AND a.grant_date <= p_asof_date
      AND (a.units_outstanding - COALESCE(a.units_exercised, 0)) > 0;

    v_positions := v_positions || COALESCE(v_diluted_extras, '[]'::jsonb);
  END IF;

  -- 5. Si scenario_id : appliquer le scénario (mutation in-memory)
  IF p_scenario_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'scenario_type', scenario_type,
      'parameters', parameters,
      'steps', steps
    )
    INTO v_scenario
    FROM dilution_scenarios
    WHERE id = p_scenario_id AND org_id = p_org_id;

    IF v_scenario IS NULL THEN
      RAISE EXCEPTION 'Scenario % not found or unauthorized', p_scenario_id USING ERRCODE = '42P01';
    END IF;

    v_positions := apply_scenario(v_positions, v_scenario);
  END IF;

  -- 6. Calcul des totaux par share_class_code + grand total
  IF jsonb_array_length(v_positions) > 0 THEN
    SELECT
      SUM(units::numeric),
      jsonb_object_agg(share_class_code, total_units)
    INTO v_grand_total, v_totals
    FROM (
      SELECT
        elem->>'share_class_code' AS share_class_code,
        (elem->>'units')::numeric AS units,
        SUM((elem->>'units')::numeric) OVER (PARTITION BY elem->>'share_class_code') AS total_units
      FROM jsonb_array_elements(v_positions) elem
    ) sub
    GROUP BY () ;
  END IF;

  -- 7. Construire le résultat final
  v_result := jsonb_build_object(
    'org_id', p_org_id,
    'asof_date', p_asof_date,
    'view_mode', p_view_mode,
    'scenario_id', p_scenario_id,
    'positions', v_positions,
    'totals_by_class', COALESCE(v_totals, '{}'::jsonb),
    'grand_total_units', COALESCE(v_grand_total, 0),
    'computed_at', NOW()
  );

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION compute_cap_table(UUID, DATE, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION compute_cap_table IS
  'Module 10 B1 — Single source of truth cap table. SECURITY DEFINER, perm cap_table.read.all. 3 view modes : CONSOLIDATED (positions only), DILUTED (+ awards GRANTED virtuels), PRO_FORMA (DILUTED + scénario). Performance V1 OK jusqu''à 500 positions, V2 = matérialiser si > 500.';

COMMENT ON FUNCTION apply_scenario IS
  'Module 10 B1 — Helper privé pour compute_cap_table. PAS de GRANT EXECUTE (appelé uniquement depuis compute_cap_table). 5 types : NEW_ROUND (add investor position), POOL_TOPUP (add pool reserve), BULK_EXERCISE (V2 transform virtuels), EXIT (V2 conversion strategy), COMBINED.';
