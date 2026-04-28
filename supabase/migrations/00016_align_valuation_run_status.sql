-- =============================================================================
-- Module 3a — Alignement valuation_runs.status sur le moteur Python existant
-- =============================================================================
--
-- Contexte
-- --------
-- Le moteur Python (https://equity-gem-quant.fly.dev) utilise les statuts
-- 'QUEUED' / 'RUNNING' / 'DONE' / 'ERROR' (UPPERCASE) pour reporter l'état
-- d'une simulation Monte Carlo. La migration 00014 a posé un CHECK
-- constraint avec les valeurs 'pending' / 'running' / 'completed' / 'failed'
-- (lowercase) qui ne correspondent pas — ce qui fait échouer toute insertion
-- depuis l'Edge Function proxy `compute-valuation` (Module 3a §4.3).
--
-- Cf. memory/module_3a_b1_post_check.md écart 4 : la spec §4.3 utilise
-- déjà `status: 'QUEUED'` mais notre CHECK le rejette.
--
-- Cette migration :
--   1. Drop l'ancienne CHECK constraint
--   2. Migre les données existantes (defensive — la table est vide en pratique
--      mais on n'a pas envie d'introduire un bug si quelqu'un ajoute un row
--      entre les deux migrations)
--   3. Ajoute la nouvelle CHECK alignée sur le moteur Python
--   4. Fixe le DEFAULT à 'QUEUED' (= état initial naturel quand on enqueue)
-- =============================================================================

ALTER TABLE valuation_runs DROP CONSTRAINT IF EXISTS vr_status_check;

UPDATE valuation_runs SET status =
  CASE status
    WHEN 'pending' THEN 'QUEUED'
    WHEN 'running' THEN 'RUNNING'
    WHEN 'completed' THEN 'DONE'
    WHEN 'failed' THEN 'ERROR'
    ELSE status
  END
WHERE status IN ('pending', 'running', 'completed', 'failed');

ALTER TABLE valuation_runs ADD CONSTRAINT vr_status_check
  CHECK (status IS NULL OR status IN ('QUEUED', 'RUNNING', 'DONE', 'ERROR'));

ALTER TABLE valuation_runs ALTER COLUMN status SET DEFAULT 'QUEUED';

COMMENT ON COLUMN valuation_runs.status IS
  'Statut de la simulation Monte Carlo. Valeurs alignées sur le moteur Python
   (https://equity-gem-quant.fly.dev) : QUEUED (créé, en attente de pickup),
   RUNNING (l''Edge Function compute-valuation l''a invoqué), DONE (résultat
   dans results_json), ERROR (détails dans error_message). Default QUEUED.';
