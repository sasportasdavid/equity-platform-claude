-- ============================================================================
-- MODULE 5 B1 — Approval Engine schema finalization
--
-- Stratégie ADD-only : toutes les ALTER en ADD COLUMN IF NOT EXISTS pour
-- préserver les colonnes Module 1 (subject_id, current_step_id, requested_by,
-- resolution_message). Les nouvelles colonnes sont des extensions pour
-- faciliter les requêtes RPC (award_id direct, current_step_order cursor,
-- started_by/at aliases métier).
--
-- Tables touchées :
--   - approval_workflows : ADD attach_to_plan_id, deleted_at + 4 indexes
--   - approval_requests  : ADD award_id, plan_id, current_step_order,
--                          resolved_at (already exists), rejected_reason,
--                          started_at, started_by + 3 indexes
--   - approval_decisions : NOUVELLE (table + 4 indexes + 2 RLS + 1 trigger
--                          audit + 1 trigger updated_at)
--
-- Le RPC suivant (00030) utilisera ces colonnes pour orchestrer le workflow.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. approval_workflows : extend
-- ----------------------------------------------------------------------------

ALTER TABLE approval_workflows
  ADD COLUMN IF NOT EXISTS attach_to_plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_approval_workflows_org
  ON approval_workflows(org_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_approval_workflows_plan
  ON approval_workflows(attach_to_plan_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_approval_workflows_default
  ON approval_workflows(org_id, applies_to)
  WHERE is_default = true AND deleted_at IS NULL;

-- 1 seul workflow par plan_id (si attaché)
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_workflows_plan
  ON approval_workflows(attach_to_plan_id)
  WHERE attach_to_plan_id IS NOT NULL AND deleted_at IS NULL;

-- 1 seul default par (org, applies_to)
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_workflows_default
  ON approval_workflows(org_id, applies_to)
  WHERE is_default = true AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. approval_requests : extend
-- ----------------------------------------------------------------------------

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS award_id UUID REFERENCES awards(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS current_step_order INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES auth.users(id);

-- resolved_at existe déjà (Module 1) — pas besoin de re-add.

CREATE INDEX IF NOT EXISTS idx_approval_requests_org
  ON approval_requests(org_id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_award
  ON approval_requests(award_id) WHERE award_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_requests_status
  ON approval_requests(status);

-- ----------------------------------------------------------------------------
-- 3. approval_decisions : new table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES approval_workflow_steps(id),
  step_order INTEGER NOT NULL,

  -- Approbateur sollicité
  approver_user_id UUID REFERENCES auth.users(id),  -- USER ou résolu depuis ROLE
  approver_role    TEXT,                             -- ROLE (mémo, pour debug)

  -- Décision
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','SKIPPED','EXPIRED')),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),
  comment    TEXT,

  -- Metadata
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_request
  ON approval_decisions(request_id);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_user
  ON approval_decisions(approver_user_id);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_role
  ON approval_decisions(approver_role) WHERE approver_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_decisions_pending
  ON approval_decisions(status) WHERE status = 'PENDING';

-- ----------------------------------------------------------------------------
-- 4. RLS approval_decisions (les 3 autres tables ont déjà leurs policies M1)
-- ----------------------------------------------------------------------------

ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;

-- SELECT : toute personne avec approvals.read dans l'org (audit org-wide)
DROP POLICY IF EXISTS approval_decisions_select ON approval_decisions;
CREATE POLICY approval_decisions_select ON approval_decisions FOR SELECT
  USING (org_id = current_org_id() AND has_permission('approvals.read'));

-- UPDATE : seul le décideur sollicité peut update sa décision quand PENDING.
-- Le RPC record_approval_decision passe par SECURITY DEFINER de toute façon —
-- cette policy est pour le cas direct UI très improbable.
DROP POLICY IF EXISTS approval_decisions_update_self ON approval_decisions;
CREATE POLICY approval_decisions_update_self ON approval_decisions FOR UPDATE
  USING (
    org_id = current_org_id()
    AND status = 'PENDING'
    AND (
      approver_user_id = auth.uid()
      OR (approver_role IS NOT NULL AND has_permission('approvals.act'))
    )
  );

-- Pas de DELETE policy → INSERT/DELETE bloqués sauf service_role / RPC.

-- ----------------------------------------------------------------------------
-- 5. Trigger audit pour les changements de statut
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_approval_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'PENDING' THEN
    INSERT INTO audit_events (
      org_id, user_id, event_type, resource_type, resource_id, metadata
    ) VALUES (
      NEW.org_id,
      auth.uid(),
      'approval.decision_recorded',
      'approval_decision',
      NEW.id,
      jsonb_build_object(
        'request_id', NEW.request_id,
        'step_order', NEW.step_order,
        'status', NEW.status,
        'decided_by', NEW.decided_by,
        'comment', NEW.comment
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_approval_decision_audit ON approval_decisions;
CREATE TRIGGER trg_approval_decision_audit
  BEFORE UPDATE OF status ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION audit_approval_decision();

-- ----------------------------------------------------------------------------
-- 6. Trigger updated_at (pattern existant Module 1 set_updated_at)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_approval_decisions_updated_at ON approval_decisions;
CREATE TRIGGER set_approval_decisions_updated_at
  BEFORE UPDATE ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
