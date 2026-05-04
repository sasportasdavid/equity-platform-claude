-- =============================================================================
-- Module 10 B1 — Migration 00084 : table dilution_scenarios
-- =============================================================================
--
-- Scénarios "et si" : nouvelle levée hypothétique, top-up pool, exercise batch,
-- exit. Pas de mutation des positions réelles : juste un objet de calcul.
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.5
-- =============================================================================

CREATE TABLE dilution_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification
  name TEXT NOT NULL,
  description TEXT,

  -- Type
  scenario_type TEXT NOT NULL CHECK (scenario_type IN (
    'NEW_ROUND',          -- Nouvelle levée hypothétique
    'POOL_TOPUP',         -- Augmentation du pool ESOP
    'BULK_EXERCISE',      -- Tous les BSPCE vested s'exercent
    'EXIT',               -- Sortie de la société (waterfall)
    'COMBINED'            -- Plusieurs steps en chaîne
  )),

  -- Paramètres (JSON typé selon scenario_type — schéma validé côté Server Action Zod)
  -- NEW_ROUND     : { share_class_code, pre_money, amount_raised, anti_dilution_apply }
  -- POOL_TOPUP    : { additional_units, target_pool_percent_post }
  -- BULK_EXERCISE : { only_vested: bool, beneficiary_filter? }
  -- EXIT          : { exit_valuation, exit_date, conversion_strategy }
  parameters JSONB NOT NULL,

  -- Steps multi-stage (uniquement si COMBINED)
  steps JSONB DEFAULT '[]'::jsonb,

  -- Base
  base_snapshot_id UUID REFERENCES cap_table_snapshots(id),  -- Si NULL, base = "current"
  base_asof_date DATE,

  -- Résultat (computed à la demande, cache 24h)
  result_cache JSONB,
  result_computed_at TIMESTAMPTZ,

  -- Visibilité
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,  -- Si TRUE, tous les admins de l'org voient

  -- Métadonnées
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_scenarios_org ON dilution_scenarios(org_id);
CREATE INDEX idx_scenarios_creator ON dilution_scenarios(created_by);

ALTER TABLE dilution_scenarios ENABLE ROW LEVEL SECURITY;

-- Lecture : ses propres scénarios OU scénarios partagés (is_shared=TRUE)
CREATE POLICY scenarios_select_own_or_shared
  ON dilution_scenarios FOR SELECT
  USING (
    org_id = current_org_id()
    AND (created_by = auth.uid() OR is_shared = TRUE)
    AND has_permission('captable.scenario.read')
  );

CREATE POLICY scenarios_insert_admin
  ON dilution_scenarios FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND has_permission('captable.scenario.create')
    AND created_by = auth.uid()
  );

CREATE POLICY scenarios_update_own
  ON dilution_scenarios FOR UPDATE
  USING (created_by = auth.uid() AND org_id = current_org_id());

CREATE POLICY scenarios_delete_own
  ON dilution_scenarios FOR DELETE
  USING (created_by = auth.uid() AND org_id = current_org_id());

CREATE TRIGGER set_dilution_scenarios_updated_at
  BEFORE UPDATE ON dilution_scenarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE dilution_scenarios IS
  'Module 10 B1 — Scénarios "et si". 5 types: NEW_ROUND / POOL_TOPUP / BULK_EXERCISE / EXIT / COMBINED. Pas de mutation positions réelles.';
