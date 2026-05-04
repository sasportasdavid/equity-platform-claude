-- =============================================================================
-- Module 10 B1 — Migration 00083 : ALTER cap_table_snapshots
-- =============================================================================
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.4
--
-- ⚠️ Erratum spec : la spec §2.4 propose un CREATE TABLE complet, mais la table
-- existe déjà (préfigurée Module 1, 11 colonnes — cf memory/module_10_recon.md
-- §2). Stratégie ADD-only pour préserver les données potentielles + structure
-- existante. Voir Q1 du recon.
--
-- Colonnes existantes Module 1 :
--   id, org_id, company_id, snapshot_date, snapshot_type, trigger_event,
--   data, total_shares_outstanding, total_shares_fully_diluted, created_at,
--   created_by
--
-- Colonnes ajoutées en 00083 (nécessaires pour Module 10) :
--   - asof_date         : alias logique de snapshot_date (laisser snapshot_date
--                         comme canonical, ne pas dupliquer)
--   - label             : nom humain (Avant Series B, Audit 2026, ...)
--   - positions_json    : array de positions résolues (nouvelle colonne JSONB)
--   - totals_by_class   : { share_class_code: units }
--   - totals_by_stakeholder : { stakeholder_id: units }
--   - total_units_issued / total_units_diluted : NUMERIC(20,4) en plus de
--     total_shares_outstanding/fully_diluted BIGINT existants (V2 = aligner)
--   - triggered_by_funding_round_id : FK funding_rounds(id)
--   - triggered_by_exercise_id : FK exercise_requests(id)
--   - notes
--   - is_immutable      : NOT NULL DEFAULT FALSE
--   - updated_at        : NOT NULL DEFAULT now()
-- =============================================================================

-- 1. Étendre snapshot_type CHECK constraint pour V2 values
-- Le CHECK existant Module 1 est probablement plus restrictif. On le supprime
-- + recrée pour inclure les nouvelles valeurs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cap_table_snapshots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%snapshot_type%'
  ) THEN
    -- Find and drop the existing CHECK on snapshot_type
    EXECUTE (
      SELECT 'ALTER TABLE cap_table_snapshots DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.cap_table_snapshots'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%snapshot_type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE cap_table_snapshots
  ADD CONSTRAINT cap_table_snapshots_snapshot_type_check
  CHECK (snapshot_type IN (
    'POST_ROUND',
    'NIGHTLY',
    'MANUAL_FREEZE',
    'PRE_AUDIT',
    'POST_EXERCISE_BATCH'
  ));

-- 2. ADD COLUMN IF NOT EXISTS pour les nouvelles colonnes
ALTER TABLE cap_table_snapshots
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS positions_json JSONB,
  ADD COLUMN IF NOT EXISTS totals_by_class JSONB,
  ADD COLUMN IF NOT EXISTS totals_by_stakeholder JSONB,
  ADD COLUMN IF NOT EXISTS total_units_issued NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS total_units_diluted NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS triggered_by_funding_round_id UUID REFERENCES funding_rounds(id),
  ADD COLUMN IF NOT EXISTS triggered_by_exercise_id UUID REFERENCES exercise_requests(id),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_immutable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Indexes (CREATE INDEX IF NOT EXISTS pour idempotency)
CREATE INDEX IF NOT EXISTS idx_snapshots_org_date
  ON cap_table_snapshots(org_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_type
  ON cap_table_snapshots(org_id, snapshot_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_funding_round
  ON cap_table_snapshots(triggered_by_funding_round_id)
  WHERE triggered_by_funding_round_id IS NOT NULL;

-- 4. RLS — drop existing policies if any then recreate per spec §2.4
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cap_table_snapshots'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cap_table_snapshots', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE cap_table_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY snapshots_select_admin
  ON cap_table_snapshots FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_has_permission('cap_table.read.all')
  );

CREATE POLICY snapshots_insert_admin
  ON cap_table_snapshots FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('cap_table_snapshots.create')
  );

-- Snapshots immutables : pas de UPDATE possible
CREATE POLICY snapshots_no_update
  ON cap_table_snapshots FOR UPDATE
  USING (FALSE);

-- DELETE : seul OWNER peut supprimer un snapshot non-immutable
CREATE POLICY snapshots_delete_admin
  ON cap_table_snapshots FOR DELETE
  USING (
    org_id = current_org_id()
    AND user_has_permission('cap_table_snapshots.create')
    AND is_immutable = FALSE
  );

-- 5. Trigger updated_at
DROP TRIGGER IF EXISTS set_cap_table_snapshots_updated_at ON cap_table_snapshots;
CREATE TRIGGER set_cap_table_snapshots_updated_at
  BEFORE UPDATE ON cap_table_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE cap_table_snapshots IS
  'Module 10 B1 — Snapshots cap table. Préfigurée Module 1, étendue Module 10 (label / positions_json / triggered_by_* / is_immutable). Audit via logAuditEvent côté Server Action.';

COMMENT ON COLUMN cap_table_snapshots.is_immutable IS
  'Si TRUE, le snapshot ne peut plus être supprimé même par OWNER (cas PRE_AUDIT). Pas de UPDATE possible (RLS policy).';

COMMENT ON COLUMN cap_table_snapshots.snapshot_date IS
  'Canonical asof-date du snapshot (Module 1 column). Aliasé asof_date côté Server Actions Module 10 si besoin.';
