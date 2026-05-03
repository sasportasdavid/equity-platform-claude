-- ============================================================
-- Module 9 B1 — Extend exercise_requests + sequence + helper
-- ============================================================
--
-- Étend la table `exercise_requests` (préfigurée Module 1) pour Module 9 :
--   - 11 colonnes additionnelles (FKs documents/approvals + payment + cancel)
--   - Status CHECK étendu pour inclure 'SIGNED' (entre APPROVED et COMPLETED)
--   - Sequence + helper `generate_exercise_request_number(org_id)` retournant
--     'EXR-2026-0001' (préfixe EXR + année + counter par org incrémenté)
--   - Indexes performance sur status, award_id, beneficiary_id, approval_request_id

ALTER TABLE exercise_requests
  ADD COLUMN IF NOT EXISTS bulletin_document_id UUID REFERENCES document_instances(id),
  ADD COLUMN IF NOT EXISTS notification_document_id UUID REFERENCES document_instances(id),
  ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES approval_requests(id),
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'BANK_TRANSFER',
  ADD COLUMN IF NOT EXISTS payment_amount_received NUMERIC,
  ADD COLUMN IF NOT EXISTS exercise_window_check JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_simulation_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Status CHECK : drop existing + add SIGNED state (entre APPROVED et COMPLETED)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'exercise_requests'::regclass
       AND conname = 'exercise_requests_status_check'
  ) THEN
    ALTER TABLE exercise_requests DROP CONSTRAINT exercise_requests_status_check;
  END IF;

  ALTER TABLE exercise_requests
    ADD CONSTRAINT exercise_requests_status_check
    CHECK (status IN ('PENDING','APPROVED','SIGNED','COMPLETED','REJECTED','CANCELLED'));
END $$;

-- Indexes (filtered partial pour minimiser taille)
CREATE INDEX IF NOT EXISTS idx_exercise_requests_status
  ON exercise_requests(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_requests_award
  ON exercise_requests(award_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_requests_beneficiary
  ON exercise_requests(beneficiary_id, requested_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_requests_approval
  ON exercise_requests(approval_request_id) WHERE approval_request_id IS NOT NULL;

-- Sequence + helper de numérotation 'EXR-YYYY-NNNN' par org (counter intra-org)
CREATE SEQUENCE IF NOT EXISTS exercise_request_number_seq;

CREATE OR REPLACE FUNCTION generate_exercise_request_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  v_count INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(request_number FROM 'EXR-' || v_year || '-(\d+)$') AS INTEGER
    )
  ), 0) + 1 INTO v_count
  FROM exercise_requests
  WHERE org_id = p_org_id
    AND request_number LIKE 'EXR-' || v_year || '-%';

  RETURN 'EXR-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
END $$;

GRANT EXECUTE ON FUNCTION generate_exercise_request_number(UUID) TO authenticated;
