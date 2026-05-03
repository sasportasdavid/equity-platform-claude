-- =============================================================================
-- Migration 00050 — TSR_REL_INDEX : market data columns
-- =============================================================================
--
-- Contexte : audit V8 du moteur Python a révélé que sans index_S0/index_sigma/
-- correlation, le moteur fallback à 100.0/0.20/0.5 (main.py l. 454-456) →
-- résultats Monte Carlo silencieusement FAUX pour tout client utilisant un
-- index réel comme SBF120, S&P 500, etc.
--
-- Cette migration ajoute les colonnes nécessaires sur performance_conditions
-- pour stocker les paramètres marché de l'index.
--
-- V1 : saisie manuelle via le wizard step 4 (UI inputs ManualIndexMarketData).
-- V2 (Module 3a §5.2 deferred) : fetched live via edge function fetchMarketData
--     (Yahoo/EODHD) avec auto-recompute sur lookback_period_days.
--
-- Source : memory/payload_python_audit_v8.md
-- =============================================================================

ALTER TABLE performance_conditions
  ADD COLUMN IF NOT EXISTS reference_index_s0 NUMERIC,
  ADD COLUMN IF NOT EXISTS reference_index_sigma NUMERIC,
  ADD COLUMN IF NOT EXISTS reference_index_correlation NUMERIC,
  ADD COLUMN IF NOT EXISTS reference_index_dividend_yield NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_index_data_source TEXT,
  ADD COLUMN IF NOT EXISTS reference_index_data_captured_at TIMESTAMPTZ;

-- Validation : sigma in [0, 5] (= 500% max — au-dessus c'est sûrement une erreur d'unité),
-- correlation in [-1, 1], yield in [0, 1].
ALTER TABLE performance_conditions
  ADD CONSTRAINT check_reference_index_sigma_range
    CHECK (reference_index_sigma IS NULL OR (reference_index_sigma >= 0 AND reference_index_sigma <= 5)),
  ADD CONSTRAINT check_reference_index_correlation_range
    CHECK (reference_index_correlation IS NULL OR (reference_index_correlation >= -1 AND reference_index_correlation <= 1)),
  ADD CONSTRAINT check_reference_index_dividend_yield_range
    CHECK (reference_index_dividend_yield IS NULL OR (reference_index_dividend_yield >= 0 AND reference_index_dividend_yield <= 1)),
  ADD CONSTRAINT check_reference_index_s0_positive
    CHECK (reference_index_s0 IS NULL OR reference_index_s0 > 0),
  ADD CONSTRAINT check_reference_index_data_source_enum
    CHECK (reference_index_data_source IS NULL OR reference_index_data_source IN ('MANUAL', 'YAHOO', 'EODHD', 'BLOOMBERG'));

-- Comments pour audit / dev
COMMENT ON COLUMN performance_conditions.reference_index_s0 IS
  'Spot price of the reference index at grant date (or last known close if not available). '
  'Required for TSR_REL_INDEX conditions — without this the Python engine falls back to 100.0.';

COMMENT ON COLUMN performance_conditions.reference_index_sigma IS
  'Annualized volatility of the reference index (fraction, e.g. 0.18 for 18%). '
  'Computed from log-returns over the lookback_period_days × sqrt(252). '
  'Required for TSR_REL_INDEX conditions — engine falls back to 0.20 without this.';

COMMENT ON COLUMN performance_conditions.reference_index_correlation IS
  'Pearson correlation of log-returns between main asset and reference index, '
  'computed over lookback_period_days. Range [-1, 1]. '
  'Required for TSR_REL_INDEX — engine falls back to 0.5 without this.';

COMMENT ON COLUMN performance_conditions.reference_index_dividend_yield IS
  'Dividend yield of the index. ALWAYS 0 if using adjusted_close prices '
  '(which already incorporate dividends). Default 0.';

COMMENT ON COLUMN performance_conditions.reference_index_data_source IS
  'How the market data was obtained: MANUAL (user input), YAHOO, EODHD, BLOOMBERG. '
  'Used for audit trail (CAC IFRS 2.46) — proves the data lineage.';

COMMENT ON COLUMN performance_conditions.reference_index_data_captured_at IS
  'Timestamp when the market data was captured. For YAHOO/EODHD sources, '
  'used to detect stale data and trigger refresh.';

-- Index pour la requête "conditions avec données manquantes" qui sera utilisée
-- par la compliance rule MARKET_DATA_REQUIRED ajoutée en migration 00052.
CREATE INDEX IF NOT EXISTS idx_perf_conditions_missing_index_data
  ON performance_conditions (plan_id)
  WHERE market_metric_type = 'TSR_REL_INDEX'
    AND (reference_index_s0 IS NULL OR reference_index_sigma IS NULL OR reference_index_correlation IS NULL);
