-- =============================================================================
-- Module 10 B1 — Migration 00086 : RPC create_funding_round
-- =============================================================================
--
-- Atomique : INSERT funding_rounds + INSERT N positions investisseurs +
-- materialize_snapshot post-round + audit. Tout ou rien.
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.7
-- =============================================================================

CREATE OR REPLACE FUNCTION create_funding_round(
  p_org_id UUID,
  p_name TEXT,
  p_round_type TEXT,
  p_share_class_id UUID,
  p_pre_money_valuation NUMERIC,
  p_amount_raised NUMERIC,
  p_price_per_share NUMERIC,
  p_investors JSONB  -- [{ name, email?, units, amount?, voting_rights? }]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_round_id UUID;
  v_total_shares NUMERIC := 0;
  v_investor JSONB;
  v_caller UUID := auth.uid();
BEGIN
  -- 1. Permission check
  IF NOT has_permission('captable.round.create') THEN
    RAISE EXCEPTION 'Insufficient permissions to create funding round' USING ERRCODE = '42501';
  END IF;

  -- 2. Validation org cohérence
  IF p_org_id != current_org_id() THEN
    RAISE EXCEPTION 'org_id mismatch with active org' USING ERRCODE = '42501';
  END IF;

  -- 3. Validation share_class appartient à l'org
  IF NOT EXISTS (
    SELECT 1 FROM share_classes
    WHERE id = p_share_class_id AND org_id = p_org_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'share_class % not found or inactive in org', p_share_class_id;
  END IF;

  -- 4. Validation cohérence montants (sum units * price ≈ amount_raised, tolérance 1%)
  FOR v_investor IN SELECT * FROM jsonb_array_elements(p_investors) LOOP
    v_total_shares := v_total_shares + (v_investor->>'units')::numeric;
  END LOOP;

  IF v_total_shares <= 0 THEN
    RAISE EXCEPTION 'sum(investor units) must be positive (got %)', v_total_shares;
  END IF;

  IF ABS(v_total_shares * p_price_per_share - p_amount_raised) > (p_amount_raised * 0.01) THEN
    RAISE EXCEPTION 'Inconsistent: sum(units) × price = % but amount_raised = % (tolerance 1%%)',
      v_total_shares * p_price_per_share, p_amount_raised;
  END IF;

  -- 5. INSERT funding_round (status CLOSED car execution synchrone V1 ;
  -- V2 = workflow approval Module 5 → DRAFT → PENDING_APPROVAL → CLOSED)
  INSERT INTO funding_rounds (
    org_id, name, round_type, share_class_id,
    pre_money_valuation, amount_raised, price_per_share, total_shares_issued,
    status, closed_at, created_by
  ) VALUES (
    p_org_id, p_name, p_round_type, p_share_class_id,
    p_pre_money_valuation, p_amount_raised, p_price_per_share, v_total_shares,
    'CLOSED', NOW(), v_caller
  ) RETURNING id INTO v_round_id;

  -- 6. INSERT N positions investisseurs (1 par entrée du tableau)
  FOR v_investor IN SELECT * FROM jsonb_array_elements(p_investors) LOOP
    INSERT INTO cap_table_positions (
      org_id, stakeholder_type, stakeholder_id, stakeholder_name, stakeholder_email,
      share_class_id, units, source, source_id,
      acquired_at, cost_basis_per_unit, created_by
    ) VALUES (
      p_org_id,
      'INVESTOR',
      gen_random_uuid(),  -- placeholder UUID stable pour stakeholder_id (V2 = vraie table investors)
      v_investor->>'name',
      v_investor->>'email',
      p_share_class_id,
      (v_investor->>'units')::numeric,
      'FUNDING_ROUND',
      v_round_id,
      CURRENT_DATE,
      p_price_per_share,
      v_caller
    );
  END LOOP;

  -- 7. Materialize snapshot post-round (best-effort — si snapshot fail, le round reste)
  BEGIN
    PERFORM materialize_snapshot(p_org_id, CURRENT_DATE, 'POST_ROUND', v_round_id, p_name);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'materialize_snapshot failed for round %: %', v_round_id, SQLERRM;
  END;

  -- 8. Audit event
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    p_org_id, v_caller, 'captable.round_created', 'funding_rounds', v_round_id,
    jsonb_build_object(
      'name', p_name,
      'round_type', p_round_type,
      'amount_raised', p_amount_raised,
      'total_shares_issued', v_total_shares,
      'investors_count', jsonb_array_length(p_investors)
    )
  );

  RETURN v_round_id;
END $$;

GRANT EXECUTE ON FUNCTION create_funding_round TO authenticated;

COMMENT ON FUNCTION create_funding_round IS
  'Module 10 B1 — Création atomique d''une levée. INSERT round + N positions + snapshot post-round + audit. Tolérance 1% sur sum(units)*price vs amount_raised.';
