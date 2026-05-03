/**
 * Market Data Service - EOD Historical Data (EODHD) Integration
 * Professional-grade market data for IFRS 2 compliance
 * Replaces Yahoo Finance with EODHD for reliable historical data
 */

export interface HistoricalPricePoint {
  date: string;
  close: number;
  open?: number;
  adjustedClose?: number;
  volume?: number;
}

export interface VolatilityResult {
  sigma: number;
  meanDailyReturn: number;
  sampleSize: number;
  startDate: string;
  endDate: string;
}

/**
 * Extended volatility diagnostics for IFRS 2 audit compliance
 * Compares adjusted vs raw price series and detects corporate actions
 */
export interface VolatilityDiagnostics {
  /** Official volatility using adjusted_close (IFRS 2 compliant) */
  volatility_adjusted: number;
  /** Volatility using raw close (for comparison only) */
  volatility_raw: number;
  /** Number of days where close != adjusted_close */
  days_with_diff: number;
  /** Maximum difference in log-returns between raw and adjusted series */
  max_diff_log_return: number;
  /** Number of outliers excluded (|log_return| > 40%) */
  outliers_excluded: number;
  /** True if ex-dividend pattern detected (raw drops >2% while adjusted stable) */
  ex_div_likely: boolean;
  /** Sample size after outlier filtering */
  sample_size_filtered: number;
  /** Sample size before filtering */
  sample_size_raw: number;
}

export interface RawTimeSeries {
  dates: string[];
  prices: number[];
  returns: number[];
}

export interface MarketDataResult {
  ticker: string;
  s0: number;
  dividendYield: number;
  volatility: VolatilityResult;
  currency: string;
  asOfDate: string;
  dataPoints: number;
  rawTimeSeries?: RawTimeSeries;
  dataSource: 'EODHD' | 'YAHOO';
  /** IFRS 2 volatility diagnostics comparing adjusted vs raw */
  volatilityDiagnostics?: VolatilityDiagnostics;
  /** Winsorization info if applied */
  winsorization?: {
    applied: boolean;
    pct: number;
    original_volatility: number;
  };
}

export interface YahooQuoteResult {
  regularMarketPrice?: number;
  trailingAnnualDividendYield?: number;
  trailingAnnualDividendRate?: number;
  currency?: string;
}

export interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
}

// EODHD API response interface
interface EODHDPricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

// EODHD exchange mappings for common Yahoo Finance tickers
const YAHOO_TO_EODHD_EXCHANGE: Record<string, string> = {
  // Euronext Paris
  '.PA': '.PA',
  '.PAR': '.PA',
  // Frankfurt
  '.DE': '.XETRA',
  '.F': '.F',
  // London
  '.L': '.LSE',
  // Swiss
  '.SW': '.SW',
  // US exchanges (default)
  '': '.US',
};

// Index ticker mappings: Yahoo (^XXX) -> EODHD
// EODHD supports many STOXX indices directly via .INDX suffix
// Fallback to iShares ETFs if direct index data is unavailable
const INDEX_MAPPINGS: Record<string, string> = {
  // French indices
  '^FCHI': 'CAC.PA', // CAC 40 on Euronext (direct)
  // European STOXX indices - try direct index first, mapped to INDX
  '^STOXX50E': 'SX5E.INDX', // Euro STOXX 50 (direct index)
  '^STOXX': 'SXXP.INDX', // STOXX Europe 600 (direct index)
  // STOXX 600 sector indices - use direct INDX format
  // Note: These may require EODHD Index subscription
  '^SX3P': 'SX3P.INDX', // Food & Beverage (direct index)
  '^SXAP': 'SXAP.INDX', // Automobiles (direct index)
  '^SXDP': 'SXDP.INDX', // Healthcare (direct index)
  '^SXEP': 'SXEP.INDX', // Energy (direct index)
  '^SXFP': 'SXFP.INDX', // Financial Services (direct index)
  '^SXIP': 'SXIP.INDX', // Industrial Goods (direct index)
  '^SXKP': 'SXKP.INDX', // Technology (direct index)
  '^SXMP': 'SXMP.INDX', // Basic Materials (direct index)
  '^SXNP': 'SXNP.INDX', // Utilities (direct index)
  '^SXPP': 'SXPP.INDX', // Personal & Household Goods (direct index)
  '^SXQP': 'SXQP.INDX', // Retail (direct index)
  '^SXQR': 'SXPP.INDX', // Personal & Household Goods (alt code)
  '^SXRP': 'SXRP.INDX', // Real Estate (direct index)
  '^SXTP': 'SXTP.INDX', // Telecom (direct index)
  // US indices
  '^GSPC': 'GSPC.INDX', // S&P 500
  '^DJI': 'DJI.INDX', // Dow Jones
  '^IXIC': 'IXIC.INDX', // NASDAQ
  '^VIX': 'VIX.INDX', // VIX
  // German indices
  '^GDAXI': 'GDAXI.INDX', // DAX
  // UK indices
  '^FTSE': 'FTSE.INDX', // FTSE 100
};

// Fallback ETF mappings if direct index data is unavailable from EODHD
const INDEX_ETF_FALLBACKS: Record<string, string> = {
  '^STOXX50E': 'SX5EEX.XETRA', // Euro STOXX 50 ETF
  '^STOXX': 'EXSA.XETRA', // STOXX Europe 600 ETF
  '^SX3P': 'EXV1.XETRA', // Food & Beverage -> iShares ETF
  '^SXAP': 'EXH1.XETRA', // Automobiles -> iShares ETF
  '^SXDP': 'EXV4.XETRA', // Healthcare -> iShares ETF
  '^SXEP': 'EXV6.XETRA', // Energy -> iShares ETF
  '^SXFP': 'EXH2.XETRA', // Financial Services -> iShares ETF
  '^SXIP': 'EXH4.XETRA', // Industrial Goods -> iShares ETF
  '^SXKP': 'EXV5.XETRA', // Technology -> iShares ETF
  '^SXMP': 'EXV7.XETRA', // Basic Materials -> iShares ETF
  '^SXNP': 'EXH9.XETRA', // Utilities -> iShares ETF
  '^SXPP': 'EXV2.XETRA', // Personal & Household Goods -> iShares ETF
  '^SXQP': 'EXH8.XETRA', // Retail -> iShares ETF
  '^SXRP': 'IPRP.XETRA', // Real Estate -> iShares Property ETF
  '^SXTP': 'EXV3.XETRA', // Telecom -> iShares ETF
};

/**
 * Converts a Yahoo Finance ticker to EODHD format
 * Examples:
 *   BN.PA -> BN.PA (same)
 *   ^FCHI -> CAC.PA
 *   AAPL -> AAPL.US
 */
function convertToEODHDTicker(yahooTicker: string): string {
  const upperTicker = yahooTicker.toUpperCase();

  // Check if it's a known index mapping first
  if (INDEX_MAPPINGS[upperTicker]) {
    console.log(`[EODHD] Index mapping: ${yahooTicker} -> ${INDEX_MAPPINGS[upperTicker]}`);
    return INDEX_MAPPINGS[upperTicker];
  }

  // Handle generic index format: ^XXX -> XXX.INDX
  if (upperTicker.startsWith('^')) {
    const indexCode = upperTicker.slice(1) + '.INDX';
    console.log(`[EODHD] Generic index conversion: ${yahooTicker} -> ${indexCode}`);
    return indexCode;
  }

  // Check if ticker already has an exchange suffix
  const dotIndex = yahooTicker.lastIndexOf('.');
  if (dotIndex > 0) {
    // Already has an exchange suffix, use as-is (EODHD uses similar format)
    return yahooTicker;
  }

  // No suffix - assume US equity
  return `${yahooTicker}.US`;
}

/**
 * Gets the ETF fallback ticker for an index if available
 */
function getIndexETFFallback(yahooTicker: string): string | null {
  const upperTicker = yahooTicker.toUpperCase();
  return INDEX_ETF_FALLBACKS[upperTicker] || null;
}

/**
 * Fetches historical prices from EODHD API
 */
export async function fetchHistoricalPrices(
  ticker: string,
  lookbackDays: number,
  asOfDate?: string,
): Promise<{ prices: HistoricalPricePoint[]; meta: YahooChartMeta }> {
  const apiToken = Deno.env.get('EODHD_API_KEY');

  if (!apiToken) {
    console.error('[EODHD] API token not configured, falling back to Yahoo Finance');
    return fetchHistoricalPricesYahoo(ticker, lookbackDays, asOfDate);
  }

  const eodhTicker = convertToEODHDTicker(ticker);
  const etfFallback = getIndexETFFallback(ticker);
  const endDate = asOfDate ? new Date(asOfDate) : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - lookbackDays);

  const fromDateStr = startDate.toISOString().split('T')[0];
  const toDateStr = endDate.toISOString().split('T')[0];

  // Try primary ticker first, then fallback ETF if available
  const tickersToTry = [eodhTicker];
  if (etfFallback && etfFallback !== eodhTicker) {
    tickersToTry.push(etfFallback);
  }

  let lastError: Error | null = null;

  for (const tryTicker of tickersToTry) {
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(tryTicker)}?api_token=${apiToken}&from=${fromDateStr}&to=${toDateStr}&fmt=json`;

    console.log(
      `[EODHD] Fetching historical prices for ${tryTicker} from ${fromDateStr} to ${toDateStr}`,
    );

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EODHD] API error for ${tryTicker}: ${response.status} - ${errorText}`);

        if (response.status === 404) {
          lastError = new Error(`Ticker "${tryTicker}" non trouvé sur EODHD`);
          continue; // Try next ticker
        }

        lastError = new Error(`EODHD API error: ${response.status}`);
        continue;
      }

      const data: EODHDPricePoint[] = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        console.warn(`[EODHD] No data returned for ${tryTicker}`);
        lastError = new Error(`Aucune donnée disponible pour ${tryTicker} sur EODHD`);
        continue;
      }

      console.log(`[EODHD] Fetched ${data.length} price points for ${tryTicker}`);
      if (tryTicker !== eodhTicker) {
        console.log(`[EODHD] Using ETF fallback ${tryTicker} instead of index ${eodhTicker}`);
      }

      // Convert EODHD format to our internal format
      const prices: HistoricalPricePoint[] = data.map((point) => ({
        date: point.date,
        close: point.close,
        open: point.open,
        adjustedClose: point.adjusted_close,
        volume: point.volume,
      }));

      // Extract currency from ticker suffix
      let currency = 'USD';
      if (tryTicker.includes('.PA')) currency = 'EUR';
      else if (tryTicker.includes('.XETRA') || tryTicker.includes('.F')) currency = 'EUR';
      else if (tryTicker.includes('.LSE') || tryTicker.includes('.L')) currency = 'GBP';
      else if (tryTicker.includes('.SW')) currency = 'CHF';
      else if (tryTicker.includes('.INDX')) {
        // For indices, try to infer currency from index name
        if (tryTicker.startsWith('CAC') || tryTicker.startsWith('SX')) currency = 'EUR';
        else if (tryTicker.startsWith('FTSE')) currency = 'GBP';
        else if (tryTicker.startsWith('DAX') || tryTicker.startsWith('GDAXI')) currency = 'EUR';
      }

      const lastPrice = prices[prices.length - 1];

      // Use RAW close for regularMarketPrice (S0) - NOT adjusted_close
      // Adjusted prices would double-count dividend effects in valuation
      const meta: YahooChartMeta = {
        currency,
        symbol: tryTicker,
        regularMarketPrice: lastPrice?.close, // RAW close price for S0
        previousClose: prices.length > 1 ? prices[prices.length - 2]?.close : undefined,
      };

      console.log(`[EODHD] Metadata for ${tryTicker}:`, {
        currency: meta.currency,
        regularMarketPrice: meta.regularMarketPrice,
        rawClose: lastPrice?.close,
        adjustedClose: lastPrice?.adjustedClose,
        difference: lastPrice
          ? ((lastPrice.adjustedClose ?? lastPrice.close) - lastPrice.close).toFixed(4)
          : 'N/A',
        dataPoints: prices.length,
        dateRange: `${prices[0]?.date} to ${lastPrice?.date}`,
      });

      return { prices, meta };
    } catch (error) {
      console.error(`[EODHD] Error fetching ${tryTicker}:`, error);
      lastError = error instanceof Error ? error : new Error('Unknown error');
      // Continue to try next ticker
    }
  }

  // All tickers failed
  throw new Error(
    `Impossible de récupérer les données pour ${ticker}. ${lastError?.message || 'Erreur inconnue'}`,
  );
}

/**
 * Fallback to Yahoo Finance (legacy, for backwards compatibility)
 */
async function fetchHistoricalPricesYahoo(
  ticker: string,
  lookbackDays: number,
  asOfDate?: string,
): Promise<{ prices: HistoricalPricePoint[]; meta: YahooChartMeta }> {
  console.warn('[Yahoo] Using Yahoo Finance fallback - EODHD token not configured');

  const endDate = asOfDate ? new Date(asOfDate) : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - lookbackDays);

  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  console.log(
    `[Yahoo] Fetching historical prices for ${ticker} from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
  );

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Yahoo] API error: ${response.status} - ${errorText}`);
    throw new Error(`Failed to fetch data for ticker ${ticker}: ${response.status}`);
  }

  const data = await response.json();

  if (data.chart?.error) {
    throw new Error(`Yahoo Finance error: ${data.chart.error.description || 'Unknown error'}`);
  }

  const result = data.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error(`No data available for ticker ${ticker}`);
  }

  const meta: YahooChartMeta = {
    currency: result.meta?.currency,
    symbol: result.meta?.symbol,
    regularMarketPrice: result.meta?.regularMarketPrice,
    previousClose: result.meta?.previousClose,
  };

  const timestamps = result.timestamp as number[];
  const quotes = result.indicators.quote[0];
  const adjClose = result.indicators.adjclose?.[0]?.adjclose;

  const prices: HistoricalPricePoint[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = quotes.close?.[i];
    if (close != null && !isNaN(close)) {
      prices.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        close: close,
        adjustedClose: adjClose?.[i] ?? close,
        volume: quotes.volume?.[i],
      });
    }
  }

  console.log(`[Yahoo] Fetched ${prices.length} price points for ${ticker}`);
  return { prices, meta };
}

/**
 * Fetches current quote data including dividend yield from EODHD
 */
export async function fetchQuoteData(ticker: string): Promise<YahooQuoteResult> {
  const apiToken = Deno.env.get('EODHD_API_KEY');

  if (!apiToken) {
    console.warn('[EODHD] API token not configured for quote data');
    return {};
  }

  const eodhTicker = convertToEODHDTicker(ticker);
  const url = `https://eodhd.com/api/real-time/${encodeURIComponent(eodhTicker)}?api_token=${apiToken}&fmt=json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[EODHD] Quote API returned ${response.status} for ${eodhTicker}`);
      return {};
    }

    const data = await response.json();

    const result: YahooQuoteResult = {
      regularMarketPrice: data.close,
      currency: undefined, // EODHD doesn't return currency in real-time endpoint
    };

    console.log(`[EODHD] Quote data for ${eodhTicker}:`, {
      price: result.regularMarketPrice,
    });

    return result;
  } catch (error) {
    console.warn(`[EODHD] Error fetching quote for ${eodhTicker}:`, error);
    return {};
  }
}

/**
 * Safely extracts a numeric dividend yield from various value formats
 * EODHD may return: number, string, or null
 */
function parseYieldValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * Fetches dividend data from EODHD using full fundamentals endpoint (no filter)
 * Uses a cascade/waterfall strategy to find dividend yield in multiple locations
 */
async function fetchDividendYield(ticker: string): Promise<number> {
  const apiToken = Deno.env.get('EODHD_API_KEY');

  if (!apiToken) {
    console.log(`[EODHD] No API token - skipping dividend fetch for ${ticker}`);
    return 0;
  }

  const eodhTicker = convertToEODHDTicker(ticker);

  // Skip dividend fetch for indices
  if (eodhTicker.includes('.INDX')) {
    console.log(`[EODHD] Skipping dividend for index: ${eodhTicker}`);
    return 0;
  }

  // NO FILTER - fetch full fundamentals to maximize dividend data discovery
  const url = `https://eodhd.com/api/fundamentals/${encodeURIComponent(eodhTicker)}?api_token=${apiToken}&fmt=json`;

  // Yahoo fallback - useful when EODHD fundamentals don't return DividendYield
  const fetchYahooDividendYield = async (): Promise<number> => {
    try {
      console.log(`[YAHOO] Attempting dividend fallback for ${ticker}...`);
      const yahooUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail`;
      const res = await fetch(yahooUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!res.ok) {
        console.warn(`[YAHOO] API returned ${res.status} for ${ticker}`);
        await res.text(); // Consume body to prevent leak
        return 0;
      }
      const json = await res.json();
      const raw = json?.quoteSummary?.result?.[0]?.summaryDetail?.dividendYield?.raw;
      const y = parseYieldValue(raw);
      if (y !== null && y > 0) {
        console.log(
          `[YAHOO] ✅ Found dividend yield for ${ticker}: ${(y * 100).toFixed(2)}% via summaryDetail.dividendYield.raw`,
        );
        return y;
      }
      console.log(`[YAHOO] No dividend yield found for ${ticker}`);
      return 0;
    } catch (e) {
      console.warn(`[YAHOO] Error fetching dividend for ${ticker}:`, e);
      return 0;
    }
  };

  try {
    console.log(`[EODHD] Fetching full fundamentals for ${eodhTicker} (no filter)...`);
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[EODHD] Fundamentals API returned ${response.status} for ${eodhTicker}`);
      await response.text(); // Consume body to prevent leak
      return await fetchYahooDividendYield();
    }

    const data = await response.json();

    // CASCADE/WATERFALL STRATEGY: Try multiple paths in priority order
    // Different tickers may have dividend data in different locations
    const cascadePaths: { path: string; getValue: () => unknown }[] = [
      { path: 'Highlights.DividendYield', getValue: () => data?.Highlights?.DividendYield },
      { path: 'Valuation.DividendYield', getValue: () => data?.Valuation?.DividendYield },
      { path: 'General.DividendYield', getValue: () => data?.General?.DividendYield },
      {
        path: 'SplitsDividends.DividendYield',
        getValue: () => data?.SplitsDividends?.DividendYield,
      },
      {
        path: 'Highlights.ForwardAnnualDividendYield',
        getValue: () => data?.Highlights?.ForwardAnnualDividendYield,
      },
      {
        path: 'Highlights.TrailingAnnualDividendYield',
        getValue: () => data?.Highlights?.TrailingAnnualDividendYield,
      },
    ];

    for (const { path, getValue } of cascadePaths) {
      const rawValue = getValue();
      const parsed = parseYieldValue(rawValue);

      if (parsed !== null && parsed > 0) {
        console.log(
          `[EODHD] ✅ Found dividend yield via path: ${path} = ${parsed} (${(parsed * 100).toFixed(2)}%) for ${eodhTicker}`,
        );
        return parsed;
      }
    }

    // Log what paths were checked but empty
    console.log(
      `[EODHD] ⚠️ No dividend yield found in any cascade path for ${eodhTicker}. Checked: ${cascadePaths.map((p) => p.path).join(', ')}`,
    );

    // Log available top-level keys for debugging
    const availableKeys = data ? Object.keys(data).slice(0, 10).join(', ') : 'none';
    console.log(`[EODHD] Available top-level keys: ${availableKeys}`);

    // Fallback to Yahoo
    console.log(`[EODHD] Falling back to Yahoo for ${ticker}...`);
    return await fetchYahooDividendYield();
  } catch (error) {
    console.warn(`[EODHD] Error fetching fundamentals for ${eodhTicker}:`, error);
    return await fetchYahooDividendYield();
  }
}

/**
 * PUBLIC: Fetches dividend yield for a peer asset from EODHD
 * Uses the same cascade strategy as fetchDividendYield
 * For peers, we use adjusted_close for volatility calculation,
 * so we set q=0 in simulations (dividend is already in the price)
 * This function is mainly for auditing purposes
 */
export async function fetchDividendYieldForPeer(
  ticker: string,
): Promise<{ dividendYield: number; note: string }> {
  const apiToken = Deno.env.get('EODHD_API_KEY');

  if (!apiToken) {
    console.log(
      `[DATA] Ticker: ${ticker} | Mode: PEER | Field Used: adjusted_close | q=0 (no API token)`,
    );
    return { dividendYield: 0, note: 'No EODHD API token - using adjusted_close with q=0' };
  }

  const eodhTicker = convertToEODHDTicker(ticker);

  // Skip dividend fetch for indices - they don't have dividends
  if (eodhTicker.includes('.INDX')) {
    console.log(`[DATA] Ticker: ${ticker} | Mode: INDEX | Field Used: adjusted_close | q=0`);
    return { dividendYield: 0, note: 'Index - no dividend' };
  }

  // NO FILTER - fetch full fundamentals for cascade lookup
  const url = `https://eodhd.com/api/fundamentals/${encodeURIComponent(eodhTicker)}?api_token=${apiToken}&fmt=json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.log(
        `[DATA] Ticker: ${ticker} | Mode: PEER | Field Used: adjusted_close | q=0 (API error ${response.status})`,
      );
      await response.text(); // Consume body to prevent leak
      return { dividendYield: 0, note: `EODHD API error ${response.status}` };
    }

    const data = await response.json();

    // CASCADE/WATERFALL STRATEGY for peers (same as main function)
    const cascadePaths: { path: string; getValue: () => unknown }[] = [
      { path: 'Highlights.DividendYield', getValue: () => data?.Highlights?.DividendYield },
      { path: 'Valuation.DividendYield', getValue: () => data?.Valuation?.DividendYield },
      { path: 'General.DividendYield', getValue: () => data?.General?.DividendYield },
      {
        path: 'SplitsDividends.DividendYield',
        getValue: () => data?.SplitsDividends?.DividendYield,
      },
      {
        path: 'Highlights.ForwardAnnualDividendYield',
        getValue: () => data?.Highlights?.ForwardAnnualDividendYield,
      },
      {
        path: 'Highlights.TrailingAnnualDividendYield',
        getValue: () => data?.Highlights?.TrailingAnnualDividendYield,
      },
    ];

    for (const { path, getValue } of cascadePaths) {
      const rawValue = getValue();
      const parsed = parseYieldValue(rawValue);

      if (parsed !== null && parsed > 0) {
        // IMPORTANT: For PEERS, we use adjusted_close, so q should be 0 in simulation
        // The dividend is already incorporated in the adjusted price series
        // We log the actual dividend for auditing, but return 0 for simulation
        console.log(
          `[DATA] Ticker: ${ticker} | Mode: PEER | Found via: ${path} | Actual Dividend: ${(parsed * 100).toFixed(2)}% | Simulation q=0 (already in adj. price)`,
        );
        return {
          dividendYield: 0, // Set to 0 because using adjusted_close
          note: `Peer uses adjusted_close - actual div ${(parsed * 100).toFixed(2)}% (via ${path}) already in price`,
        };
      }
    }

    console.log(`[DATA] Ticker: ${ticker} | Mode: PEER | No dividend found in cascade paths`);
    return { dividendYield: 0, note: 'No dividend data from EODHD (cascade exhausted)' };
  } catch (error) {
    console.warn(`[EODHD] Error fetching dividend for peer ${eodhTicker}:`, error);
    console.log(
      `[DATA] Ticker: ${ticker} | Mode: PEER | Field Used: adjusted_close | q=0 (fetch error)`,
    );
    return { dividendYield: 0, note: 'Error fetching dividend' };
  }
}

// ============================================================================
// CURRENCY DETECTION & MULTI-CURRENCY RISK-FREE RATES
// ============================================================================

/**
 * Exchange suffix to currency mapping
 * Based on EODHD exchange codes
 */
const EXCHANGE_TO_CURRENCY: Record<string, string> = {
  // Eurozone
  '.PA': 'EUR', // Euronext Paris
  '.PAR': 'EUR', // Euronext Paris (alt)
  '.XETRA': 'EUR', // Frankfurt XETRA
  '.F': 'EUR', // Frankfurt
  '.AS': 'EUR', // Amsterdam
  '.BR': 'EUR', // Brussels
  '.MI': 'EUR', // Milan
  '.MC': 'EUR', // Madrid
  '.LS': 'EUR', // Lisbon
  '.HE': 'EUR', // Helsinki
  '.IR': 'EUR', // Dublin
  '.AT': 'EUR', // Athens
  '.VI': 'EUR', // Vienna

  // United States
  '.US': 'USD', // US (default)
  '.NYSE': 'USD', // NYSE
  '.NASDAQ': 'USD', // NASDAQ
  '.AMEX': 'USD', // AMEX
  '.INDX': 'USD', // Indices (default USD, but overridden for specific indices)

  // United Kingdom
  '.LSE': 'GBP', // London Stock Exchange
  '.L': 'GBP', // London (alt)

  // Switzerland
  '.SW': 'CHF', // Swiss Exchange
  '.VX': 'CHF', // SIX Swiss (alt)

  // Japan
  '.TSE': 'JPY', // Tokyo Stock Exchange
  '.T': 'JPY', // Tokyo (alt)

  // Canada
  '.TO': 'CAD', // Toronto Stock Exchange
  '.V': 'CAD', // TSX Venture

  // Australia
  '.AU': 'AUD', // Australian Securities Exchange

  // Hong Kong
  '.HK': 'HKD', // Hong Kong Stock Exchange

  // Scandinavia
  '.ST': 'SEK', // Stockholm
  '.CO': 'DKK', // Copenhagen
  '.OL': 'NOK', // Oslo

  // Other
  '.SA': 'BRL', // Sao Paulo
  '.MX': 'MXN', // Mexico
  '.SG': 'SGD', // Singapore
};

/**
 * Government bond tickers by currency and maturity
 * Format: { currency: { short: ticker, medium: ticker, long: ticker } }
 */
const GOVERNMENT_BOND_TICKERS: Record<string, { short: string; medium: string; long: string }> = {
  // Eurozone - French OAT (reference for EUR)
  EUR: {
    short: 'FR3Y.GBOND', // 3-year OAT
    medium: 'FR5Y.GBOND', // 5-year OAT
    long: 'FR10Y.GBOND', // 10-year OAT
  },
  // United States - Treasury
  USD: {
    short: 'US3Y.GBOND', // 3-year Treasury
    medium: 'US5Y.GBOND', // 5-year Treasury
    long: 'US10Y.GBOND', // 10-year Treasury
  },
  // United Kingdom - Gilts
  GBP: {
    short: 'UK3Y.GBOND', // 3-year Gilt
    medium: 'UK5Y.GBOND', // 5-year Gilt
    long: 'UK10Y.GBOND', // 10-year Gilt
  },
  // Switzerland - Confederation bonds
  CHF: {
    short: 'CH3Y.GBOND', // 3-year Swiss
    medium: 'CH5Y.GBOND', // 5-year Swiss
    long: 'CH10Y.GBOND', // 10-year Swiss
  },
  // Japan - JGB
  JPY: {
    short: 'JP3Y.GBOND', // 3-year JGB
    medium: 'JP5Y.GBOND', // 5-year JGB
    long: 'JP10Y.GBOND', // 10-year JGB
  },
  // Canada - Government of Canada bonds
  CAD: {
    short: 'CA3Y.GBOND', // 3-year
    medium: 'CA5Y.GBOND', // 5-year
    long: 'CA10Y.GBOND', // 10-year
  },
  // Australia - Commonwealth bonds
  AUD: {
    short: 'AU3Y.GBOND', // 3-year
    medium: 'AU5Y.GBOND', // 5-year
    long: 'AU10Y.GBOND', // 10-year
  },
};

// Default currency if exchange not recognized
const DEFAULT_CURRENCY = 'EUR';

/**
 * Detects currency from a ticker based on its exchange suffix
 * @param ticker - EODHD format ticker (e.g., "AAPL.US", "BN.PA")
 * @returns ISO currency code (EUR, USD, GBP, CHF, JPY, etc.)
 */
export function detectCurrencyFromTicker(ticker: string): string {
  const upperTicker = ticker.toUpperCase();

  // Special handling for indices
  if (upperTicker.includes('.INDX')) {
    // European indices
    if (upperTicker.startsWith('SX') || upperTicker.includes('STOXX')) {
      return 'EUR';
    }
    // French CAC
    if (upperTicker.startsWith('CAC') || upperTicker === 'FCHI.INDX') {
      return 'EUR';
    }
    // German DAX
    if (upperTicker.startsWith('GDAXI') || upperTicker.startsWith('DAX')) {
      return 'EUR';
    }
    // UK FTSE
    if (upperTicker.startsWith('FTSE') || upperTicker.startsWith('UKX')) {
      return 'GBP';
    }
    // US indices (S&P, Dow, Nasdaq)
    if (
      upperTicker.startsWith('GSPC') ||
      upperTicker.startsWith('DJI') ||
      upperTicker.startsWith('IXIC')
    ) {
      return 'USD';
    }
    // Default to USD for other indices
    return 'USD';
  }

  // Extract exchange suffix
  const dotIndex = upperTicker.lastIndexOf('.');
  if (dotIndex > 0) {
    const suffix = upperTicker.substring(dotIndex);
    const currency = EXCHANGE_TO_CURRENCY[suffix];
    if (currency) {
      console.log(
        `[CURRENCY] Detected ${currency} from exchange suffix ${suffix} (ticker: ${ticker})`,
      );
      return currency;
    }
  }

  // Fallback: check for common patterns in ticker itself
  if (upperTicker.endsWith('.US') || /^[A-Z]{1,5}$/.test(upperTicker)) {
    console.log(`[CURRENCY] Assuming USD for ticker: ${ticker} (US pattern)`);
    return 'USD';
  }

  console.log(`[CURRENCY] Using default ${DEFAULT_CURRENCY} for ticker: ${ticker}`);
  return DEFAULT_CURRENCY;
}

/**
 * Gets the appropriate government bond ticker based on currency and maturity
 * @param currency - ISO currency code
 * @param maturityYears - Plan maturity in years
 * @returns EODHD bond ticker
 */
export function getBondTickerForCurrencyAndMaturity(
  currency: string,
  maturityYears: number,
): string {
  const upperCurrency = currency.toUpperCase();
  const bonds = GOVERNMENT_BOND_TICKERS[upperCurrency] || GOVERNMENT_BOND_TICKERS['EUR'];

  if (maturityYears < 4) {
    return bonds.short;
  } else if (maturityYears < 7) {
    return bonds.medium;
  } else {
    return bonds.long;
  }
}

/**
 * LEGACY: Determines the appropriate French government bond (OAT) ticker based on plan maturity
 * @deprecated Use getBondTickerForCurrencyAndMaturity instead
 * @param maturityYears - Expected plan duration in years
 * @returns EODHD ticker for the appropriate OAT
 */
function getOATTickerForMaturity(maturityYears: number): string {
  return getBondTickerForCurrencyAndMaturity('EUR', maturityYears);
}

/**
 * Fetches the risk-free rate from EODHD based on government bond yields
 * Supports multiple currencies: EUR (OAT), USD (Treasury), GBP (Gilts), CHF, JPY, CAD, AUD
 *
 * @param maturityYears - Plan maturity in years (used to select appropriate bond)
 * @param asOfDate - The reference date for the rate lookup
 * @param currency - Optional ISO currency code. If not provided, defaults to EUR (French OAT)
 * @returns Risk-free rate as a decimal (e.g., 0.025 for 2.5%), along with source info
 */
export async function fetchRiskFreeRate(
  maturityYears: number,
  asOfDate: string,
  currency: string = 'EUR',
): Promise<{ rate: number; ticker: string; asOfDate: string; currency: string } | null> {
  const apiToken = Deno.env.get('EODHD_API_KEY');

  if (!apiToken) {
    console.warn('[EODHD] API token not configured for risk-free rate fetch');
    return null;
  }

  const bondTicker = getBondTickerForCurrencyAndMaturity(currency, maturityYears);
  console.log(
    `[RFR] Fetching risk-free rate for ${currency} currency, maturity ${maturityYears}y using ${bondTicker}`,
  );

  // Fetch historical data around the as_of_date (get a few days to ensure we have data)
  const endDate = new Date(asOfDate);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 10); // Look back 10 days to ensure we get data

  const fromDateStr = startDate.toISOString().split('T')[0];
  const toDateStr = endDate.toISOString().split('T')[0];

  const url = `https://eodhd.com/api/eod/${encodeURIComponent(bondTicker)}?api_token=${apiToken}&from=${fromDateStr}&to=${toDateStr}&fmt=json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RFR] API error for ${bondTicker}: ${response.status} - ${errorText}`);

      // Fallback to EUR if the currency's bond data is not available
      if (currency !== 'EUR') {
        console.log(`[RFR] Falling back to EUR (OAT) for risk-free rate`);
        return fetchRiskFreeRate(maturityYears, asOfDate, 'EUR');
      }
      return null;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`[RFR] No data returned for ${bondTicker}`);

      // Fallback to EUR if the currency's bond data is not available
      if (currency !== 'EUR') {
        console.log(`[RFR] Falling back to EUR (OAT) for risk-free rate`);
        return fetchRiskFreeRate(maturityYears, asOfDate, 'EUR');
      }
      return null;
    }

    // Get the most recent data point (closest to asOfDate)
    // Sort by date descending and get the first one
    const sortedData = [...data].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Find the closest date to asOfDate that's not in the future
    const targetDate = new Date(asOfDate);
    let closestPoint = sortedData[0];

    for (const point of sortedData) {
      const pointDate = new Date(point.date);
      if (pointDate <= targetDate) {
        closestPoint = point;
        break;
      }
    }

    // EODHD returns bond yields as percentages (e.g., 2.5 for 2.5%)
    // Convert to decimal for financial calculations (2.5% -> 0.025)
    const yieldPercent = closestPoint.close;
    const rateDecimal = yieldPercent / 100;

    console.log(
      `[RFR] Risk-free rate from ${bondTicker} (${currency}) on ${closestPoint.date}: ${yieldPercent}% (${rateDecimal} decimal)`,
    );

    return {
      rate: rateDecimal,
      ticker: bondTicker,
      asOfDate: closestPoint.date,
      currency: currency.toUpperCase(),
    };
  } catch (error) {
    console.error(`[RFR] Error fetching risk-free rate for ${bondTicker}:`, error);

    // Fallback to EUR if error and not already EUR
    if (currency !== 'EUR') {
      console.log(`[RFR] Falling back to EUR (OAT) for risk-free rate`);
      return fetchRiskFreeRate(maturityYears, asOfDate, 'EUR');
    }
    return null;
  }
}

/**
 * Fetches the risk-free rate with automatic currency detection from ticker
 * @param ticker - Asset ticker in EODHD format (e.g., "AAPL.US", "BN.PA")
 * @param maturityYears - Plan maturity in years
 * @param asOfDate - The reference date for the rate lookup
 * @returns Risk-free rate info including detected currency
 */
export async function fetchRiskFreeRateForTicker(
  ticker: string,
  maturityYears: number,
  asOfDate: string,
): Promise<{
  rate: number;
  ticker: string;
  asOfDate: string;
  currency: string;
  detectedFrom: string;
} | null> {
  const detectedCurrency = detectCurrencyFromTicker(ticker);
  console.log(`[RFR] Auto-detected currency ${detectedCurrency} from ticker ${ticker}`);

  const result = await fetchRiskFreeRate(maturityYears, asOfDate, detectedCurrency);

  if (result) {
    return {
      ...result,
      detectedFrom: ticker,
    };
  }
  return null;
}

/**
 * Computes historical volatility from price data using log returns
 */
/**
 * Historical Volatility Calculation - RAW CLOSE Method
 *
 * METHODOLOGY (User Request):
 * - Uses RAW CLOSE for volatility (σ): Direct market prices without dividend/split adjustments
 * - Uses RAW CLOSE for Spot Price (S0): The observable market price for fair value measurement.
 *
 * NOTE: This differs from the standard IFRS 2 practice of using adjusted prices.
 * The adjusted volatility is still computed and stored in diagnostics for comparison.
 *
 * OUTLIER FILTERING:
 * - Excludes log-returns with |r| > 40% (0.4) as these typically indicate:
 *   - Spin-offs or major corporate restructuring
 *   - Data errors
 *   - Stock splits not properly adjusted
 *
 * @param priceType - 'close' (default) or 'open' for which price to use
 */
export function computeHistoricalVolatility(
  prices: HistoricalPricePoint[],
  tradingDaysPerYear = 252,
  winsorizingPct = 0, // Winsorization: 0-20%, caps extreme returns
  priceType: 'close' | 'open' = 'close',
): {
  result: VolatilityResult;
  diagnostics: VolatilityDiagnostics;
  winsorization?: { applied: boolean; pct: number; original_volatility: number };
} {
  const OUTLIER_THRESHOLD = 0.4; // 40% daily return = outlier
  const EX_DIV_THRESHOLD = 0.02; // 2% drop threshold for ex-dividend detection

  if (prices.length < 10) {
    throw new Error(
      `Insufficient data points: ${prices.length}. Need at least 10 for volatility calculation.`,
    );
  }

  // Sort by date ascending
  const sortedPrices = [...prices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const priceLabel = priceType === 'open' ? 'OPEN' : 'RAW CLOSE';
  console.log(`[VOL_AUDIT] ═══════════════════════════════════════════════════════`);
  console.log(`[VOL_AUDIT] Volatility Calculation - ${priceLabel} Method`);
  console.log(
    `[VOL_AUDIT] Sample: ${sortedPrices.length} price points | ${sortedPrices[0]?.date} to ${sortedPrices[sortedPrices.length - 1]?.date}`,
  );
  console.log(`[VOL_AUDIT] Data Source: EODHD (${priceType} prices)`);
  console.log(
    `[VOL_AUDIT] Outlier Threshold: |log_return| > ${(OUTLIER_THRESHOLD * 100).toFixed(0)}%`,
  );
  console.log(
    `[VOL_AUDIT] Winsorization: ${winsorizingPct > 0 ? `${winsorizingPct}% (${(winsorizingPct / 2).toFixed(1)}% each tail)` : 'Disabled'}`,
  );

  // Arrays for both series
  const logReturnsAdj: number[] = [];
  const logReturnsRaw: number[] = [];
  const logReturnsRawFiltered: number[] = []; // After outlier removal - NOW USING RAW

  // Diagnostic counters
  let daysWithDiff = 0;
  let maxDiffLogReturn = 0;
  let outliersExcluded = 0;
  let exDivLikely = false;

  for (let i = 1; i < sortedPrices.length; i++) {
    // Get prices based on selected price type
    const prevPrice =
      priceType === 'open'
        ? (sortedPrices[i - 1].open ?? sortedPrices[i - 1].close)
        : sortedPrices[i - 1].close;
    const currPrice =
      priceType === 'open'
        ? (sortedPrices[i].open ?? sortedPrices[i].close)
        : sortedPrices[i].close;

    // Keep close prices for comparison/diagnostics
    const prevRaw = sortedPrices[i - 1].close;
    const currRaw = sortedPrices[i].close;
    const prevAdj = sortedPrices[i - 1].adjustedClose ?? sortedPrices[i - 1].close;
    const currAdj = sortedPrices[i].adjustedClose ?? sortedPrices[i].close;

    if (prevPrice > 0 && currPrice > 0 && prevAdj > 0 && currAdj > 0) {
      // Main log return using selected price type
      const logReturnMain = Math.log(currPrice / prevPrice);
      const logReturnRaw = Math.log(currRaw / prevRaw);
      const logReturnAdj = Math.log(currAdj / prevAdj);

      logReturnsRaw.push(logReturnRaw);
      logReturnsAdj.push(logReturnAdj);

      // Track differences between raw and adjusted
      if (Math.abs(currRaw - currAdj) > 0.001 || Math.abs(prevRaw - prevAdj) > 0.001) {
        daysWithDiff++;
      }

      // Track max difference in log-returns
      const diffLogReturn = Math.abs(logReturnRaw - logReturnAdj);
      if (diffLogReturn > maxDiffLogReturn) {
        maxDiffLogReturn = diffLogReturn;
      }

      // Detect ex-dividend pattern: raw drops significantly while adjusted stable
      if (logReturnRaw < -EX_DIV_THRESHOLD && Math.abs(logReturnAdj) < 0.01) {
        exDivLikely = true;
        console.log(
          `[VOL_AUDIT] Ex-div detected on ${sortedPrices[i].date}: raw=${(logReturnRaw * 100).toFixed(2)}%, adj=${(logReturnAdj * 100).toFixed(2)}%`,
        );
      }

      // OUTLIER FILTERING using the selected price type's returns
      if (Math.abs(logReturnMain) > OUTLIER_THRESHOLD) {
        outliersExcluded++;
        console.log(
          `[VOL_AUDIT] OUTLIER EXCLUDED: ${sortedPrices[i].date} | return=${(logReturnMain * 100).toFixed(2)}% | Likely corporate action`,
        );
      } else {
        logReturnsRawFiltered.push(logReturnMain);
      }
    }
  }

  console.log(
    `[VOL_AUDIT] Log-returns computed: ${logReturnsRaw.length} total, ${logReturnsRawFiltered.length} after filtering`,
  );
  console.log(
    `[VOL_AUDIT] Outliers excluded: ${outliersExcluded} | Days with price diff: ${daysWithDiff}`,
  );
  console.log(
    `[VOL_AUDIT] Max |r_raw - r_adj|: ${(maxDiffLogReturn * 100).toFixed(4)}% | Ex-div detected: ${exDivLikely}`,
  );

  if (logReturnsRawFiltered.length < 5) {
    throw new Error(
      `Insufficient valid log returns after filtering: ${logReturnsRawFiltered.length}`,
    );
  }

  // === WINSORIZATION: Cap extreme returns if enabled ===
  let logReturnsForCalc = [...logReturnsRawFiltered];
  let winsorizationInfo: { applied: boolean; pct: number; original_volatility: number } | undefined;

  if (winsorizingPct > 0 && winsorizingPct <= 20) {
    const N = logReturnsRawFiltered.length;
    const sortedReturns = [...logReturnsRawFiltered].sort((a, b) => a - b);

    // Calculate boundary indices: winsorize pct/2 from each tail
    const lowerIndex = Math.floor(N * (winsorizingPct / 2 / 100));
    const upperIndex = Math.floor(N * (1 - winsorizingPct / 2 / 100));

    // Safety checks
    const safeLowerIndex = Math.max(0, Math.min(lowerIndex, N - 1));
    const safeUpperIndex = Math.max(0, Math.min(upperIndex, N - 1));

    const lowerVal = sortedReturns[safeLowerIndex];
    const upperVal = sortedReturns[safeUpperIndex];

    console.log(`[VOL_AUDIT] Winsorization: N=${N}, pct=${winsorizingPct}%`);
    console.log(
      `[VOL_AUDIT]   Lower boundary: index ${safeLowerIndex}, value ${(lowerVal * 100).toFixed(4)}%`,
    );
    console.log(
      `[VOL_AUDIT]   Upper boundary: index ${safeUpperIndex}, value ${(upperVal * 100).toFixed(4)}%`,
    );

    let cappedLower = 0;
    let cappedUpper = 0;

    logReturnsForCalc = logReturnsRawFiltered.map((r: number) => {
      if (r < lowerVal) {
        cappedLower++;
        return lowerVal;
      }
      if (r > upperVal) {
        cappedUpper++;
        return upperVal;
      }
      return r;
    });

    console.log(
      `[VOL_AUDIT]   Returns capped: ${cappedLower} lower, ${cappedUpper} upper (${cappedLower + cappedUpper} total)`,
    );

    // Calculate original volatility (before winsorization) for audit
    const meanOriginal =
      logReturnsRawFiltered.reduce((sum: number, r: number) => sum + r, 0) /
      logReturnsRawFiltered.length;
    const varianceOriginal =
      logReturnsRawFiltered
        .map((r: number) => Math.pow(r - meanOriginal, 2))
        .reduce((sum: number, d: number) => sum + d, 0) /
      (logReturnsRawFiltered.length - 1);
    const sigmaOriginal = Math.sqrt(varianceOriginal) * Math.sqrt(tradingDaysPerYear);

    winsorizationInfo = {
      applied: true,
      pct: winsorizingPct,
      original_volatility: sigmaOriginal,
    };

    console.log(
      `[VOL_AUDIT]   Original σ (pre-winsorization): ${(sigmaOriginal * 100).toFixed(4)}%`,
    );
  }

  // === CALCULATE RAW VOLATILITY (Official - now using RAW prices) ===
  const meanRawCalc = logReturnsForCalc.reduce((sum, r) => sum + r, 0) / logReturnsForCalc.length;
  const varianceRawCalc =
    logReturnsForCalc.map((r) => Math.pow(r - meanRawCalc, 2)).reduce((sum, d) => sum + d, 0) /
    (logReturnsForCalc.length - 1);
  const sigmaRawCalc = Math.sqrt(varianceRawCalc) * Math.sqrt(tradingDaysPerYear);

  // === CALCULATE ADJUSTED VOLATILITY (For comparison only) ===
  const meanAdj = logReturnsAdj.reduce((sum, r) => sum + r, 0) / logReturnsAdj.length;
  const varianceAdj =
    logReturnsAdj.map((r) => Math.pow(r - meanAdj, 2)).reduce((sum, d) => sum + d, 0) /
    (logReturnsAdj.length - 1);
  const sigmaAdj = Math.sqrt(varianceAdj) * Math.sqrt(tradingDaysPerYear);

  console.log(`[VOL_AUDIT] ───────────────────────────────────────────────────────`);
  console.log(
    `[VOL_AUDIT] σ_raw (OFFICIAL):       ${(sigmaRawCalc * 100).toFixed(4)}%${winsorizingPct > 0 ? ' (winsorized)' : ''} | Formula: σ = √(Var(r_raw)) × √252`,
  );
  console.log(`[VOL_AUDIT] σ_adjusted (comparison): ${(sigmaAdj * 100).toFixed(4)}%`);
  console.log(
    `[VOL_AUDIT] Δσ (raw - adj):          ${((sigmaRawCalc - sigmaAdj) * 100).toFixed(4)}%`,
  );
  if (winsorizationInfo) {
    console.log(
      `[VOL_AUDIT] Δσ (orig - winsor):      ${((winsorizationInfo.original_volatility - sigmaRawCalc) * 100).toFixed(4)}% (reduction from winsorization)`,
    );
  }
  console.log(`[VOL_AUDIT] ═══════════════════════════════════════════════════════`);

  const diagnostics: VolatilityDiagnostics = {
    volatility_adjusted: sigmaAdj, // Keep for comparison
    volatility_raw: sigmaRawCalc, // This is now the official value
    days_with_diff: daysWithDiff,
    max_diff_log_return: maxDiffLogReturn,
    outliers_excluded: outliersExcluded,
    ex_div_likely: exDivLikely,
    sample_size_filtered: logReturnsRawFiltered.length,
    sample_size_raw: logReturnsRaw.length,
  };

  return {
    result: {
      sigma: sigmaRawCalc, // Official value: RAW volatility (possibly winsorized)
      meanDailyReturn: meanRawCalc,
      sampleSize: logReturnsForCalc.length,
      startDate: sortedPrices[0].date,
      endDate: sortedPrices[sortedPrices.length - 1].date,
    },
    diagnostics,
    winsorization: winsorizationInfo,
  };
}

/**
 * Gets the spot price (S0) as of a specific date
 * IMPORTANT: Uses the selected price type (close or open) for consistency with volatility calculation.
 * When priceType is 'close': uses RAW close price (standard IFRS 2)
 * When priceType is 'open': uses open price
 *
 * Note: Adjusted prices are NEVER used for S0 because:
 * 1. S0 must reflect the actual market price for IFRS 2 fair value measurement
 * 2. Dividend adjustments are handled separately in the valuation model (q parameter)
 * 3. Using adjusted_close would double-count dividend effects
 *
 * @param priceType - 'close' (default) or 'open' - must match the volatility calculation
 */
export function getSpotPrice(
  prices: HistoricalPricePoint[],
  asOfDate: string,
  priceType: 'close' | 'open' = 'close',
): number {
  const targetDate = new Date(asOfDate);

  // Sort by date descending to find the most recent price on or before asOfDate
  const sortedPrices = [...prices].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  for (const price of sortedPrices) {
    if (new Date(price.date) <= targetDate) {
      // Use the selected price type for S0
      const spotValue =
        priceType === 'open'
          ? (price.open ?? price.close) // Fallback to close if open not available
          : price.close;

      const priceLabel = priceType === 'open' ? 'OPEN' : 'CLOSE';
      console.log(
        `[S0_AUDIT] Date: ${price.date}, Close: ${price.close}, Open: ${price.open ?? 'N/A'}, Using: ${spotValue} (${priceLabel})`,
      );
      return spotValue;
    }
  }

  // If no price before asOfDate, return the earliest available
  if (sortedPrices.length > 0) {
    const earliest = sortedPrices[sortedPrices.length - 1];
    const spotValue = priceType === 'open' ? (earliest.open ?? earliest.close) : earliest.close;

    const priceLabel = priceType === 'open' ? 'OPEN' : 'CLOSE';
    console.log(
      `[S0_AUDIT] Using earliest - Date: ${earliest.date}, Close: ${earliest.close}, Open: ${earliest.open ?? 'N/A'}, Using: ${spotValue} (${priceLabel})`,
    );
    return spotValue;
  }

  throw new Error(`No price data available for date ${asOfDate}`);
}

/**
 * Estimates dividend yield from historical prices if not available from quote
 */
export function estimateDividendYield(
  prices: HistoricalPricePoint[],
  currentPrice: number,
): number {
  return 0;
}

// ============================================================================
// VOLATILITY OPTIONS INTERFACE
// ============================================================================

export interface VolatilityOptions {
  /** Price type for log-returns: 'close' (default, standard IFRS 2) or 'open' */
  priceType: 'close' | 'open';
  /** Winsorization percentage: 0 (disabled) to 0.20 (20%). E.g., 0.05 = caps 2.5% highest and 2.5% lowest returns */
  winsorizationPercent: number;
}

export interface VolatilityFetchResult {
  value: number | null;
  source: string;
  status: 'OK' | 'MISSING' | 'ERROR';
  error?: string;
  log?: string;
  /** Additional audit details */
  diagnostics?: {
    sample_size: number;
    daily_std: number;
    annualized_volatility: number;
    winsorization_applied: boolean;
    price_type_used: 'close' | 'open';
    lookback_days: number;
  };
}

/**
 * Fetches and calculates historical volatility for a given ticker.
 *
 * Supports:
 * - Price type selection (OPEN vs CLOSE) for log-return calculation
 * - Winsorization to cap extreme returns (neutralize outliers)
 * - 40% daily return outlier filtering (corporate actions, data errors)
 *
 * @param ticker - The stock ticker (e.g., AC.PA, AAPL)
 * @param asOfDate - Reference date (YYYY-MM-DD) for the volatility calculation
 * @param lookbackDays - Number of historical trading days to use
 * @param apiToken - EODHD API token
 * @param options - Volatility calculation options (priceType, winsorizationPercent)
 */
export async function fetchVolatility(
  ticker: string,
  asOfDate: string,
  lookbackDays: number,
  apiToken: string,
  options: VolatilityOptions = { priceType: 'close', winsorizationPercent: 0 },
): Promise<VolatilityFetchResult> {
  const { priceType, winsorizationPercent } = options;
  const OUTLIER_THRESHOLD = 0.4; // 40% daily return = outlier
  const TRADING_DAYS_PER_YEAR = 252;

  try {
    // Calculate date range
    const endDate = asOfDate;
    const startDate = new Date(
      new Date(asOfDate).getTime() - (lookbackDays + 30) * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split('T')[0];

    const url = `https://eodhd.com/api/eod/${ticker}?from=${startDate}&to=${endDate}&api_token=${apiToken}&fmt=json`;
    console.log(
      `[FETCH_VOLATILITY] Ticker: ${ticker} | Date: ${asOfDate} | Lookback: ${lookbackDays}d | PriceType: ${priceType.toUpperCase()} | Winsorization: ${(winsorizationPercent * 100).toFixed(1)}%`,
    );

    const response = await fetch(url);
    if (!response.ok) {
      return {
        value: null,
        source: 'EODHD_COMPUTED',
        status: 'ERROR',
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length < 30) {
      return {
        value: null,
        source: 'EODHD_COMPUTED',
        status: 'MISSING',
        error: `Insufficient data: ${Array.isArray(data) ? data.length : 0} points (need 30+)`,
      };
    }

    // Sort data by date ascending
    const sortedData = [...data].sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Step 1: Extract prices based on selected price type
    const prices: number[] = sortedData
      .map((d: any) => {
        const selectedPrice = priceType === 'open' ? (d.open ?? d.close) : d.close;
        return selectedPrice;
      })
      .filter((p: number) => p > 0);

    if (prices.length < 30) {
      return {
        value: null,
        source: 'EODHD_COMPUTED',
        status: 'MISSING',
        error: `Insufficient valid ${priceType} prices: ${prices.length}`,
      };
    }

    // Step 2: Calculate log-returns
    const logReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }

    // Step 3: Filter outliers (|return| > 40%)
    const filteredReturns = logReturns.filter((r) => Math.abs(r) <= OUTLIER_THRESHOLD);
    const outliersRemoved = logReturns.length - filteredReturns.length;

    if (filteredReturns.length < 10) {
      return {
        value: null,
        source: 'EODHD_COMPUTED',
        status: 'ERROR',
        error: `Too few returns after outlier filtering: ${filteredReturns.length}`,
      };
    }

    // Step 4: Apply winsorization if enabled
    let returnsForCalc = [...filteredReturns];
    let winsorizationApplied = false;

    if (winsorizationPercent > 0 && winsorizationPercent <= 0.2) {
      const N = filteredReturns.length;
      const sortedReturns = [...filteredReturns].sort((a, b) => a - b);

      // Cut Math.floor(N * (percent / 2)) elements from each tail
      const cutCount = Math.floor(N * (winsorizationPercent / 2));

      if (cutCount > 0 && cutCount * 2 < N) {
        const lowerBound = sortedReturns[cutCount];
        const upperBound = sortedReturns[N - 1 - cutCount];

        // Cap values at boundaries instead of removing
        returnsForCalc = filteredReturns.map((r) => {
          if (r < lowerBound) return lowerBound;
          if (r > upperBound) return upperBound;
          return r;
        });

        winsorizationApplied = true;
        console.log(
          `[FETCH_VOLATILITY] Winsorization: Capped ${cutCount} returns on each tail | Bounds: [${(lowerBound * 100).toFixed(2)}%, ${(upperBound * 100).toFixed(2)}%]`,
        );
      }
    }

    // Step 5: Calculate standard deviation and annualized volatility
    const mean = returnsForCalc.reduce((a, b) => a + b, 0) / returnsForCalc.length;
    const variance =
      returnsForCalc.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returnsForCalc.length - 1);
    const dailyStd = Math.sqrt(variance);
    const annualizedVol = dailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR);

    const logMessage = `Volatility: ${(annualizedVol * 100).toFixed(2)}% | Price: ${priceType.toUpperCase()} | Winsorization: ${winsorizationApplied ? `${(winsorizationPercent * 100).toFixed(0)}%` : 'OFF'} | Sample: ${returnsForCalc.length} | Outliers removed: ${outliersRemoved}`;
    console.log(`[FETCH_VOLATILITY] ✓ ${logMessage}`);

    return {
      value: Math.round(annualizedVol * 10000) / 10000,
      source: 'EODHD_COMPUTED',
      status: 'OK',
      log: logMessage,
      diagnostics: {
        sample_size: returnsForCalc.length,
        daily_std: dailyStd,
        annualized_volatility: annualizedVol,
        winsorization_applied: winsorizationApplied,
        price_type_used: priceType,
        lookback_days: lookbackDays,
      },
    };
  } catch (error) {
    console.error(`[FETCH_VOLATILITY] Error:`, error);
    return {
      value: null,
      source: 'EODHD_COMPUTED',
      status: 'ERROR',
      error: String(error),
    };
  }
}

/**
 * Main function to fetch all market data for a ticker
 * @param ticker - The ticker symbol (e.g., BN.PA, AAPL)
 * @param lookbackDays - Number of historical days to fetch
 * @param asOfDate - Reference date for the data
 * @param winsorizingPct - Winsorization percentage (0-20%, default 0 = disabled)
 * @param priceType - Price type for volatility calculation: 'close' (default, IFRS 2) or 'open'
 */
export async function fetchMarketData(
  ticker: string,
  lookbackDays: number,
  asOfDate: string,
  winsorizingPct = 0,
  priceType: 'close' | 'open' = 'close',
): Promise<MarketDataResult> {
  const hasEODHD = !!Deno.env.get('EODHD_API_KEY');

  // Fetch historical prices
  const { prices, meta } = await fetchHistoricalPrices(ticker, lookbackDays, asOfDate);

  if (prices.length === 0) {
    throw new Error(`No historical data available for ${ticker}`);
  }

  // Get spot price as of the date using the same price type as volatility
  // CRITICAL: S0 and volatility must use the same price series for consistency
  const s0 = getSpotPrice(prices, asOfDate, priceType);

  // Compute volatility with IFRS 2 methodology (uses selected price type + outlier filtering + optional winsorization)
  const {
    result: volatility,
    diagnostics: volatilityDiagnostics,
    winsorization,
  } = computeHistoricalVolatility(prices, 252, winsorizingPct, priceType);

  console.log(`[MarketData] Volatility calculated using ${priceType.toUpperCase()} prices`);

  // Use currency from metadata
  let currency = meta.currency ?? 'USD';
  let dividendYield = 0;

  // Try to get dividend yield
  if (hasEODHD) {
    try {
      dividendYield = await fetchDividendYield(ticker);
    } catch (error) {
      console.warn(`[EODHD] Could not fetch dividend yield:`, error);
    }
  }

  // Build raw time series for transparency/audit (using adjusted prices)
  const sortedPrices = [...prices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const rawDates: string[] = [];
  const rawPrices: number[] = [];
  const rawReturns: number[] = [];

  for (let i = 0; i < sortedPrices.length; i++) {
    const price = sortedPrices[i].adjustedClose ?? sortedPrices[i].close;
    rawDates.push(sortedPrices[i].date);
    rawPrices.push(price);

    if (i > 0) {
      const prevPrice = sortedPrices[i - 1].adjustedClose ?? sortedPrices[i - 1].close;
      if (prevPrice > 0) {
        rawReturns.push(price / prevPrice - 1);
      } else {
        rawReturns.push(0);
      }
    }
  }

  console.log(`[MarketData] Final data for ${ticker}:`, {
    source: hasEODHD ? 'EODHD' : 'YAHOO',
    s0,
    currency,
    dividendYield: (dividendYield * 100).toFixed(2) + '%',
    volatility_adj: (volatility.sigma * 100).toFixed(2) + '%',
    volatility_raw: (volatilityDiagnostics.volatility_raw * 100).toFixed(2) + '%',
    outliers_excluded: volatilityDiagnostics.outliers_excluded,
    ex_div_likely: volatilityDiagnostics.ex_div_likely,
    dataPoints: prices.length,
    dateRange: `${volatility.startDate} to ${volatility.endDate}`,
  });

  return {
    ticker,
    s0,
    dividendYield,
    volatility,
    currency,
    asOfDate,
    dataPoints: prices.length,
    rawTimeSeries: {
      dates: rawDates,
      prices: rawPrices,
      returns: rawReturns,
    },
    dataSource: hasEODHD ? 'EODHD' : 'YAHOO',
    volatilityDiagnostics,
    winsorization,
  };
}

/**
 * Computes correlation matrix for multiple assets
 */
export function computeCorrelationMatrix(assetReturns: Record<string, number[]>): number[][] {
  const tickers = Object.keys(assetReturns);
  const n = tickers.length;

  if (n === 0) {
    return [];
  }

  // Initialize correlation matrix
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  // Compute pairwise correlations
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0;
      } else if (j > i) {
        const correlation = computePairwiseCorrelation(
          assetReturns[tickers[i]],
          assetReturns[tickers[j]],
        );
        matrix[i][j] = correlation;
        matrix[j][i] = correlation;
      }
    }
  }

  return matrix;
}

/**
 * Computes Pearson correlation between two return series
 */
export function computePairwiseCorrelation(returns1: number[], returns2: number[]): number {
  const n = Math.min(returns1.length, returns2.length);
  if (n < 10) {
    console.warn(`Insufficient data for correlation: ${n} points`);
    return 0;
  }

  // Use the aligned data
  const r1 = returns1.slice(0, n);
  const r2 = returns2.slice(0, n);

  // Calculate means
  const mean1 = r1.reduce((sum, v) => sum + v, 0) / n;
  const mean2 = r2.reduce((sum, v) => sum + v, 0) / n;

  // Calculate covariance and standard deviations
  let covariance = 0;
  let var1 = 0;
  let var2 = 0;

  for (let i = 0; i < n; i++) {
    const d1 = r1[i] - mean1;
    const d2 = r2[i] - mean2;
    covariance += d1 * d2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }

  covariance /= n - 1;
  const std1 = Math.sqrt(var1 / (n - 1));
  const std2 = Math.sqrt(var2 / (n - 1));

  if (std1 === 0 || std2 === 0) {
    return 0;
  }

  const correlation = covariance / (std1 * std2);

  // Clamp to [-1, 1] to handle floating point errors
  return Math.max(-1, Math.min(1, correlation));
}
