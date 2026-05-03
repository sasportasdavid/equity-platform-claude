-- =============================================================================
-- Migration 00052 — valuation_runs : payload_sent + response_received audit
-- =============================================================================
--
-- Contexte : exigence IFRS 2.46 (audit trail des hypothèses de valorisation).
-- Pour pouvoir reproduire / contester / justifier une valuation a posteriori
-- vis-à-vis du CAC, on doit conserver le snapshot exact :
--   - du payload envoyé au moteur Python (avec toutes les hypothèses figées)
--   - de la réponse brute (FV + greeks + CI95 + audit_trail moteur)
--
-- Ces deux colonnes sont JSONB pour souplesse — l'audit trail moteur (déjà
-- stocké dans valuation_results.distribution_stats.audit_trail) est dérivé
-- de la response, mais on garde la version brute en cas de dispute.
--
-- Référence dette technique #9 (CLAUDE.md) : pas de FK explicite sur
-- hypothesis_set_id sera nettoyé Module 11.
-- =============================================================================

ALTER TABLE valuation_runs
  ADD COLUMN IF NOT EXISTS payload_sent JSONB,
  ADD COLUMN IF NOT EXISTS response_received JSONB;

COMMENT ON COLUMN valuation_runs.payload_sent IS
  'Snapshot exact du payload JSON envoyé au moteur Python (POST /compute/multi-tranche). '
  'Conservé pour audit IFRS 2.46 et reproductibilité (debug post-mortem). '
  'Inclut config, market, instrument, conditions, peers, etc.';

COMMENT ON COLUMN valuation_runs.response_received IS
  'Snapshot brut de la réponse du moteur Python (PyMonteCarloResponse). '
  'Inclut fair_value, greeks, debug_paths, audit_trail, condition_breakdown, etc. '
  'Le moteur peut évoluer côté schéma — garder la version brute évite de devoir '
  'remigrater toute la table à chaque évolution V8 → V9.';

-- Index GIN pour recherches sur le payload (rare mais utile pour debug)
-- Exemple : "tous les runs qui ont utilisé un peer GOOGLE.US" =
--   SELECT * FROM valuation_runs
--   WHERE payload_sent @> '{"conditions":[{"weighted_peer_groups":[{"peers":[{"ticker":"GOOGLE.US"}]}]}]}';
CREATE INDEX IF NOT EXISTS idx_valuation_runs_payload_gin
  ON valuation_runs USING gin(payload_sent);

CREATE INDEX IF NOT EXISTS idx_valuation_runs_response_gin
  ON valuation_runs USING gin(response_received);

-- Vue helper pour les CAC : run + payload résumé + résultat
-- Donne aux auditeurs un point d'entrée unique pour vérifier une valuation
CREATE OR REPLACE VIEW valuation_runs_audit AS
SELECT
  vr.id,
  vr.org_id,
  vr.plan_id,
  vr.status,
  vr.pricer_used,
  vr.engine_version,
  vr.created_at,
  vr.started_at,
  vr.completed_at,
  vr.payload_sent->'config'->>'use_monte_carlo' AS used_monte_carlo,
  (vr.payload_sent->'config'->>'num_paths')::INTEGER AS num_paths,
  (vr.payload_sent->'market'->>'S0')::NUMERIC AS market_s0,
  (vr.payload_sent->'market'->>'sigma')::NUMERIC AS market_sigma,
  (vr.payload_sent->'market'->>'r')::NUMERIC AS market_r,
  (vr.payload_sent->'market'->>'q')::NUMERIC AS market_q,
  vr.payload_sent->'instrument'->>'type' AS instrument_type,
  (vr.payload_sent->'instrument'->>'strike')::NUMERIC AS instrument_strike,
  (vr.payload_sent->'instrument'->>'T')::NUMERIC AS instrument_t,
  jsonb_array_length(COALESCE(vr.payload_sent->'conditions', '[]'::jsonb)) AS num_conditions,
  vres.fair_value_per_instrument,
  vres.std_error,
  vres.ci95_low,
  vres.ci95_high
FROM valuation_runs vr
LEFT JOIN valuation_results vres ON vres.valuation_run_id = vr.id
WHERE vr.deleted_at IS NULL;

COMMENT ON VIEW valuation_runs_audit IS
  'Vue de synthèse pour audit CAC : pour chaque run, montre les inputs clés '
  '(S0, σ, r, q, T, strike) extraits du payload + le fair_value retourné. '
  'Pour le détail complet (peers, conditions, debug_paths), interroger '
  'valuation_runs.payload_sent et valuation_runs.response_received directement.';
