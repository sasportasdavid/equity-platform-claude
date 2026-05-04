-- =============================================================================
-- Module 10 B1 — Migration 00080 : table share_classes
-- =============================================================================
--
-- Une classe d'actions par org. Founder Common, Investor Preferred A, Pool ESOP, etc.
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.1
--
-- ⚠️ Erratum spec : la spec §2.1 mentionne `CREATE TRIGGER ... audit_table_changes()`,
-- or cette fonction n'existe pas en DB. L'audit est délégué aux Server Actions
-- via logAuditEvent (cohérent avec Modules 4-9). Trigger audit retiré.
-- =============================================================================

CREATE TABLE share_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification
  code TEXT NOT NULL,              -- 'COMMON', 'PREF_A', 'PREF_B', 'ESOP'
  name TEXT NOT NULL,              -- 'Actions ordinaires', 'Preferred A'
  description TEXT,

  -- Type
  class_type TEXT NOT NULL CHECK (class_type IN (
    'COMMON',           -- Actions ordinaires (founders, exercices)
    'PREFERRED',        -- Actions de préférence (investisseurs)
    'ESOP',             -- Pool de stock-options réservé (pas émis)
    'WARRANT',          -- BSA hors plan (V2, support minimal V1)
    'BSPCE',            -- Bons de souscription (rare en classe dédiée, mais possible)
    'OTHER'
  )),

  -- Économique
  par_value NUMERIC(15,5),         -- Valeur nominale (souvent 0.01 ou 0.10 EUR)
  liquidation_preference_multiple NUMERIC(5,2) DEFAULT 1.0,  -- 1x, 2x non-participating
  liquidation_preference_type TEXT CHECK (liquidation_preference_type IN (
    'NON_PARTICIPATING', 'PARTICIPATING', 'PARTICIPATING_CAPPED'
  )),
  liquidation_preference_cap NUMERIC(5,2),  -- Si PARTICIPATING_CAPPED, ex 3.0 = 3x

  -- Conversion
  conversion_ratio NUMERIC(15,5) DEFAULT 1.0,  -- 1 preferred → N common à la sortie
  is_convertible_to_common BOOLEAN DEFAULT TRUE,

  -- Anti-dilution
  anti_dilution_type TEXT CHECK (anti_dilution_type IN (
    'NONE', 'WEIGHTED_AVERAGE_BROAD', 'WEIGHTED_AVERAGE_NARROW', 'FULL_RATCHET'
  )) DEFAULT 'NONE',

  -- Voting
  voting_rights_per_share NUMERIC(8,4) DEFAULT 1.0,  -- 1 = 1 voix, 0 = non-voting

  -- Pool ESOP spécifique
  pool_total_units NUMERIC(20,4),  -- NULL si pas ESOP. Sinon : taille du pool.

  -- Métadonnées
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT share_classes_code_per_org_unique UNIQUE (org_id, code),
  CONSTRAINT share_classes_pool_only_for_esop CHECK (
    (class_type = 'ESOP' AND pool_total_units IS NOT NULL)
    OR (class_type != 'ESOP' AND pool_total_units IS NULL)
  )
);

-- Index sur org_id, filtré sur is_active (cas usage majoritaire)
CREATE INDEX idx_share_classes_org_active ON share_classes(org_id) WHERE is_active = TRUE;

-- RLS pattern 1 (org-scoped)
ALTER TABLE share_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY share_classes_select_own_org
  ON share_classes FOR SELECT
  USING (org_id = current_org_id());

CREATE POLICY share_classes_insert_admin
  ON share_classes FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND has_permission('captable.share_class.create')
  );

CREATE POLICY share_classes_update_admin
  ON share_classes FOR UPDATE
  USING (
    org_id = current_org_id()
    AND has_permission('captable.share_class.update')
  );

-- Pas de DELETE policy : les share_classes sont soft-deleted (is_active=FALSE)
-- via permission share_classes.deactivate côté Server Action.

-- Trigger updated_at (helper set_updated_at déjà présent Module 1)
CREATE TRIGGER set_share_classes_updated_at
  BEFORE UPDATE ON share_classes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE share_classes IS
  'Module 10 B1 — Classes d''actions par organisation. COMMON / PREFERRED / ESOP / WARRANT / BSPCE / OTHER. Audit via logAuditEvent côté Server Action (pas trigger DB).';
