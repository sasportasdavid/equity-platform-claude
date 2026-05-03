-- ============================================================
-- Module 9 B1 — Approval workflow paliers €
-- ============================================================
--
-- Étend `approval_workflow_steps` (Module 5) pour supporter le filtrage
-- selon le montant de la demande (utilisé par `start_approval_workflow_for_exercise`).
--
-- Sémantique :
--   - amount_threshold_min IS NULL ET amount_threshold_max IS NULL
--     → step toujours déclenché (legacy AWARD_GRANT, retro-compat)
--   - min = 0, max = 50000      → step si montant <= 50K€ (palier 1)
--   - min = 50000, max = 250000 → step si 50K-250K€ (palier 2)
--   - min = 250000, max = NULL  → step si > 250K€ (palier 3 Board)

ALTER TABLE approval_workflow_steps
  ADD COLUMN IF NOT EXISTS amount_threshold_min NUMERIC,
  ADD COLUMN IF NOT EXISTS amount_threshold_max NUMERIC;

COMMENT ON COLUMN approval_workflow_steps.amount_threshold_min IS
  'Module 9 — step déclenché si montant >= min (NULL = pas de borne basse)';
COMMENT ON COLUMN approval_workflow_steps.amount_threshold_max IS
  'Module 9 — step déclenché si montant <= max (NULL = illimité)';

-- Index composite pour le SELECT par (workflow + paliers)
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_thresholds
  ON approval_workflow_steps(workflow_id, amount_threshold_min, amount_threshold_max);
