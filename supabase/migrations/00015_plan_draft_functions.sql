-- =============================================================================
-- Module 3a — Helpers RPC plan_drafts (load + list)
-- =============================================================================
--
-- Complète la migration 00013 qui livrait `plan_drafts` + `upsert_plan_draft`.
-- Ces 2 helpers sont des forward-helpers : pas (encore) appelés par le code
-- actuel — `loadDraftPlan` Server Action lit directement la table en
-- s'appuyant sur RLS (1 brouillon par org+user). Mais on les ajoute pour :
--   1. permettre une future page « Reprendre un brouillon » qui aurait
--      besoin de `list_my_plan_drafts`
--   2. permettre un load explicit par draftId si on bascule un jour vers
--      le mode multi-drafts (plan A/B/C en parallèle)
--
-- Note : la colonne FK est `user_id` (pas `created_by` comme on pourrait
-- le supposer). Cf. 00013 lignes 17-22.
--
-- Sécurité : SECURITY INVOKER pour rester cohérent avec
-- `upsert_plan_draft` (s'appuie sur RLS plutôt que sur des checks
-- impératifs internes). RLS de plan_drafts garantit déjà
-- `org_id = current_org_id() AND user_id = auth.uid()` en SELECT.
-- =============================================================================

CREATE OR REPLACE FUNCTION load_plan_draft(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_data JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;
  IF current_org_id() IS NULL THEN
    RAISE EXCEPTION 'Pas d''organisation active';
  END IF;

  -- RLS filtre déjà sur (org_id = current_org_id() AND user_id = auth.uid()).
  -- On ajoute le filtre id explicit pour éviter de retourner un draft
  -- d'une autre clé si un futur multi-draft est introduit.
  SELECT data || jsonb_build_object('draftId', id::TEXT)
  INTO v_data
  FROM plan_drafts
  WHERE id = p_draft_id;

  RETURN COALESCE(v_data, 'null'::JSONB);
END $$;

GRANT EXECUTE ON FUNCTION load_plan_draft(UUID) TO authenticated;

-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION list_my_plan_drafts()
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  plan_name TEXT,
  plan_type TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;
  IF current_org_id() IS NULL THEN
    RAISE EXCEPTION 'Pas d''organisation active';
  END IF;

  -- Champ Zod du wizard : `name` (Step 2), `planType` (Step 1).
  -- RLS de plan_drafts filtre déjà sur (org_id, user_id) — on n'ajoute pas
  -- de WHERE redondant.
  RETURN QUERY
  SELECT
    d.id,
    d.created_at,
    d.updated_at,
    (d.data->>'name')::TEXT AS plan_name,
    (d.data->>'planType')::TEXT AS plan_type
  FROM plan_drafts d
  ORDER BY d.updated_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION list_my_plan_drafts() TO authenticated;
