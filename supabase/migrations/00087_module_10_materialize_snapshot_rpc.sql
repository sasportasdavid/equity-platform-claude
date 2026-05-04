-- =============================================================================
-- Module 10 B1 — Migration 00087 : RPC materialize_snapshot
-- =============================================================================
--
-- Crée un snapshot immutable (par défaut mutable, freezé via PRE_AUDIT) à
-- partir de compute_cap_table. Utilisé par :
--   - create_funding_round (auto post-round)
--   - createManualSnapshot Server Action (B6)
--   - cron pg_cron nightly (B6)
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.8
-- =============================================================================

CREATE OR REPLACE FUNCTION materialize_snapshot(
  p_org_id UUID,
  p_asof_date DATE,
  p_snapshot_type TEXT,
  p_triggered_by_round_id UUID DEFAULT NULL,
  p_label TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot_id UUID;
  v_cap_table JSONB;
  v_company_id UUID;
  v_caller UUID := auth.uid();
  v_total_units NUMERIC;
  v_total_diluted NUMERIC;
  v_cap_table_diluted JSONB;
BEGIN
  -- 1. Permission check (cap_table_snapshots.create) — laxer que la spec
  -- (qui demande cap_table.snapshot.create — corrigé en 00089 avec le bon code)
  IF NOT user_has_permission('cap_table_snapshots.create') THEN
    RAISE EXCEPTION 'Insufficient permissions to create snapshot' USING ERRCODE = '42501';
  END IF;

  -- 2. Resolve company_id (NOT NULL côté table existante Module 1)
  SELECT id INTO v_company_id FROM companies WHERE org_id = p_org_id LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company for org %', p_org_id;
  END IF;

  -- 3. Compute cap table CONSOLIDATED + DILUTED (pour total_units_diluted)
  v_cap_table := compute_cap_table(p_org_id, p_asof_date, NULL, 'CONSOLIDATED');
  v_cap_table_diluted := compute_cap_table(p_org_id, p_asof_date, NULL, 'DILUTED');

  v_total_units := COALESCE((v_cap_table->>'grand_total_units')::numeric, 0);
  v_total_diluted := COALESCE((v_cap_table_diluted->>'grand_total_units')::numeric, 0);

  -- 4. INSERT snapshot
  INSERT INTO cap_table_snapshots (
    org_id, company_id, snapshot_date, snapshot_type, label,
    data, positions_json, totals_by_class, totals_by_stakeholder,
    total_shares_outstanding, total_shares_fully_diluted,
    total_units_issued, total_units_diluted,
    triggered_by_funding_round_id, created_by
  ) VALUES (
    p_org_id, v_company_id, p_asof_date, p_snapshot_type, p_label,
    v_cap_table, -- data column Module 1 = full cap table JSONB
    v_cap_table->'positions',
    v_cap_table->'totals_by_class',
    '{}'::jsonb, -- TODO B6 : agrégats par stakeholder
    -- BIGINT cols Module 1 (round to integer for legacy compatibility)
    FLOOR(v_total_units)::bigint,
    FLOOR(v_total_diluted)::bigint,
    -- NUMERIC(20,4) cols Module 10
    v_total_units,
    v_total_diluted,
    p_triggered_by_round_id, v_caller
  ) RETURNING id INTO v_snapshot_id;

  -- 5. Audit event (cohérent avec pattern Module 4-9 — pas de trigger DB,
  -- audit explicite dans chaque RPC mutator)
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    p_org_id, v_caller, 'cap_table.snapshot_materialized',
    'cap_table_snapshots', v_snapshot_id,
    jsonb_build_object(
      'snapshot_type', p_snapshot_type,
      'asof_date', p_asof_date,
      'label', p_label,
      'triggered_by_round_id', p_triggered_by_round_id,
      'total_units_issued', v_total_units,
      'total_units_diluted', v_total_diluted
    )
  );

  RETURN v_snapshot_id;
END $$;

GRANT EXECUTE ON FUNCTION materialize_snapshot TO authenticated;

COMMENT ON FUNCTION materialize_snapshot IS
  'Module 10 B1 — Crée un snapshot immutable. Appelle compute_cap_table 2× (CONSOLIDATED + DILUTED) pour les totaux. Permission: cap_table_snapshots.create.';
