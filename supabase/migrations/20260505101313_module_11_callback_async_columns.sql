-- Module 11 — B0.7 : Pattern callback async Python -> Capiwise
--
-- Contexte : Dette #94 — vrai fix.
-- L'ancien pattern B0.6 (EdgeRuntime.waitUntil) souffrait de bugs silencieux :
-- response.json() crash sur grosses responses (>10MB), timeout 300s waitUntil
-- non remonté à l'utilisateur, debug impossible.
--
-- Nouveau pattern B0.7 :
-- 1. EF compute-valuation V4 fait un fire-and-forget POST au moteur Python
--    (timeout 30s pour ack 202)
-- 2. Le moteur Python ack 202 immédiatement, calcule en BackgroundTask, puis
--    POST le résultat signé HMAC SHA-256 à une nouvelle EF python-callback
-- 3. python-callback verify HMAC, UPDATE valuation_runs status=DONE +
--    INSERT valuation_results
--
-- Cette migration ajoute les colonnes nécessaires sur valuation_runs.

-- 1. Colonne callback_secret (32 bytes random hex generated per-run by EF)
ALTER TABLE valuation_runs 
  ADD COLUMN IF NOT EXISTS callback_secret TEXT;

COMMENT ON COLUMN valuation_runs.callback_secret IS 
  'B0.7 — HMAC secret per-run pour signer le callback Python -> EF python-callback. Généré par EF compute-valuation V4 (32 bytes random hex = 64 chars). Lu par EF python-callback pour vérifier la signature X-Capiwise-Signature du POST entrant. Audit trail : permet de prouver que le callback DONE provient bien du moteur Python autorisé (pas d''un attaquant qui aurait l''URL de python-callback).';

-- 2. Colonne callback_received_at (timestamp du POST callback reçu)
ALTER TABLE valuation_runs 
  ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMPTZ;

COMMENT ON COLUMN valuation_runs.callback_received_at IS 
  'B0.7 — Timestamp du POST callback reçu par EF python-callback. Permet de mesurer la latence Python (callback_received_at - started_at) et de détecter les runs orphelins (status=RUNNING + callback_received_at IS NULL + started_at < NOW() - 10 min). Cron job /cron-valuation-refresh peut alors re-marquer ERROR.';

-- 3. Index partiel pour le cron orphelins (très efficace : ne contient que les
--    runs en attente de callback, donc peu de tuples)
CREATE INDEX IF NOT EXISTS idx_valuation_runs_callback_pending 
  ON valuation_runs (id) 
  WHERE status = 'RUNNING' AND callback_received_at IS NULL;

COMMENT ON INDEX idx_valuation_runs_callback_pending IS 
  'B0.7 — Index partiel pour le cron orphan recovery. Permet de scanner uniquement les runs RUNNING sans callback reçu, sans full table scan sur valuation_runs (qui contient l''historique complet).';
