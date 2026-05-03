import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchHistoricalPrices,
  computeHistoricalVolatility,
  computeCorrelationMatrix,
  fetchDividendYieldForPeer,
} from '../_shared/marketDataService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PeerAsset {
  ticker: string;
  name?: string;
}

interface PeerGroupRequest {
  org_id: string;
  plan_id: string;
  condition_id?: string;
  company_ticker: string;
  peers: PeerAsset[];
  lookback_days?: number;
  as_of_date: string;
}

interface AssetData {
  ticker: string;
  name?: string;
  s0: number;
  volatility: number;
  dividendYield: number; // Added: dividend yield for peer
  dataPoints: number;
  returns: number[];
  dates: string[];
  /** The actual symbol returned by Yahoo chart metadata (useful when alternatives are used) */
  resolvedSymbol?: string;
  /** Data mode: 'TARGET' uses raw close, 'PEER' uses adjusted close */
  dataMode: 'TARGET' | 'PEER';
}

// --- ISIN RESOLUTION ---
// ISIN format: 2 uppercase letters (country) + 9 alphanumeric + 1 check digit
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/**
 * Detects if a symbol looks like an ISIN code
 */
function isISIN(symbol: string): boolean {
  return ISIN_REGEX.test(symbol.toUpperCase());
}

/**
 * Resolves an ISIN to a Yahoo Finance ticker symbol using Yahoo's search API
 */
async function resolveISINToTicker(isin: string): Promise<string | null> {
  try {
    console.log(`Attempting to resolve ISIN ${isin} to Yahoo ticker...`);

    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.warn(`Yahoo search API returned ${response.status} for ISIN ${isin}`);
      return null;
    }

    const data = await response.json();

    if (data.quotes && data.quotes.length > 0) {
      // Get the first result's symbol
      const resolvedTicker = data.quotes[0].symbol;
      console.log(`ISIN ${isin} resolved to ticker: ${resolvedTicker}`);
      return resolvedTicker;
    }

    console.warn(`No Yahoo Finance results found for ISIN ${isin}`);
    return null;
  } catch (error) {
    console.error(`Error resolving ISIN ${isin}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: PeerGroupRequest = await req.json();
    const { org_id, plan_id, condition_id, peers, as_of_date } = body;
    let { company_ticker } = body;
    const lookback_days = body.lookback_days ?? 1095;

    if (!org_id || !plan_id || !company_ticker || !peers || peers.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: org_id, plan_id, company_ticker, peers',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- RESOLVE ISIN TO YAHOO TICKER ---
    const originalCompanyTicker = company_ticker;
    if (isISIN(company_ticker)) {
      console.log(
        `Detected ISIN format for company ticker: ${company_ticker}, attempting resolution...`,
      );
      const resolvedTicker = await resolveISINToTicker(company_ticker);

      if (resolvedTicker) {
        company_ticker = resolvedTicker;
        console.log(`Using resolved ticker ${company_ticker} (from ISIN ${originalCompanyTicker})`);
      } else {
        console.warn(`Could not resolve ISIN ${company_ticker} - correlation calculation may fail`);
        // Don't fail here, continue with the ISIN and let Yahoo handle it
      }
    }

    console.log(`Processing peer group data for ${peers.length} peers + company ${company_ticker}`);

    // Verify plan belongs to org
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, company_id, org_id')
      .eq('id', plan_id)
      .eq('org_id', org_id)
      .single();

    if (planError || !plan) {
      console.error('Plan verification failed:', planError);
      return new Response(
        JSON.stringify({ success: false, error: 'Plan not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // All tickers: company + peers
    const allTickers = [company_ticker, ...peers.map((p) => p.ticker)];
    const assetData: Map<string, AssetData> = new Map();
    const errors: string[] = [];

    // Fetch data for all assets in parallel
    const fetchPromises = allTickers.map(async (ticker) => {
      try {
        // Determine if this is the target company or a peer
        const isTarget = ticker === company_ticker;
        const dataMode: 'TARGET' | 'PEER' = isTarget ? 'TARGET' : 'PEER';

        // fetchHistoricalPrices now returns { prices, meta }
        const { prices, meta } = await fetchHistoricalPrices(ticker, lookback_days, as_of_date);

        if (prices.length < 10) {
          throw new Error(`Insufficient data (${prices.length} points)`);
        }

        // Sort prices by date
        const sortedPrices = [...prices].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

        // Calculate log returns and collect dates
        // IMPORTANT: Always use adjustedClose for volatility calculation (includes dividends)
        const returns: number[] = [];
        const dates: string[] = [];
        for (let i = 1; i < sortedPrices.length; i++) {
          const prevClose = sortedPrices[i - 1].adjustedClose ?? sortedPrices[i - 1].close;
          const currClose = sortedPrices[i].adjustedClose ?? sortedPrices[i].close;
          if (prevClose > 0 && currClose > 0) {
            returns.push(Math.log(currClose / prevClose));
            dates.push(sortedPrices[i].date);
          }
        }

        // Compute volatility (uses adjustedClose internally with outlier filtering)
        const { result: vol, diagnostics: volDiagnostics } = computeHistoricalVolatility(prices);

        // Get latest price
        const latestPrice = sortedPrices[sortedPrices.length - 1];

        // CRITICAL DECISION: S0 for PEER vs TARGET
        // - TARGET: Use raw close (we manage dividend explicitly via q parameter)
        // - PEER: Use adjustedClose (dividend already in price, so q=0 in simulation)
        let s0: number;
        let dividendYield = 0;

        if (isTarget) {
          // Target company: use RAW close price
          const rawClose = latestPrice.close;
          const adjClose = latestPrice.adjustedClose ?? latestPrice.close;
          s0 = rawClose;

          // SAFETY CHECK LOG - Explicit S0 source verification
          console.log(`[SAFETY CHECK S0] Ticker: ${ticker}`);
          console.log(` > Raw Close (Target) : ${rawClose.toFixed(4)} (CELUI QU'ON GARDE)`);
          console.log(` > Adj Close (Info)   : ${adjClose.toFixed(4)}`);

          if (Math.abs(rawClose - adjClose) < 0.0001) {
            console.log(` > Note: Pas d'écart de dividende récent/split détecté.`);
          } else {
            const diff = rawClose - adjClose;
            console.log(
              ` > ATTENTION: Différence détectée de ${diff.toFixed(4)}. Confirmation que le Raw est bien utilisé.`,
            );
          }

          // Dividend will be fetched separately and passed as 'q' in simulation
          console.log(
            `[DATA] Ticker: ${ticker} | Mode: TARGET | Field Used: close (raw) | S0: ${s0.toFixed(2)}`,
          );
          console.log(
            `[VOL_DIAG] σ_adj=${(vol.sigma * 100).toFixed(2)}% | σ_raw=${(volDiagnostics.volatility_raw * 100).toFixed(2)}% | outliers=${volDiagnostics.outliers_excluded}`,
          );
        } else {
          // Peer: use adjusted_close (dividend already incorporated)
          s0 = latestPrice.adjustedClose ?? latestPrice.close;
          // For peers using adjusted_close, set q=0 in simulation
          dividendYield = 0;
          console.log(
            `[DATA] Ticker: ${ticker} | Mode: PEER | Field Used: adjusted_close | S0: ${s0.toFixed(2)} | q=0 (div in adj. price)`,
          );
          console.log(
            `[VOL_DIAG] σ_adj=${(vol.sigma * 100).toFixed(2)}% | σ_raw=${(volDiagnostics.volatility_raw * 100).toFixed(2)}% | outliers=${volDiagnostics.outliers_excluded}`,
          );
        }

        const peerInfo = peers.find((p) => p.ticker === ticker);

        return {
          ticker,
          name: peerInfo?.name,
          s0,
          volatility: vol.sigma,
          dividendYield,
          dataPoints: prices.length,
          returns,
          dates,
          resolvedSymbol: meta?.symbol,
          dataMode,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to fetch ${ticker}:`, errorMessage);
        errors.push(`${ticker}: ${errorMessage}`);
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);

    // Filter successful results
    for (const result of results) {
      if (result) {
        assetData.set(result.ticker, result);
      }
    }

    if (assetData.size < 2) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Insufficient data to compute correlation. Only ${assetData.size} assets fetched successfully.`,
          errors,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Align returns by common dates across all assets (prevents holiday/missing-data misalignment)
    const alignedReturns: Record<string, number[]> = {};

    // Build per-asset return maps keyed by date
    const returnMaps = new Map<string, Map<string, number>>();
    const dateSets: Array<Set<string>> = [];

    for (const [ticker, data] of assetData) {
      const m = new Map<string, number>();
      for (let i = 0; i < data.dates.length; i++) {
        const d = data.dates[i];
        const r = data.returns[i];
        if (d && typeof r === 'number' && !Number.isNaN(r)) {
          m.set(d, r);
        }
      }
      returnMaps.set(ticker, m);
      dateSets.push(new Set(m.keys()));
    }

    // Intersection of dates
    let commonDates = Array.from(dateSets[0] ?? []);
    for (let i = 1; i < dateSets.length; i++) {
      const s = dateSets[i];
      commonDates = commonDates.filter((d) => s.has(d));
    }
    commonDates.sort(); // YYYY-MM-DD sort works lexicographically

    const sampleSize = commonDates.length;

    // Calculate data quality metrics
    const totalDatesPerAsset = Array.from(assetData.values()).map((a) => a.dates.length);
    const maxDates = Math.max(...totalDatesPerAsset);
    const minDates = Math.min(...totalDatesPerAsset);
    const overlapRatio = maxDates > 0 ? sampleSize / maxDates : 0;

    // Data quality warnings
    const dataQualityWarnings: string[] = [];

    if (overlapRatio < 0.5) {
      dataQualityWarnings.push(
        `Données insuffisantes pour la corrélation: seulement ${(overlapRatio * 100).toFixed(1)}% de chevauchement ` +
          `(${sampleSize} dates communes sur ${maxDates} disponibles). ` +
          `Vérifiez que les actifs ont le même calendrier de trading.`,
      );
    }

    if (sampleSize < 100 && sampleSize >= 5) {
      dataQualityWarnings.push(
        `Échantillon limité: ${sampleSize} observations communes. ` +
          `La corrélation peut ne pas être statistiquement robuste.`,
      );
    }

    // Enhanced debug logging for correlation calculation
    console.log(`=== CORRELATION DEBUG ===`);
    console.log(`Assets: ${Array.from(assetData.keys()).join(', ')}`);
    console.log(
      `Common aligned dates: ${sampleSize} (overlap ratio: ${(overlapRatio * 100).toFixed(1)}%)`,
    );
    console.log(`Date range per asset: min=${minDates}, max=${maxDates}`);

    for (const ticker of assetData.keys()) {
      const m = returnMaps.get(ticker)!;
      alignedReturns[ticker] = commonDates.map((d) => m.get(d) as number);

      const returns = alignedReturns[ticker];
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
      const std = Math.sqrt(variance);
      console.log(
        `${ticker}: ${returns.length} returns, mean=${(mean * 100).toFixed(4)}%, std=${(std * 100).toFixed(4)}%, first5=[${returns
          .slice(0, 5)
          .map((r) => (r * 100).toFixed(3) + '%')
          .join(', ')}]`,
      );
    }

    if (sampleSize < 5) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Dates communes insuffisantes pour calculer la corrélation (seulement ${sampleSize}). ` +
            `Essayez une période plus longue ou un autre ticker d'indice.`,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // If overlap ratio is critically low, return an error
    if (overlapRatio < 0.3) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Chevauchement des données trop faible (${(overlapRatio * 100).toFixed(1)}%). ` +
            `Les calendriers de trading des actifs sont incompatibles. ` +
            `Essayez un autre indice ou vérifiez les tickers utilisés.`,
          debug: {
            commonDates: sampleSize,
            maxDates,
            overlapRatio,
          },
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Compute correlation matrix
    const tickers = Object.keys(alignedReturns);
    const correlationMatrix = computeCorrelationMatrix(alignedReturns);

    // Log correlation result and check for anomalies
    if (tickers.length === 2) {
      const corr = correlationMatrix[0][1];
      console.log(`Correlation between ${tickers[0]} and ${tickers[1]}: ${corr.toFixed(6)}`);

      // Add warning for suspiciously low correlation (typical stock vs sector index is 0.4-0.8)
      if (Math.abs(corr) < 0.1) {
        dataQualityWarnings.push(
          `Corrélation anormalement basse (${(corr * 100).toFixed(1)}%). ` +
            `Vérifiez que l'indice de référence est bien le bon secteur. ` +
            `Une action devrait typiquement avoir ρ ≥ 0.3 avec son indice sectoriel.`,
        );
        console.warn(
          `LOW CORRELATION WARNING: ${corr.toFixed(4)} - this may indicate data quality issues`,
        );
      }
    }

    console.log(`Computed ${tickers.length}x${tickers.length} correlation matrix`);
    if (dataQualityWarnings.length > 0) {
      console.warn(`Data quality warnings: ${dataQualityWarnings.join(' | ')}`);
    }

    // Prepare asset stats for response (include returns and common dates for chart)
    const assetStats = Array.from(assetData.values()).map(({ ticker, ...rest }) => ({
      ...rest,
      ticker,
      returns: alignedReturns[ticker] || [],
      dates: commonDates,
    }));

    // Cache market data for each asset with raw time series for transparency
    for (const [ticker, data] of assetData) {
      // Build full prices array from sorted prices (before log returns)
      const { prices } = await fetchHistoricalPrices(ticker, lookback_days, as_of_date);
      const sortedPrices = [...prices].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const rawDates = sortedPrices.map((p) => p.date);
      const rawPrices = sortedPrices.map((p) => p.adjustedClose ?? p.close);
      const rawReturns: number[] = [];
      for (let i = 1; i < rawPrices.length; i++) {
        if (rawPrices[i - 1] > 0) {
          rawReturns.push(rawPrices[i] / rawPrices[i - 1] - 1);
        } else {
          rawReturns.push(0);
        }
      }

      const cacheData = {
        ticker: ticker.toUpperCase(),
        as_of_date,
        lookback_days,
        spot_price: data.s0,
        dividend_yield: data.dividendYield, // Now properly tracked per asset
        annualized_volatility: data.volatility,
        currency: 'EUR', // Default, not always known from chart
        price_points: data.dataPoints,
        // Note: data_mode tracked in assetData but not in cache (column doesn't exist)
        raw_data: {
          startDate: commonDates[0] ?? rawDates[0],
          endDate: commonDates[commonDates.length - 1] ?? rawDates[rawDates.length - 1],
          sampleSize: sampleSize,
          dates: rawDates,
          prices: rawPrices,
          returns: rawReturns,
        },
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Upsert to avoid duplicates
      const { error: cacheError } = await supabase
        .from('market_data_cache')
        .upsert(cacheData, { onConflict: 'ticker,as_of_date,lookback_days' });

      if (cacheError) {
        console.warn(`Failed to cache market data for ${ticker}:`, cacheError);
      }
    }

    // Audit trail : la matrice de corrélation effective est tracée via
    // valuation_runs.payload_sent (migration 00072) pour IFRS 2.46.
    // Log structuré ici pour debug uniquement (visible dans Supabase EF logs).
    if (condition_id) {
      console.log('[correlation-audit] matrix computed', {
        org_id,
        plan_id,
        condition_id,
        as_of_date,
        asset_count: tickers.length,
        tickers,
        lookback_days,
        method: 'HISTORICAL',
        matrix_size: `${correlationMatrix.length}x${correlationMatrix[0]?.length ?? 0}`,
      });
    }

    const response = {
      success: true,
      data: {
        tickers,
        assets: assetStats,
        correlation_matrix: correlationMatrix,
        sample_size: sampleSize,
        lookback_days,
        as_of_date,
        data_quality: {
          overlap_ratio: overlapRatio,
          common_dates: sampleSize,
          max_dates: maxDates,
          warnings: dataQualityWarnings.length > 0 ? dataQualityWarnings : undefined,
        },
        debug: {
          common_start: commonDates[0] ?? null,
          common_end: commonDates[commonDates.length - 1] ?? null,
          resolved_symbols: Object.fromEntries(
            Array.from(assetData.entries()).map(([t, d]) => [t, d.resolvedSymbol ?? null]),
          ),
        },
      },
      errors: errors.length > 0 ? errors : undefined,
      warnings: dataQualityWarnings.length > 0 ? dataQualityWarnings : undefined,
    };

    console.log('Peer group data fetch completed');

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
