-- =============================================================================
-- Module 3a — Plan drafts (auto-save brouillon serveur)
-- =============================================================================
-- Cette migration livre uniquement la table `plan_drafts` (auto-save
-- serveur du wizard). Les tables métier complètes (plans,
-- vesting_schedules, performance_conditions, …) et le RPC
-- create_plan_full seront livrés dans une migration dédiée Module 3a
-- backend (cf. MODULE_03A_PLANS.md §3.1).
--
-- Une seule entrée par (org_id, user_id) — l'auto-save écrase le
-- précédent brouillon. Pas de versioning (ce serait du gaspillage car
-- c'est juste une étape intermédiaire avant la création définitive).

CREATE TABLE IF NOT EXISTS plan_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data         JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un brouillon par (org, user) ; on UPSERT à chaque save.
  CONSTRAINT plan_drafts_unique_per_org_user UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_drafts_org_user
  ON plan_drafts (org_id, user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION plan_drafts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plan_drafts_updated_at ON plan_drafts;
CREATE TRIGGER trg_plan_drafts_updated_at
  BEFORE UPDATE ON plan_drafts
  FOR EACH ROW EXECUTE FUNCTION plan_drafts_set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE plan_drafts ENABLE ROW LEVEL SECURITY;

-- Lire son propre brouillon dans son org active
DROP POLICY IF EXISTS plan_drafts_select_own ON plan_drafts;
CREATE POLICY plan_drafts_select_own ON plan_drafts
  FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_id = auth.uid()
  );

-- Insert son propre brouillon
DROP POLICY IF EXISTS plan_drafts_insert_own ON plan_drafts;
CREATE POLICY plan_drafts_insert_own ON plan_drafts
  FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_id = auth.uid()
    AND user_has_permission('plans.create')
  );

-- Update son propre brouillon
DROP POLICY IF EXISTS plan_drafts_update_own ON plan_drafts;
CREATE POLICY plan_drafts_update_own ON plan_drafts
  FOR UPDATE
  USING (
    org_id = current_org_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    org_id = current_org_id()
    AND user_id = auth.uid()
  );

-- Delete son propre brouillon
DROP POLICY IF EXISTS plan_drafts_delete_own ON plan_drafts;
CREATE POLICY plan_drafts_delete_own ON plan_drafts
  FOR DELETE
  USING (
    org_id = current_org_id()
    AND user_id = auth.uid()
  );

-- =============================================================================
-- RPC : upsert + cleanup helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_plan_draft(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER  -- Honore RLS de l'utilisateur courant
AS $$
DECLARE
  v_org_id UUID := current_org_id();
  v_user_id UUID := auth.uid();
  v_draft_id UUID;
  v_saved_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Pas d''organisation active';
  END IF;
  IF NOT user_has_permission('plans.create') THEN
    RAISE EXCEPTION 'Permission denied : plans.create requise';
  END IF;

  INSERT INTO plan_drafts (org_id, user_id, data)
  VALUES (v_org_id, v_user_id, p_data)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET data = EXCLUDED.data,
        updated_at = now()
  RETURNING id, updated_at INTO v_draft_id, v_saved_at;

  RETURN jsonb_build_object(
    'id', v_draft_id,
    'saved_at', to_char(v_saved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
END $$;

GRANT EXECUTE ON FUNCTION upsert_plan_draft(JSONB) TO authenticated;
