-- =============================================================================
-- Migration 00107 : Contrainte UNIQUE — 1 seul workflow default actif
--                   par (org_id, applies_to)
-- =============================================================================
--
-- Demande utilisateur 2026-05-19 : "il ne doit pas pouvoir avoir 2 workflow
-- d'attribution activés".
--
-- Bug latent observé via lecture du code `start_approval_workflow` (00030) :
--
--   SELECT * INTO v_workflow FROM approval_workflows
--    WHERE org_id = v_org_id
--      AND applies_to = 'AWARD_GRANT'
--      AND is_default = true
--      AND deleted_at IS NULL AND is_active = true;
--   -- ⚠️ Pas de LIMIT, pas de ORDER BY
--
-- Si 2 lignes matchent, Postgres en retourne UNE seule indéterministe → le
-- workflow effectif d'une attribution change d'un appel à l'autre.
--
-- FIX : index UNIQUE partiel sur (org_id, applies_to) qui ne s'applique que
-- aux rows is_default=true AND is_active=true AND deleted_at IS NULL.
-- Garantit DB-level qu'on ne peut JAMAIS avoir 2 default actifs pour le
-- même (org, applies_to).
--
-- L'INSERT/UPDATE qui violerait la contrainte recevra un
-- "duplicate key value violates unique constraint" — capté côté Server
-- Action et présenté à l'UI ("Un autre workflow default existe déjà
-- pour ce type, désactivez-le ou rendez-le non-default d'abord").
--
-- Aucun doublon en DB au moment de l'application (vérifié SELECT count
-- HAVING > 1 → []).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_workflow_default_per_applies_to
  ON public.approval_workflows (org_id, applies_to)
  WHERE is_default = true
    AND is_active = true
    AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_approval_workflow_default_per_applies_to IS
  'Module 5 / V1.X — Garantit qu''il ne peut y avoir qu''UN seul workflow default actif par (org_id, applies_to). Cf demande user 2026-05-19 sur Capiwise.';
