-- =============================================================================
-- Module 10 B1 — Migration 00081 : table funding_rounds
-- =============================================================================
--
-- Une levée de fonds = un évent d'émission de Preferred shares à un prix donné.
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.2
-- Erratum : pas de trigger audit_table_changes (cf 00080).
-- =============================================================================

CREATE TABLE funding_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification
  name TEXT NOT NULL,
  round_type TEXT NOT NULL CHECK (round_type IN (
    'PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'SERIES_D_PLUS',
    'BRIDGE', 'CONVERTIBLE_NOTE', 'SAFE', 'OTHER'
  )),

  -- Économique
  share_class_id UUID NOT NULL REFERENCES share_classes(id),
  pre_money_valuation NUMERIC(20,2) NOT NULL,
  amount_raised NUMERIC(20,2) NOT NULL,
  price_per_share NUMERIC(15,5) NOT NULL,
  total_shares_issued NUMERIC(20,4) NOT NULL,

  -- Computed (cohérence pre + amount = post)
  post_money_valuation NUMERIC(20,2) GENERATED ALWAYS AS
    (pre_money_valuation + amount_raised) STORED,

  -- Termes
  liquidation_preference_multiple NUMERIC(5,2) DEFAULT 1.0,
  participating BOOLEAN DEFAULT FALSE,
  participating_cap NUMERIC(5,2),
  conversion_ratio NUMERIC(15,5) DEFAULT 1.0,
  anti_dilution_type TEXT CHECK (anti_dilution_type IN (
    'NONE', 'WEIGHTED_AVERAGE_BROAD', 'WEIGHTED_AVERAGE_NARROW', 'FULL_RATCHET'
  )) DEFAULT 'NONE',

  -- ROFR / drag-along (V1 = enregistré JSON, pas exécuté)
  additional_terms JSONB DEFAULT '{}'::jsonb,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'PENDING_APPROVAL', 'CLOSED', 'CANCELLED'
  )),
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,

  -- Workflow de docs (Module 6 V2)
  pacte_actionnaires_doc_id UUID REFERENCES documents(id),

  -- Métadonnées
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT funding_rounds_amount_positive CHECK (amount_raised > 0),
  CONSTRAINT funding_rounds_premoney_positive CHECK (pre_money_valuation > 0),
  CONSTRAINT funding_rounds_shares_consistent CHECK (
    -- price * shares ≈ amount (tolérance 1% pour arrondis)
    ABS((price_per_share * total_shares_issued) - amount_raised)
    < (amount_raised * 0.01)
  )
);

CREATE INDEX idx_funding_rounds_org ON funding_rounds(org_id);
CREATE INDEX idx_funding_rounds_status ON funding_rounds(org_id, status)
  WHERE status NOT IN ('CANCELLED');

ALTER TABLE funding_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY funding_rounds_select_own_org
  ON funding_rounds FOR SELECT
  USING (org_id = current_org_id());

CREATE POLICY funding_rounds_insert_admin
  ON funding_rounds FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('funding_rounds.create')
  );

CREATE POLICY funding_rounds_update_admin
  ON funding_rounds FOR UPDATE
  USING (
    org_id = current_org_id()
    AND user_has_permission('funding_rounds.create')
  );

CREATE TRIGGER set_funding_rounds_updated_at
  BEFORE UPDATE ON funding_rounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE funding_rounds IS
  'Module 10 B1 — Levées de fonds. Émission Preferred shares + termes (liquidation pref, anti-dilution). Audit via logAuditEvent côté Server Action.';
