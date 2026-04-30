-- ============================================================================
-- Module side-task — Seed un workflow d'approbation par défaut pour
-- toute organisation (existante + futures via trigger).
--
-- Permet à tout user OWNER de propose un award sans avoir à configurer un
-- workflow custom au préalable. Le workflow default est :
--   * applies_to = 'AWARD_GRANT'
--   * is_active = true, is_default = true
--   * 1 step : 'Approbation par approver', approver_type='ROLE',
--     approver_role='APPROVER', mode='SEQUENTIAL', required_approvals=1
--
-- Pourquoi APPROVER (et pas OWNER) :
--   * NO_SELF_APPROVAL rule (Module 5 B2) interdit à l'OWNER d'approuver
--     les awards qu'il crée. Un rôle dédié APPROVER permet la séparation
--     des fonctions.
--   * Pré-requis E2E : au moins 1 user actif avec rôle APPROVER dans l'org.
--     Les 2 dummy memberships APPROVER de Module 5 B5 (832762f1, 7f56d666)
--     sont conservés actifs pour les tests.
--
-- Idempotence :
--   * Backfill : INSERT uniquement si l'org n'a PAS encore de workflow
--     default AWARD_GRANT actif (NOT EXISTS check, pas d'ON CONFLICT car
--     pas d'UNIQUE constraint sur (org_id, applies_to, is_default)).
--   * Trigger AFTER INSERT ON organizations : même check, no-op si l'org
--     a déjà un workflow default.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fonction utilitaire (réutilisée par backfill + trigger)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_default_approval_workflow_for_org(p_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_workflow_id UUID;
BEGIN
  -- Idempotent : si l'org a déjà un workflow default AWARD_GRANT actif,
  -- ne rien faire et retourner l'id existant
  SELECT id INTO v_workflow_id
    FROM approval_workflows
   WHERE org_id = p_org_id
     AND applies_to = 'AWARD_GRANT'
     AND is_default = true
     AND is_active = true
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_workflow_id IS NOT NULL THEN
    RETURN v_workflow_id;
  END IF;

  INSERT INTO approval_workflows (
    org_id, name, description, applies_to,
    is_active, is_default, created_at, updated_at
  ) VALUES (
    p_org_id,
    'Workflow d''approbation par défaut',
    'Workflow par défaut, 1 étape : approbation par un user de rôle APPROVER. Modifiable dans Settings → Approbations.',
    'AWARD_GRANT',
    true, true, now(), now()
  )
  RETURNING id INTO v_workflow_id;

  INSERT INTO approval_workflow_steps (
    workflow_id, step_order, step_name,
    approver_type, approver_role,
    mode, required_approvals
  ) VALUES (
    v_workflow_id, 1, 'Approbation par approver',
    'ROLE', 'APPROVER',
    'SEQUENTIAL', 1
  );

  RETURN v_workflow_id;
END $$;

GRANT EXECUTE ON FUNCTION seed_default_approval_workflow_for_org(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Backfill orgs existantes
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_org RECORD;
BEGIN
  FOR v_org IN
    SELECT id FROM organizations WHERE deleted_at IS NULL
  LOOP
    PERFORM seed_default_approval_workflow_for_org(v_org.id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Trigger pour les futures orgs
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_seed_default_workflow_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM seed_default_approval_workflow_for_org(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_default_workflow ON organizations;

CREATE TRIGGER trg_seed_default_workflow
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION trg_seed_default_workflow_on_org_insert();
