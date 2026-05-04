-- =============================================================================
-- Module 10 B1 — Migration 00082 : table cap_table_positions
-- =============================================================================
--
-- Positions atomiques. Une ligne = un détenteur a X units d'une classe à T.
-- Toutes les positions sont "current" sauf si position_closed_at IS NOT NULL.
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.3
-- Erratum : pas de trigger audit_table_changes (cf 00080).
-- =============================================================================

CREATE TABLE cap_table_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Détenteur (polymorphique)
  stakeholder_type TEXT NOT NULL CHECK (stakeholder_type IN (
    'FOUNDER', 'INVESTOR', 'BENEFICIARY', 'ENTITY', 'POOL_RESERVE'
  )),
  stakeholder_id UUID,                   -- NULL pour POOL_RESERVE
  stakeholder_name TEXT NOT NULL,        -- Dénormalisé pour l'affichage rapide
  stakeholder_email TEXT,                -- Pour investors externes

  -- Quoi
  share_class_id UUID NOT NULL REFERENCES share_classes(id),
  units NUMERIC(20,4) NOT NULL,

  -- Origine
  source TEXT NOT NULL CHECK (source IN (
    'FOUNDER_GRANT',          -- Initial founder shares (import historique)
    'FUNDING_ROUND',          -- Émission via levée
    'EXERCISE_EMISSION',      -- Option exercée Module 9
    'TRANSFER',               -- Transfert entre stakeholders V2
    'BUYBACK',                -- Rachat par société V2
    'POOL_RESERVATION',       -- Réservation pool ESOP (non émis)
    'BULK_IMPORT'             -- Import CSV historique
  )),
  source_id UUID,                        -- FK vers funding_rounds.id, exercise_requests.id, etc.

  -- Vie de la position
  acquired_at DATE NOT NULL,             -- Date d'acquisition légale
  position_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  position_closed_at TIMESTAMPTZ,        -- NULL si position active
  closed_reason TEXT,

  -- Économique
  cost_basis_per_unit NUMERIC(15,5),     -- Prix d'acquisition unitaire (pour fiscal V2)
  cost_basis_total NUMERIC(20,2) GENERATED ALWAYS AS
    (cost_basis_per_unit * units) STORED,

  -- Voting (override possible vs share_class default)
  voting_units NUMERIC(20,4),            -- NULL = utilise voting_rights_per_share de share_class

  -- Métadonnées
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT positions_units_positive CHECK (units > 0),
  CONSTRAINT positions_pool_no_stakeholder CHECK (
    (stakeholder_type = 'POOL_RESERVE' AND stakeholder_id IS NULL)
    OR (stakeholder_type != 'POOL_RESERVE' AND stakeholder_id IS NOT NULL)
  )
);

CREATE INDEX idx_positions_org_active ON cap_table_positions(org_id)
  WHERE position_closed_at IS NULL;
CREATE INDEX idx_positions_stakeholder ON cap_table_positions(stakeholder_type, stakeholder_id)
  WHERE position_closed_at IS NULL;
CREATE INDEX idx_positions_share_class ON cap_table_positions(share_class_id)
  WHERE position_closed_at IS NULL;
CREATE INDEX idx_positions_source ON cap_table_positions(source, source_id);

ALTER TABLE cap_table_positions ENABLE ROW LEVEL SECURITY;

-- Admin / OWNER / AUDITOR voient toute la cap table de leur org
CREATE POLICY positions_select_admin
  ON cap_table_positions FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_has_permission('cap_table.read.all')
  );

-- BENEFICIARY voit uniquement ses propres positions (via beneficiary_id)
CREATE POLICY positions_select_own_beneficiary
  ON cap_table_positions FOR SELECT
  USING (
    org_id = current_org_id()
    AND stakeholder_type = 'BENEFICIARY'
    AND user_has_permission('cap_table.read.own')
    AND stakeholder_id IN (
      SELECT id FROM beneficiaries WHERE user_id = auth.uid()
    )
  );

-- INSERT : via RPC SECURITY DEFINER ou par admin avec permission write (FOUNDER_GRANT, BULK_IMPORT)
CREATE POLICY positions_insert_admin
  ON cap_table_positions FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('cap_table.read.all')
  );

CREATE TRIGGER set_cap_table_positions_updated_at
  BEFORE UPDATE ON cap_table_positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE cap_table_positions IS
  'Module 10 B1 — Positions atomiques (qui détient quoi). Sources: FOUNDER_GRANT / FUNDING_ROUND / EXERCISE_EMISSION / POOL_RESERVATION / BULK_IMPORT / TRANSFER (V2) / BUYBACK (V2).';
