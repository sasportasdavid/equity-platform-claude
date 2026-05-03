/**
 * Module 3a payload V2 — Schémas Zod pour les Server Actions market-data.
 *
 * Source de vérité pour les Server Actions exposées dans
 * `apps/web/src/server/actions/market-data.ts` :
 *  - searchIndices(query) → autocomplete Yahoo (proxy yahoo-search EF)
 *  - fetchIndexMarketData({ ticker, asOfDate, lookbackDays })
 *      → preview EODHD/Yahoo (proxy market-data-fetch EF) pour TSR_REL_INDEX
 *  - fetchPeerGroupMarketData({ companyTicker, peers, asOfDate, lookbackDays })
 *      → preview multi-peers (proxy market-data-peer-group EF) pour TSR_REL_PEERS
 *
 * Référence : memory/payload_python_audit_v8.md (audit V8) +
 *             docs/MODULE_03A_PLANS.md §5.2.
 */

import { z } from 'zod';
import { uuidSchema, isoDateSchema } from './common';

// ---------------------------------------------------------------------------
// Constants — bornes business validées (cf. CHECK SQL migration 00070+00074)
// ---------------------------------------------------------------------------

/** Lookback minimum pour σ historique (1 mois ouvré ~21 jours, on prend 30 par sécurité). */
export const MIN_LOOKBACK_DAYS = 30;

/** Lookback maximum (10 ans = 3650 jours) — aligné CHECK migration 00074. */
export const MAX_LOOKBACK_DAYS = 3650;

/** Lookback par défaut conseillé pour σ IFRS 2 (3 ans glissants ~756 j ouvrés). */
export const DEFAULT_LOOKBACK_INDEX_DAYS = 1095;
export const DEFAULT_LOOKBACK_PEERS_DAYS = 1095;

// ---------------------------------------------------------------------------
// 1. searchIndices — autocomplete d'indices Yahoo
// ---------------------------------------------------------------------------

export const searchIndicesInputSchema = z.object({
  /** Requête de recherche (≥ 2 chars). */
  query: z
    .string()
    .trim()
    .min(2, 'La requête doit faire au moins 2 caractères')
    .max(100, 'Requête trop longue'),
  /** Nombre max de résultats (1–25, default 15). */
  quotesCount: z.number().int().min(1).max(25).optional(),
});
export type SearchIndicesInput = z.infer<typeof searchIndicesInputSchema>;

/** Résultat unitaire de recherche (forme Yahoo). */
export type SearchIndexResult = {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
};

// ---------------------------------------------------------------------------
// 2. fetchIndexMarketData — TSR_REL_INDEX preview (1 ticker)
// ---------------------------------------------------------------------------

export const fetchIndexMarketDataInputSchema = z.object({
  /** Ticker Yahoo-style (ex: ^FCHI, ^GSPC, AAPL). */
  ticker: z.string().trim().min(1, 'Ticker requis').max(20, 'Ticker invalide'),
  /** Date d'observation (= grant_date pour SNAPSHOT_AT_GRANT). */
  asOfDate: isoDateSchema,
  /** Lookback en jours (default 1095 = 3 ans). */
  lookbackDays: z
    .number()
    .int()
    .min(MIN_LOOKBACK_DAYS, `Lookback doit être ≥ ${MIN_LOOKBACK_DAYS} jours`)
    .max(MAX_LOOKBACK_DAYS, `Lookback doit être ≤ ${MAX_LOOKBACK_DAYS} jours`)
    .optional(),
  /** Devise forcée (sinon auto-détection EODHD). */
  currency: z.string().trim().length(3).optional(),
  /** Maturité du plan (years) pour lookup risk-free rate. */
  maturityYears: z.number().positive().max(50).optional(),
  /** Type de prix pour σ (default CLOSE). */
  priceType: z.enum(['CLOSE', 'OPEN']).optional(),
});
export type FetchIndexMarketDataInput = z.infer<typeof fetchIndexMarketDataInputSchema>;

/**
 * Réponse du proxy fetchIndexMarketData — contrat aligné sur
 * la réponse `preview_only=true` de l'EF `market-data-fetch`.
 */
export type FetchIndexMarketDataResult = {
  ticker: string;
  s0: number;
  S0: number; // alias Python
  sigma: number;
  q: number; // dividend yield decimal
  r: number | null; // risk-free rate decimal
  volatility: number;
  dividend_yield: number;
  currency: string;
  detected_currency?: string;
  data_points: number;
  lookback_days: number;
  as_of_date: string;
  period_start?: string;
  period_end?: string;
  sample_size?: number;
  volatility_diagnostics?: unknown;
  volatility_price_type?: string;
  spot_price_source?: string;
  winsorizing_applied?: boolean;
  winsorizing_pct?: number;
  original_volatility?: number;
  risk_free_rate?: number | null;
  risk_free_rate_source?: {
    ticker: string;
    as_of_date: string;
    rate_pct: number;
    currency: string;
    detected_from: string;
  } | null;
};

// ---------------------------------------------------------------------------
// 3. fetchPeerGroupMarketData — TSR_REL_PEERS preview (target + peers)
// ---------------------------------------------------------------------------

const peerAssetInputSchema = z.object({
  ticker: z.string().trim().min(1).max(20),
  name: z.string().trim().max(200).optional(),
});

export const fetchPeerGroupMarketDataInputSchema = z.object({
  /** Ticker du sous-jacent (target — colonne companies.ticker). */
  companyTicker: z.string().trim().min(1, 'Ticker du sous-jacent requis').max(20),
  /** Liste des peers (≥ 1, ≤ 30 — cap pratique pour la matrice de corrélation). */
  peers: z.array(peerAssetInputSchema).min(1, 'Au moins 1 peer').max(30),
  /** Date d'observation (= grant_date pour SNAPSHOT_AT_GRANT). */
  asOfDate: isoDateSchema,
  /** Lookback en jours (default 1095 = 3 ans). */
  lookbackDays: z.number().int().min(MIN_LOOKBACK_DAYS).max(MAX_LOOKBACK_DAYS).optional(),
  /** Optionnel : id de la performance_condition pour audit (cache). */
  conditionId: uuidSchema.optional(),
  /** Optionnel : id du plan (pour scoping cache + RPC). */
  planId: uuidSchema.optional(),
});
export type FetchPeerGroupMarketDataInput = z.infer<typeof fetchPeerGroupMarketDataInputSchema>;

/** Stats agrégées par actif (target + peers) renvoyées par market-data-peer-group. */
export type PeerAssetStats = {
  ticker: string;
  name?: string;
  s0: number;
  volatility: number;
  dividendYield: number;
  dataPoints: number;
  resolvedSymbol?: string | null;
};

export type FetchPeerGroupMarketDataResult = {
  tickers: string[];
  assets: PeerAssetStats[];
  correlation_matrix: number[][];
  sample_size: number;
  lookback_days: number;
  as_of_date: string;
  data_quality?: {
    overlap_ratio: number;
    common_dates: number;
    max_dates: number;
    warnings?: string[];
  };
  warnings?: string[];
  errors?: string[];
};

// ---------------------------------------------------------------------------
// 4. Mode de fetch market data — aligné CHECK migration 00073
// ---------------------------------------------------------------------------

/**
 * 3 modes de fetch market data pour les conditions TSR_REL_*.
 *
 *  - SNAPSHOT_AT_GRANT (default IFRS 2) : capture S0/σ/ρ à la grant_date
 *    et persiste dans performance_conditions. Reproductible — tout
 *    re-run de valuation utilise les mêmes inputs.
 *
 *  - MANUAL : l'utilisateur saisit S0/σ/ρ à la main (cas index obscur
 *    ou data interne). Identique à SNAPSHOT mais sans appel EF.
 *
 *  - LIVE_AT_VALUATION : refetch live à chaque run de valuation (mode
 *    NON-IFRS — pour back-tests intra-day, reporting MTM, etc.). Le
 *    payload Python utilise les valeurs LIVE et les warnings sont
 *    persistés dans valuation_runs.payload_sent.live_fetch_metadata.
 *    ⚠️ Reproductibilité IFRS 2 dégradée — usage CFO / backtest only.
 */
export const marketDataFetchModeSchema = z.enum([
  'SNAPSHOT_AT_GRANT',
  'MANUAL',
  'LIVE_AT_VALUATION',
]);
export type MarketDataFetchMode = z.infer<typeof marketDataFetchModeSchema>;
