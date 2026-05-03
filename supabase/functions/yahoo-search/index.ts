/**
 * Yahoo Finance Search Proxy Edge Function
 * Proxies search requests to Yahoo Finance API to avoid CORS issues
 * Includes retry logic and fallback for popular indices
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SearchRequest {
  query: string;
  quotesCount?: number;
}

// Fallback popular indices for when Yahoo API fails
// Extended list with better coverage of major indices
const POPULAR_INDICES = [
  // European indices
  {
    symbol: '^STOXX',
    shortname: 'STOXX Europe 600',
    longname: 'STOXX Europe 600 Index',
    quoteType: 'INDEX',
    exchange: 'STOXX',
    exchDisp: 'STOXX',
  },
  {
    symbol: '^SXQR',
    shortname: 'STOXX 600 Food & Bev',
    longname: 'STOXX Europe 600 Food & Beverage',
    quoteType: 'INDEX',
    exchange: 'STOXX',
    exchDisp: 'STOXX',
  },
  {
    symbol: '^SX3P',
    shortname: 'STOXX 600 Food & Bev',
    longname: 'STOXX Europe 600 Food & Beverage EUR',
    quoteType: 'INDEX',
    exchange: 'STOXX',
    exchDisp: 'STOXX',
  },
  {
    symbol: '^STOXX50E',
    shortname: 'Euro Stoxx 50',
    longname: 'EURO STOXX 50 Index',
    quoteType: 'INDEX',
    exchange: 'STOXX',
    exchDisp: 'STOXX',
  },
  {
    symbol: '^FCHI',
    shortname: 'CAC 40',
    longname: 'CAC 40 Index',
    quoteType: 'INDEX',
    exchange: 'PAR',
    exchDisp: 'Paris',
  },
  {
    symbol: '^GDAXI',
    shortname: 'DAX',
    longname: 'DAX Performance Index',
    quoteType: 'INDEX',
    exchange: 'GER',
    exchDisp: 'XETRA',
  },
  {
    symbol: '^FTSE',
    shortname: 'FTSE 100',
    longname: 'FTSE 100 Index',
    quoteType: 'INDEX',
    exchange: 'LSE',
    exchDisp: 'London',
  },
  {
    symbol: '^IBEX',
    shortname: 'IBEX 35',
    longname: 'IBEX 35 Index',
    quoteType: 'INDEX',
    exchange: 'MCE',
    exchDisp: 'Madrid',
  },
  {
    symbol: '^AEX',
    shortname: 'AEX',
    longname: 'AEX Amsterdam Index',
    quoteType: 'INDEX',
    exchange: 'AMS',
    exchDisp: 'Amsterdam',
  },
  {
    symbol: '^SSMI',
    shortname: 'SMI',
    longname: 'Swiss Market Index',
    quoteType: 'INDEX',
    exchange: 'SWX',
    exchDisp: 'Zurich',
  },
  {
    symbol: '^BFX',
    shortname: 'BEL 20',
    longname: 'BEL 20 Index',
    quoteType: 'INDEX',
    exchange: 'BRU',
    exchDisp: 'Brussels',
  },
  {
    symbol: '^FTAS',
    shortname: 'FTSE All-Share',
    longname: 'FTSE All-Share Index',
    quoteType: 'INDEX',
    exchange: 'LSE',
    exchDisp: 'London',
  },
  // US indices
  {
    symbol: '^GSPC',
    shortname: 'S&P 500',
    longname: 'S&P 500 Index',
    quoteType: 'INDEX',
    exchange: 'SNP',
    exchDisp: 'SNP',
  },
  {
    symbol: '^DJI',
    shortname: 'Dow Jones',
    longname: 'Dow Jones Industrial Average',
    quoteType: 'INDEX',
    exchange: 'DJI',
    exchDisp: 'DJI',
  },
  {
    symbol: '^IXIC',
    shortname: 'NASDAQ Composite',
    longname: 'NASDAQ Composite Index',
    quoteType: 'INDEX',
    exchange: 'NAS',
    exchDisp: 'NASDAQ',
  },
  {
    symbol: '^NDX',
    shortname: 'NASDAQ 100',
    longname: 'NASDAQ 100 Index',
    quoteType: 'INDEX',
    exchange: 'NAS',
    exchDisp: 'NASDAQ',
  },
  {
    symbol: '^RUT',
    shortname: 'Russell 2000',
    longname: 'Russell 2000 Index',
    quoteType: 'INDEX',
    exchange: 'RUS',
    exchDisp: 'Russell',
  },
  // Asian indices
  {
    symbol: '^N225',
    shortname: 'Nikkei 225',
    longname: 'Nikkei 225 Index',
    quoteType: 'INDEX',
    exchange: 'OSA',
    exchDisp: 'Osaka',
  },
  {
    symbol: '^HSI',
    shortname: 'Hang Seng',
    longname: 'Hang Seng Index',
    quoteType: 'INDEX',
    exchange: 'HKG',
    exchDisp: 'Hong Kong',
  },
  {
    symbol: '000001.SS',
    shortname: 'Shanghai Composite',
    longname: 'Shanghai Stock Exchange Composite',
    quoteType: 'INDEX',
    exchange: 'SHG',
    exchDisp: 'Shanghai',
  },
];

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      // If Yahoo returns 5xx, retry
      if (response.status >= 500 && attempt < maxRetries) {
        console.log(`[yahoo-search] Retry ${attempt}/${maxRetries} after ${response.status}`);
        await new Promise((r) => setTimeout(r, 500 * attempt)); // Exponential backoff
        continue;
      }
      return response; // Return non-5xx errors as-is
    } catch (error) {
      lastError = error as Error;
      console.log(`[yahoo-search] Network error on attempt ${attempt}: ${lastError.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

function filterFallbackIndices(query: string): typeof POPULAR_INDICES {
  const lowerQuery = query.toLowerCase();
  return POPULAR_INDICES.filter(
    (idx) =>
      idx.symbol.toLowerCase().includes(lowerQuery) ||
      idx.shortname.toLowerCase().includes(lowerQuery) ||
      idx.longname.toLowerCase().includes(lowerQuery),
  );
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, quotesCount = 15 }: SearchRequest = await req.json();

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query must be at least 2 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[yahoo-search] Searching for: ${query}`);

    // Call Yahoo Finance search API with retry
    const yahooUrl = new URL('https://query1.finance.yahoo.com/v1/finance/search');
    yahooUrl.searchParams.set('q', query);
    yahooUrl.searchParams.set('quotesCount', quotesCount.toString());
    yahooUrl.searchParams.set('newsCount', '0');
    yahooUrl.searchParams.set('enableFuzzyQuery', 'true');
    yahooUrl.searchParams.set('quotesQueryId', 'tss_match_phrase_query');

    let results: unknown[] = [];
    let usedFallback = false;

    // Always start with matching fallback indices (high-quality curated list)
    const fallbackMatches = filterFallbackIndices(query);

    try {
      const response = await fetchWithRetry(yahooUrl.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        console.warn(`[yahoo-search] Yahoo API error: ${response.status}, using fallback`);
        results = fallbackMatches;
        usedFallback = true;
      } else {
        const data = await response.json();
        const quotes = data.quotes || [];

        // Filter for indices and ETFs only
        const yahooResults = quotes
          .filter(
            (q: { quoteType?: string; symbol?: string }) =>
              q.quoteType === 'INDEX' ||
              q.quoteType === 'ETF' ||
              (q.symbol && q.symbol.startsWith('^')),
          )
          .map((q: any) => ({
            ...q,
            // Ensure exchDisp is set for better display
            exchDisp: q.exchDisp || q.exchange,
          }));

        // Merge: fallback matches first (curated), then Yahoo results (deduplicated)
        const seenSymbols = new Set<string>();
        results = [];

        // Add fallback matches first (these are high-quality curated indices)
        for (const idx of fallbackMatches) {
          if (!seenSymbols.has(idx.symbol)) {
            seenSymbols.add(idx.symbol);
            results.push(idx);
          }
        }

        // Add Yahoo results that aren't duplicates
        for (const r of yahooResults) {
          if (!seenSymbols.has(r.symbol)) {
            seenSymbols.add(r.symbol);
            results.push(r);
          }
        }

        // Sort: prioritize real indices (^symbol) and quoteType=INDEX
        results.sort((a: any, b: any) => {
          const aIsRealIndex = a.quoteType === 'INDEX' && a.symbol?.startsWith('^');
          const bIsRealIndex = b.quoteType === 'INDEX' && b.symbol?.startsWith('^');
          if (aIsRealIndex && !bIsRealIndex) return -1;
          if (!aIsRealIndex && bIsRealIndex) return 1;

          const aIsIndex = a.quoteType === 'INDEX';
          const bIsIndex = b.quoteType === 'INDEX';
          if (aIsIndex && !bIsIndex) return -1;
          if (!aIsIndex && bIsIndex) return 1;

          return (b.score || 0) - (a.score || 0);
        });

        results = results.slice(0, 15);

        if (results.length === 0) {
          usedFallback = true;
        }
      }
    } catch (error) {
      console.warn(`[yahoo-search] Error fetching from Yahoo, using fallback:`, error);
      results = filterFallbackIndices(query);
      usedFallback = true;
    }

    console.log(
      `[yahoo-search] Found ${results.length} results for "${query}"${usedFallback ? ' (fallback)' : ''}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        results,
        total: results.length,
        fallback: usedFallback,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[yahoo-search] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
