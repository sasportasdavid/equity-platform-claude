-- ============================================================
-- Fix métier (audit 2026-06-10, P0-4) — cap table DILUTED double soustraction
-- ============================================================
--
-- compute_cap_table_impl (vue DILUTED/PRO_FORMA) calculait les units ESOP
-- virtuelles comme `units_outstanding - units_exercised`. Or la colonne
-- awards.units_outstanding est GENERATED ALWAYS AS
-- (units_granted - units_exercised - units_cancelled) : les units exercées
-- étaient donc soustraites DEUX fois. Un award de 1000 units dont 300 exercées
-- apparaissait à 400 units virtuelles au lieu de 700.
--
-- Correctif : utiliser units_outstanding seul (déjà net des exercées + annulées),
-- qui représente exactement les options encore en vie (non exercées, non annulées).
-- Le filtre WHERE est aligné.
--
-- Le reste du corps est identique à la version déployée (00085 + tenant guard
-- 00105 délègue à cet _impl). CREATE OR REPLACE car Postgres ne patche pas
-- ligne à ligne.
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_cap_table_impl(
  p_org_id uuid,
  p_asof_date date DEFAULT CURRENT_DATE,
  p_scenario_id uuid DEFAULT NULL::uuid,
  p_view_mode text DEFAULT 'CONSOLIDATED'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
  v_positions JSONB;
  v_grand_total NUMERIC := 0;
  v_totals JSONB := '{}'::jsonb;
  v_scenario JSONB;
  v_diluted_extras JSONB;
BEGIN
  IF NOT has_permission('captable.read.all') THEN
    RAISE EXCEPTION 'Insufficient permissions to read cap table' USING ERRCODE = '42501';
  END IF;
  IF p_view_mode NOT IN ('CONSOLIDATED', 'DILUTED', 'PRO_FORMA') THEN
    RAISE EXCEPTION 'Invalid view_mode: %', p_view_mode USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'stakeholder_type', p.stakeholder_type, 'stakeholder_id', p.stakeholder_id,
    'stakeholder_name', p.stakeholder_name, 'stakeholder_email', p.stakeholder_email,
    'share_class_id', p.share_class_id, 'share_class_code', sc.code, 'share_class_type', sc.class_type,
    'units', p.units, 'cost_basis_total', p.cost_basis_total, 'source', p.source,
    'source_id', p.source_id, 'acquired_at', p.acquired_at
  )), '[]'::jsonb)
  INTO v_positions
  FROM cap_table_positions p
  JOIN share_classes sc ON sc.id = p.share_class_id
  WHERE p.org_id = p_org_id
    AND p.acquired_at <= p_asof_date
    AND (p.position_closed_at IS NULL OR p.position_closed_at > p_asof_date::timestamptz);
  IF p_view_mode IN ('DILUTED', 'PRO_FORMA') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stakeholder_type', 'BENEFICIARY', 'stakeholder_id', a.beneficiary_id,
      'stakeholder_name', COALESCE(b.first_name || ' ' || b.last_name, 'Beneficiary'),
      'share_class_code', 'ESOP_VIRTUAL', 'share_class_type', 'ESOP',
      -- FIX P0-4 : units_outstanding est GENERATED (granted - exercised - cancelled).
      -- Ne pas re-soustraire units_exercised.
      'units', a.units_outstanding,
      'source', 'AWARD_GRANTED_VIRTUAL', 'source_id', a.id, 'acquired_at', a.grant_date
    )), '[]'::jsonb)
    INTO v_diluted_extras
    FROM awards a
    JOIN beneficiaries b ON b.id = a.beneficiary_id
    WHERE a.org_id = p_org_id
      AND a.status IN ('GRANTED', 'VESTING', 'PARTIALLY_VESTED', 'FULLY_VESTED', 'PARTIALLY_EXERCISED')
      AND a.grant_date <= p_asof_date
      AND a.units_outstanding > 0;
    v_positions := v_positions || COALESCE(v_diluted_extras, '[]'::jsonb);
  END IF;
  IF p_scenario_id IS NOT NULL THEN
    SELECT jsonb_build_object('scenario_type', scenario_type, 'parameters', parameters, 'steps', steps)
    INTO v_scenario
    FROM dilution_scenarios
    WHERE id = p_scenario_id AND org_id = p_org_id;
    IF v_scenario IS NULL THEN
      RAISE EXCEPTION 'Scenario % not found or unauthorized', p_scenario_id USING ERRCODE = '42P01';
    END IF;
    v_positions := apply_scenario(v_positions, v_scenario);
  END IF;
  IF jsonb_array_length(v_positions) > 0 THEN
    SELECT SUM(units::numeric), jsonb_object_agg(share_class_code, total_units)
    INTO v_grand_total, v_totals
    FROM (
      SELECT elem->>'share_class_code' AS share_class_code,
             (elem->>'units')::numeric AS units,
             SUM((elem->>'units')::numeric) OVER (PARTITION BY elem->>'share_class_code') AS total_units
      FROM jsonb_array_elements(v_positions) elem
    ) sub
    GROUP BY ();
  END IF;
  v_result := jsonb_build_object(
    'org_id', p_org_id, 'asof_date', p_asof_date, 'view_mode', p_view_mode,
    'scenario_id', p_scenario_id, 'positions', v_positions,
    'totals_by_class', COALESCE(v_totals, '{}'::jsonb),
    'grand_total_units', COALESCE(v_grand_total, 0),
    'computed_at', NOW()
  );
  RETURN v_result;
END $function$;
