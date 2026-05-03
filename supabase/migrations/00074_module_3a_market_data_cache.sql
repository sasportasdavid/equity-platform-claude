-- =============================================================================
-- Migration 00074 — Module 3a payload V2 : market_data_cache
-- =============================================================================
--
-- Cache 24h des fetch EODHD/Yahoo pour garantir cohérence UX preview→save
-- dans le wizard step 4 (un user qui clique "Récupérer maintenant" puis
-- "Sauvegarder le plan" 30s plus tard ne doit pas avoir 2 valeurs S0 légèrement
-- différentes à cause de micro-mouvements intra-day).
--
-- Pas un audit trail : pour IFRS 2.46, voir `valuation_runs.payload_sent`
-- (migration 00072) qui contient la matrice de corrélation effective +
-- timestamp du run + reference_index_data_source/captured_at par condition.
--
-- Données publiques (tickers + prix de marché) → pas de RLS.
-- Cleanup batch optionnel V2 (cron pg_cron qui DELETE WHERE expires_at < now()).
--
-- Source : /tmp/source-files/market-data-fetch.ts CacheEntry interface (l. 24-44)
-- =============================================================================

CREATE TABLE IF NOT EXISTS market_data_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clé business (uniqueness logique pour ON CONFLICT UPSERT)
  ticker TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  lookback_days INTEGER NOT NULL CHECK (lookback_days > 0 AND lookback_days <= 3650),

  -- Données de marché capturées
  spot_price NUMERIC NOT NULL CHECK (spot_price > 0),
  dividend_yield NUMERIC NOT NULL DEFAULT 0 CHECK (dividend_yield >= 0 AND dividend_yield <= 1),
  annualized_volatility NUMERIC NOT NULL CHECK (annualized_volatility >= 0 AND annualized_volatility <= 5),
  currency TEXT NOT NULL,
  price_points INTEGER NOT NULL CHECK (price_points >= 0),

  -- Time series + metadata (jsonb souple — startDate/endDate/sampleSize/dates/prices/returns)
  raw_data JSONB,

  -- TTL : 24h par default (pattern Capiwise comme expiry_date M2/M5/M6)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uniqueness sur la clé business (cible de ON CONFLICT dans les EF)
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_data_cache_business_key
  ON market_data_cache (ticker, as_of_date, lookback_days);

-- Cleanup batch (cron V2 : DELETE WHERE expires_at < now())
CREATE INDEX IF NOT EXISTS idx_market_data_cache_expires_at
  ON market_data_cache (expires_at);

-- Trigger updated_at (réutilise la function set_updated_at déjà présente Module 1)
DROP TRIGGER IF EXISTS set_market_data_cache_updated_at ON market_data_cache;
CREATE TRIGGER set_market_data_cache_updated_at
  BEFORE UPDATE ON market_data_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pas de RLS : données publiques de marché (tickers + prix). Pas de leak inter-org
-- car le cache est partagé (un user fetch ^FCHI → utilisable par tous les autres
-- users du même cache 24h).
ALTER TABLE market_data_cache DISABLE ROW LEVEL SECURITY;

-- Comments pour audit / dev
COMMENT ON TABLE market_data_cache IS
  'Cache 24h des fetch EODHD/Yahoo. Garantit cohérence UX preview→save dans le wizard. '
  'PAS un audit trail IFRS 2.46 (utiliser valuation_runs.payload_sent migration 00072 '
  'pour la trace canonique). Données publiques de marché → pas de RLS.';

COMMENT ON COLUMN market_data_cache.ticker IS
  'Yahoo-style ticker uppercase (ex: ^FCHI, AAPL, BNP.PA). NB : le ticker EODHD '
  'résolu (ex: CAC.PA) est stocké séparément dans performance_conditions.reference_index_resolved_ticker.';

COMMENT ON COLUMN market_data_cache.expires_at IS
  '24h post-creation par défaut. Les EF market-data-fetch et market-data-peer-group '
  'filtrent SELECT WHERE expires_at > now() pour skip les entries expirées (pas de '
  'cleanup auto V1 — V2 = cron pg_cron quotidien).';

COMMENT ON COLUMN market_data_cache.raw_data IS
  'Time series jsonb : { startDate, endDate, sampleSize, dates?, prices?, returns? }. '
  'Sert principalement à la transparence audit / debug — peut être lourd (252 dates × 2 num) '
  'mais TTL 24h limite la croissance table.';

COMMENT ON COLUMN market_data_cache.annualized_volatility IS
  'σ annualisée calculée sur log-returns avec winsorisation 0-20% + outlier filter |r|>40% '
  '(corporate actions). Computed via marketDataService.computeHistoricalVolatility().';
