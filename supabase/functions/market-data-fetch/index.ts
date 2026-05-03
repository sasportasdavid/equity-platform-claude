import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchMarketData,
  fetchRiskFreeRate,
  fetchRiskFreeRateForTicker,
  detectCurrencyFromTicker,
  MarketDataResult,
} from '../_shared/marketDataService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketDataRequest {
  org_id?: string;
  plan_id?: string;
  ticker: string;
  lookback_days?: number;
  as_of_date: string;
  currency?: string;
  rate_flat?: number;
  bypass_cache?: boolean;
  preview_only?: boolean; // If true, only fetch data without saving to DB
  maturity_years?: number; // Plan/condition maturity (years). Used for RFR lookup and (if lookback_days not provided) volatility lookback.
  winsorizing_pct?: number; // Winsorization percentage for extreme returns (0-20%, default 0 = disabled)
  price_type?: 'CLOSE' | 'OPEN'; // Price type for volatility calculation (default: CLOSE)
}

interface CacheEntry {
  id: string;
  ticker: string;
  as_of_date: string;
  lookback_days: number;
  spot_price: number;
  dividend_yield: number;
  annualized_volatility: number;
  currency: string;
  price_points: number;
  raw_data: {
    startDate: string;
    endDate: string;
    sampleSize: number;
    // Raw time series for transparency
    dates?: string[];
    prices?: number[];
    returns?: number[];
  };
  expires_at: string;
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header for user context
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Parse request body
    const body: MarketDataRequest = await req.json();
    const {
      org_id,
      plan_id,
      as_of_date,
      currency,
      rate_flat,
      bypass_cache,
      preview_only,
      maturity_years,
      winsorizing_pct,
      price_type,
    } = body;
    let { ticker } = body;

    // Price type for volatility calculation (default: CLOSE for IFRS 2 compliance)
    const effectivePriceType = price_type === 'OPEN' ? 'open' : 'close';

    // IFRS 2: volatility lookback should match the plan's actual duration.
    // If maturity_years is provided, use it exactly (no minimum). Fallback to 3 years only if missing.
    const DEFAULT_LOOKBACK_YEARS = 3;
    const effectiveMaturityYears =
      typeof maturity_years === 'number' && Number.isFinite(maturity_years) && maturity_years > 0
        ? maturity_years
        : null;

    // Use exact plan duration for lookback (IFRS 2 best practice: lookback = plan maturity)
    const computedLookbackDaysFromMaturity = effectiveMaturityYears
      ? Math.round(effectiveMaturityYears * 365)
      : Math.round(DEFAULT_LOOKBACK_YEARS * 365);

    const lookback_days =
      typeof body.lookback_days === 'number' &&
      Number.isFinite(body.lookback_days) &&
      body.lookback_days > 0
        ? Math.round(body.lookback_days)
        : computedLookbackDaysFromMaturity;

    // Winsorization: validate and clamp to 0-20%
    const effectiveWinsorizingPct =
      typeof winsorizing_pct === 'number' &&
      Number.isFinite(winsorizing_pct) &&
      winsorizing_pct >= 0 &&
      winsorizing_pct <= 20
        ? winsorizing_pct
        : 0;

    console.log('[IFRS2][VOL] lookback_days resolution', {
      provided_lookback_days: body.lookback_days,
      maturity_years: effectiveMaturityYears,
      computed_from_maturity: computedLookbackDaysFromMaturity,
      effective_lookback_days: lookback_days,
      winsorizing_pct: effectiveWinsorizingPct,
      price_type: effectivePriceType,
    });

    // Validate required fields - ticker and as_of_date are always required
    if (!ticker || !as_of_date) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: ticker, as_of_date',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // For non-preview mode, org_id and plan_id are required
    if (!preview_only && (!org_id || !plan_id)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: org_id, plan_id (required when not in preview mode)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- ISIN TO TICKER RESOLUTION ---
    const originalInput = ticker;
    if (isISIN(ticker)) {
      console.log(`Detected ISIN format: ${ticker}, attempting resolution...`);
      const resolvedTicker = await resolveISINToTicker(ticker);

      if (resolvedTicker) {
        ticker = resolvedTicker;
        console.log(`Using resolved ticker ${ticker} (from ISIN ${originalInput})`);
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              `Impossible de résoudre l'ISIN "${originalInput}" vers un symbole Yahoo Finance. ` +
              `Vérifiez que l'ISIN est correct ou utilisez directement le symbole boursier ` +
              `(ex: BN.PA pour Danone, MC.PA pour LVMH).`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    console.log(
      `Processing market data request for ticker ${ticker}${plan_id ? `, plan ${plan_id}` : ' (preview mode)'}`,
    );

    // Verify plan belongs to org (skip in preview mode)
    let plan: { id: string; company_id: string; org_id: string } | null = null;

    if (!preview_only && plan_id && org_id) {
      const { data: planData, error: planError } = await supabase
        .from('plans')
        .select('id, company_id, org_id')
        .eq('id', plan_id)
        .eq('org_id', org_id)
        .single();

      if (planError || !planData) {
        console.error('Plan verification failed:', planError);
        return new Response(
          JSON.stringify({ success: false, error: 'Plan not found or access denied' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      plan = planData;
    }

    // Check cache first (unless bypass_cache is true)
    let marketData: MarketDataResult;
    let fromCache = false;

    if (!bypass_cache) {
      const { data: cachedData } = await supabase
        .from('market_data_cache')
        .select('*')
        .eq('ticker', ticker.toUpperCase())
        .eq('as_of_date', as_of_date)
        .eq('lookback_days', lookback_days)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cachedData) {
        console.log(`Cache hit for ${ticker} as of ${as_of_date}`);
        const cache = cachedData as CacheEntry;
        marketData = {
          ticker: cache.ticker,
          s0: cache.spot_price,
          dividendYield: cache.dividend_yield,
          currency: cache.currency,
          dataPoints: cache.price_points,
          asOfDate: cache.as_of_date,
          volatility: {
            sigma: cache.annualized_volatility,
            meanDailyReturn: 0,
            sampleSize: cache.raw_data?.sampleSize ?? cache.price_points,
            startDate: cache.raw_data?.startDate ?? '',
            endDate: cache.raw_data?.endDate ?? '',
          },
          dataSource: 'EODHD', // Cached data - assume EODHD
        };
        fromCache = true;
      }
    }

    // Fetch from Yahoo if not in cache
    if (!marketData!) {
      try {
        marketData = await fetchMarketData(
          ticker,
          lookback_days,
          as_of_date,
          effectiveWinsorizingPct,
          effectivePriceType,
        );
        console.log(`Market data fetched from EODHD:`, {
          s0: marketData.s0,
          volatility: marketData.volatility.sigma,
          dividendYield: marketData.dividendYield,
          dataPoints: marketData.dataPoints,
          winsorization: marketData.winsorization,
        });

        // DATA QUALITY CHECK: Require 90% data coverage for IFRS 2 audit compliance
        const expectedDataPoints = Math.floor(lookback_days * (252 / 365)); // Trading days approximation
        const actualDataPoints = marketData.volatility.sampleSize;
        const dataCoverage = actualDataPoints / expectedDataPoints;
        const DATA_QUALITY_THRESHOLD = 0.9; // 90% minimum coverage required

        if (dataCoverage < DATA_QUALITY_THRESHOLD) {
          console.error(
            `[IFRS2] Data quality check FAILED: ${(dataCoverage * 100).toFixed(1)}% coverage < ${DATA_QUALITY_THRESHOLD * 100}% required`,
          );
          console.error(
            `[IFRS2] Expected: ${expectedDataPoints} points, Got: ${actualDataPoints} points`,
          );
          return new Response(
            JSON.stringify({
              success: false,
              error:
                `Données historiques insuffisantes pour un audit IFRS 2 fiable. ` +
                `Couverture: ${(dataCoverage * 100).toFixed(1)}% (minimum requis: ${DATA_QUALITY_THRESHOLD * 100}%). ` +
                `Points attendus: ~${expectedDataPoints}, Points obtenus: ${actualDataPoints}. ` +
                `Vérifiez que le symbole "${ticker}" a suffisamment d'historique de cotation.`,
              data_quality: {
                expected_points: expectedDataPoints,
                actual_points: actualDataPoints,
                coverage_pct: dataCoverage * 100,
                threshold_pct: DATA_QUALITY_THRESHOLD * 100,
              },
            }),
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        console.log(
          `[IFRS2] Data quality check PASSED: ${(dataCoverage * 100).toFixed(1)}% coverage >= ${DATA_QUALITY_THRESHOLD * 100}% threshold`,
        );

        // Save to cache (including raw time series for transparency)
        const cacheData = {
          ticker: ticker.toUpperCase(),
          as_of_date,
          lookback_days,
          spot_price: marketData.s0,
          dividend_yield: marketData.dividendYield,
          annualized_volatility: marketData.volatility.sigma,
          currency: marketData.currency,
          price_points: marketData.dataPoints,
          raw_data: {
            startDate: marketData.volatility.startDate,
            endDate: marketData.volatility.endDate,
            sampleSize: marketData.volatility.sampleSize,
            // Include full time series for audit/transparency
            dates: marketData.rawTimeSeries?.dates,
            prices: marketData.rawTimeSeries?.prices,
            returns: marketData.rawTimeSeries?.returns,
          },
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
        };

        const { error: cacheError } = await supabase
          .from('market_data_cache')
          .upsert(cacheData, { onConflict: 'ticker,as_of_date,lookback_days' });

        if (cacheError) {
          console.warn('Failed to cache market data:', cacheError);
        } else {
          console.log(`Cached market data for ${ticker}`);
        }
      } catch (fetchError) {
        console.error('Yahoo Finance fetch error:', fetchError);
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';

        // Provide helpful guidance for common errors
        let userFriendlyError = `Failed to fetch market data: ${errorMessage}`;

        if (errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found')) {
          userFriendlyError =
            `Symbole "${ticker}" non trouvé sur EODHD. ` +
            `Utilisez le format CODE.EXCHANGE (ex: BN.PA pour Danone, AAPL.US pour Apple, CAC.PA pour CAC 40). ` +
            `Pour les indices, utilisez le suffixe .INDX (ex: GSPC.INDX pour S&P 500).`;
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: userFriendlyError,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // --- RISK-FREE RATE LOOKUP WITH AUTOMATIC CURRENCY DETECTION ---
    // Fetch risk-free rate based on the asset's currency (detected from ticker)
    let riskFreeRateData: {
      rate: number;
      ticker: string;
      asOfDate: string;
      currency: string;
      detectedFrom?: string;
    } | null = null;
    let effectiveRateFlat = rate_flat ?? 0;
    let detectedCurrency = detectCurrencyFromTicker(ticker);

    if (maturity_years && maturity_years > 0) {
      console.log(`[RFR] Auto-detecting currency from ticker ${ticker}...`);

      // Use automatic currency detection
      riskFreeRateData = await fetchRiskFreeRateForTicker(ticker, maturity_years, as_of_date);

      if (riskFreeRateData) {
        // Only use fetched rate if user didn't provide one explicitly
        if (rate_flat === undefined || rate_flat === null || rate_flat === 0) {
          effectiveRateFlat = riskFreeRateData.rate;
          console.log(
            `[RFR] Using fetched rate: ${(effectiveRateFlat * 100).toFixed(3)}% from ${riskFreeRateData.ticker} (${riskFreeRateData.currency})`,
          );
        } else {
          console.log(
            `[RFR] User provided rate_flat=${rate_flat}, keeping it. Fetched rate was ${(riskFreeRateData.rate * 100).toFixed(3)}% (${riskFreeRateData.currency})`,
          );
        }
        detectedCurrency = riskFreeRateData.currency;
      }
    }

    // In preview mode, just return the market data without saving
    if (preview_only) {
      // IFRS 2: Dividend yield must be a decimal (e.g., 0.03 for 3%)
      // EODHD returns it as a decimal already (0.03), but we add explicit logging for audit
      const dividendYieldDecimal = marketData.dividendYield; // Already decimal from fetchMarketData
      console.log(
        `[DIVIDEND] Ticker ${ticker}: dividendYield=${dividendYieldDecimal} (${(dividendYieldDecimal * 100).toFixed(2)}%)`,
      );

      const response = {
        success: true,
        preview_only: true,
        from_cache: fromCache,
        market_data: {
          ticker: marketData.ticker,
          s0: marketData.s0,
          // ALIASES for Python engine compatibility
          S0: marketData.s0, // Python expects S0
          sigma: marketData.volatility.sigma, // Python expects sigma
          q: dividendYieldDecimal, // Python expects q (decimal)
          r: effectiveRateFlat, // Python expects r (decimal)
          // Original field names for backward compatibility
          volatility: marketData.volatility.sigma,
          dividend_yield: dividendYieldDecimal,
          currency: marketData.currency,
          detected_currency: detectedCurrency,
          data_points: marketData.dataPoints,
          lookback_days,
          as_of_date: as_of_date, // Include as_of_date for orchestrator
          period_start: marketData.volatility.startDate,
          period_end: marketData.volatility.endDate,
          sample_size: marketData.volatility.sampleSize,
          // IFRS 2 Volatility Diagnostics
          volatility_diagnostics: marketData.volatilityDiagnostics,
          // Price type used for volatility AND S0 calculation
          volatility_price_type: effectivePriceType.toUpperCase(),
          spot_price_source: effectivePriceType.toUpperCase(), // Explicit S0 source for audit
          // Winsorization info
          winsorizing_applied: marketData.winsorization?.applied ?? false,
          winsorizing_pct: marketData.winsorization?.pct ?? 0,
          original_volatility:
            marketData.winsorization?.original_volatility ?? marketData.volatility.sigma,
          // Include risk-free rate data with currency info
          risk_free_rate: effectiveRateFlat,
          risk_free_rate_source: riskFreeRateData
            ? {
                ticker: riskFreeRateData.ticker,
                as_of_date: riskFreeRateData.asOfDate,
                rate_pct: riskFreeRateData.rate * 100,
                currency: riskFreeRateData.currency,
                detected_from: riskFreeRateData.detectedFrom,
              }
            : null,
        },
      };

      console.log(`Market data preview completed (from_cache: ${fromCache})`);

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create hypothesis_set with the fetched data (only in non-preview mode)
    const hypothesisSetData = {
      org_id,
      plan_id,
      company_id: plan!.company_id,
      as_of_date,
      s0: marketData.s0,
      vol_method: 'HISTORICAL',
      dividend_yield: marketData.dividendYield,
      rate_flat: effectiveRateFlat,
      description: `Auto-generated from EODHD (${ticker}) - ${marketData.dataPoints} data points over ${lookback_days} days${fromCache ? ' (cached)' : ''}${riskFreeRateData ? ` | RFR: ${riskFreeRateData.ticker}` : ''}`,
    };

    const { data: hypothesisSet, error: insertError } = await supabase
      .from('hypothesis_sets')
      .insert(hypothesisSetData)
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create hypothesis_set:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to save hypothesis set: ${insertError.message}`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create volatility_scheme linked to the hypothesis_set
    const volatilitySchemeData = {
      org_id,
      hypothesis_set_id: hypothesisSet.id,
      annualized_sigma: marketData.volatility.sigma,
      lookback_period_days: lookback_days,
      method: 'HISTORICAL',
      notes: `Computed from ${marketData.volatility.sampleSize} daily log-returns (${marketData.volatility.startDate} to ${marketData.volatility.endDate})${fromCache ? ' - from cache' : ''}`,
    };

    const { error: volError } = await supabase
      .from('volatility_schemes')
      .insert(volatilitySchemeData);

    if (volError) {
      console.warn('Failed to create volatility_scheme:', volError);
    }

    // NOTE: We intentionally do NOT update the companies.ticker here
    // Each plan has its own hypothesis_set with specific market data
    // Updating companies.ticker would affect all plans for this company

    // IFRS 2: Dividend yield must be a decimal (e.g., 0.03 for 3%)
    const dividendYieldDecimal = marketData.dividendYield;
    console.log(
      `[DIVIDEND] Ticker ${ticker}: dividendYield=${dividendYieldDecimal} (${(dividendYieldDecimal * 100).toFixed(2)}%)`,
    );

    // Return success response
    const response = {
      success: true,
      hypothesis_set: hypothesisSet,
      from_cache: fromCache,
      market_data: {
        ticker: marketData.ticker,
        s0: marketData.s0,
        // ALIASES for Python engine compatibility
        S0: marketData.s0, // Python expects S0
        sigma: marketData.volatility.sigma, // Python expects sigma
        q: dividendYieldDecimal, // Python expects q (decimal)
        r: effectiveRateFlat, // Python expects r (decimal)
        // Original field names for backward compatibility
        volatility: marketData.volatility.sigma,
        dividend_yield: dividendYieldDecimal,
        currency: marketData.currency,
        detected_currency: detectedCurrency,
        data_points: marketData.dataPoints,
        lookback_days,
        as_of_date: as_of_date, // Include as_of_date for orchestrator
        period_start: marketData.volatility.startDate,
        period_end: marketData.volatility.endDate,
        sample_size: marketData.volatility.sampleSize,
        // IFRS 2 Volatility Diagnostics
        volatility_diagnostics: marketData.volatilityDiagnostics,
        // Price type used for volatility AND S0 calculation
        volatility_price_type: effectivePriceType.toUpperCase(),
        spot_price_source: effectivePriceType.toUpperCase(), // Explicit S0 source for audit
        // Winsorization info
        winsorizing_applied: marketData.winsorization?.applied ?? false,
        winsorizing_pct: marketData.winsorization?.pct ?? 0,
        original_volatility:
          marketData.winsorization?.original_volatility ?? marketData.volatility.sigma,
        // Include risk-free rate data with currency info
        risk_free_rate: effectiveRateFlat,
        risk_free_rate_source: riskFreeRateData
          ? {
              ticker: riskFreeRateData.ticker,
              as_of_date: riskFreeRateData.asOfDate,
              rate_pct: riskFreeRateData.rate * 100,
              currency: riskFreeRateData.currency,
              detected_from: riskFreeRateData.detectedFrom,
            }
          : null,
      },
    };

    console.log(`Market data fetch completed successfully (from_cache: ${fromCache})`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in market-data-fetch:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
