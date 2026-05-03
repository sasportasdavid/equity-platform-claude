-- =============================================================================
-- Migration 00073 — Module 3a payload V2 : market data fetch mode
-- =============================================================================
--
-- Complète les migrations 00070-00072 (payload V8 alignment) avec le mode de
-- récupération des données de marché pour TSR_REL_INDEX et TSR_REL_PEERS.
--
-- 3 modes :
--   - SNAPSHOT_AT_GRANT (default) : fetch unique à la création/save du plan,
--     ref_date = grant_date, valeurs figées dans les colonnes
--     reference_index_s0/sigma/correlation/dividend_yield (cf 00070).
--     → Recommandé pour reproductibilité IFRS 2.46.
--
--   - MANUAL : saisie utilisateur via le wizard step 4 (composant
--     MarketDataInputs). reference_index_data_source = 'MANUAL'.
--
--   - LIVE_AT_VALUATION : pas de save figé en DB, l'edge function
--     compute-valuation re-fetch les données à chaque run via les EF
--     market-data-fetch / market-data-peer-group. Audit trail via
--     valuation_runs.payload_sent (00072).
--     → Déconseillé IFRS 2 (résultats peuvent varier dans le temps).
--
-- Source : memory/payload_python_audit_v8.md + memory/module_3a_market_data_complete.md
-- =============================================================================

-- 3 nouvelles colonnes (orthogonales à 00070 — pas de duplication)
-- Pattern NOT NULL DEFAULT inline OK (Postgres 11+ + table de petite taille).
ALTER TABLE performance_conditions
  ADD COLUMN IF NOT EXISTS market_data_fetch_mode TEXT NOT NULL DEFAULT 'SNAPSHOT_AT_GRANT',
  ADD COLUMN IF NOT EXISTS reference_index_resolved_ticker TEXT,
  ADD COLUMN IF NOT EXISTS market_data_warnings JSONB;

-- CHECK enum sur market_data_fetch_mode (DO $$ block car ADD CONSTRAINT IF NOT EXISTS
-- n'existe pas en Postgres — pattern cohérent avec migrations Module 1+9).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_market_data_fetch_mode_enum'
  ) THEN
    ALTER TABLE performance_conditions
      ADD CONSTRAINT check_market_data_fetch_mode_enum
      CHECK (market_data_fetch_mode IN (
        'SNAPSHOT_AT_GRANT',
        'MANUAL',
        'LIVE_AT_VALUATION'
      ));
  END IF;
END $$;

-- Comments pour audit IFRS 2.46 / dev
COMMENT ON COLUMN performance_conditions.market_data_fetch_mode IS
  'Mode de récupération des données de marché pour TSR_REL_INDEX et TSR_REL_PEERS. '
  'SNAPSHOT_AT_GRANT (default) = fetch unique à la création du plan, valeurs figées '
  'en DB → reproductibilité IFRS 2.46. MANUAL = saisie utilisateur. LIVE_AT_VALUATION '
  '= re-fetch à chaque run de valuation, audit trail dans valuation_runs.payload_sent. '
  'Reproductibilité dégradée — déconseillé IFRS 2.';

COMMENT ON COLUMN performance_conditions.reference_index_resolved_ticker IS
  'Ticker EODHD effectivement utilisé pour la requête (ex: input ^FCHI → CAC.PA résolu). '
  'Stocke la traduction Yahoo→EODHD ou le ETF fallback XETRA (ex: ^SX3P → EXV1.XETRA '
  'si Index subscription EODHD manquant). Utile pour traçabilité et debug data lineage.';

COMMENT ON COLUMN performance_conditions.market_data_warnings IS
  'Warnings de qualité des données collectées au fetch : low_correlation_warning, '
  'low_coverage_warning, etf_fallback_used, insufficient_history, ex_div_detected, etc. '
  'Format : {"warnings": [{"code": "ETF_FALLBACK_USED", "message": "...", "severity": "info|warn"}]}. '
  'NULL si données fetched sans warning ou mode = MANUAL.';

-- Index partiel : compute-valuation EF filtre rapidement les conditions
-- LIVE_AT_VALUATION pour re-fetch (probablement minoritaire ~5-10% des plans
-- en V1 — la plupart adopteront SNAPSHOT_AT_GRANT par défaut IFRS 2).
CREATE INDEX IF NOT EXISTS idx_perf_conditions_live_fetch
  ON performance_conditions (org_id, plan_id)
  WHERE market_data_fetch_mode = 'LIVE_AT_VALUATION';
