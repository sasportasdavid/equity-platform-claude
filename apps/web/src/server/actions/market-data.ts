'use server';

/**
 * Module 3a payload V2 — Server Actions market-data.
 *
 * 3 actions exposées au wizard plan (Step 4 — branches TSR_REL_INDEX
 * et TSR_REL_PEERS) qui proxient les Edge Functions `yahoo-search`,
 * `market-data-fetch`, et `market-data-peer-group`.
 *
 * Pourquoi un proxy plutôt qu'un appel `supabase.functions.invoke`
 * direct depuis le client : les EFs lisent `EODHD_API_KEY` côté Deno
 * (pas exposé navigateur), retournent des payloads parfois lourds
 * (correlation matrices, time-series), et certaines branches préviewent
 * sans persister (`preview_only=true`). On centralise le contrôle
 * d'accès (`requirePermission('plans.create')`) et le wrapping Result
 * pattern ici.
 *
 * Mode IFRS 2 (SNAPSHOT_AT_GRANT, default) : preview → l'utilisateur
 * confirme → on copie les valeurs dans `performance_conditions` côté
 * RPC `create_plan_full` (Module 3a B2). Live au moment du run de
 * valuation = mode LIVE_AT_VALUATION (geré côté EF compute-valuation
 * V2, hors scope cette Server Action).
 */

import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  fetchIndexMarketDataInputSchema,
  fetchPeerGroupMarketDataInputSchema,
  searchIndicesInputSchema,
  type FetchIndexMarketDataInput,
  type FetchIndexMarketDataResult,
  type FetchPeerGroupMarketDataInput,
  type FetchPeerGroupMarketDataResult,
  type SearchIndexResult,
  type SearchIndicesInput,
} from '@equity/shared';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// 1. searchIndices — proxy yahoo-search EF
// ---------------------------------------------------------------------------

/**
 * Recherche d'indices Yahoo (autocomplete pour TSR_REL_INDEX).
 *
 * Proxy de l'EF `yahoo-search` : retombe sur une liste curated
 * (^FCHI/^GSPC/^STOXX50E/...) si Yahoo API down. Le résultat est
 * filtré côté EF pour ne garder que `quoteType=INDEX|ETF` ou les
 * tickers `^*`.
 */
export async function searchIndices(
  input: SearchIndicesInput,
): Promise<Result<{ results: SearchIndexResult[]; total: number; fallback: boolean }>> {
  const parsed = searchIndicesInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input invalide' };
  }

  await requirePermission('plans.create');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke('yahoo-search', {
    body: {
      query: parsed.data.query,
      quotesCount: parsed.data.quotesCount ?? 15,
    },
  });

  if (error) {
    return { ok: false, error: `yahoo-search invoke échoué : ${error.message}` };
  }
  if (!data || typeof data !== 'object' || (data as { success?: boolean }).success === false) {
    const efError = (data as { error?: string } | null)?.error ?? 'yahoo-search a renvoyé un échec';
    return { ok: false, error: efError };
  }

  const payload = data as {
    success: true;
    results: SearchIndexResult[];
    total: number;
    fallback: boolean;
  };

  return {
    ok: true,
    data: {
      results: payload.results ?? [],
      total: payload.total ?? 0,
      fallback: payload.fallback ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. fetchIndexMarketData — proxy market-data-fetch EF (TSR_REL_INDEX)
// ---------------------------------------------------------------------------

/**
 * Preview EODHD/Yahoo pour 1 ticker d'indice (TSR_REL_INDEX).
 *
 * Mode `preview_only=true` côté EF : pas de persistance — l'utilisateur
 * voit S0/σ/q/r calculés, peut ajuster lookback, puis les valeurs sont
 * reprises dans le wizard form state (champs `reference_index_s0/sigma/
 * dividend_yield/...`). La copie en DB se fait au submit final via
 * RPC `create_plan_full` (B2).
 */
export async function fetchIndexMarketData(
  input: FetchIndexMarketDataInput,
): Promise<Result<FetchIndexMarketDataResult>> {
  const parsed = fetchIndexMarketDataInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input invalide' };
  }

  await requirePermission('plans.create');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke('market-data-fetch', {
    body: {
      ticker: parsed.data.ticker,
      as_of_date: parsed.data.asOfDate,
      lookback_days: parsed.data.lookbackDays ?? 1095,
      currency: parsed.data.currency,
      maturity_years: parsed.data.maturityYears,
      price_type: parsed.data.priceType ?? 'CLOSE',
      preview_only: true,
    },
  });

  if (error) {
    return { ok: false, error: `market-data-fetch invoke échoué : ${error.message}` };
  }
  if (!data || typeof data !== 'object' || (data as { success?: boolean }).success === false) {
    const efError =
      (data as { error?: string } | null)?.error ?? 'market-data-fetch a renvoyé un échec';
    return { ok: false, error: efError };
  }

  const payload = data as {
    success: true;
    market_data: FetchIndexMarketDataResult;
  };
  if (!payload.market_data) {
    return { ok: false, error: 'Réponse EF malformée : market_data absent' };
  }

  return { ok: true, data: payload.market_data };
}

// ---------------------------------------------------------------------------
// 3. fetchPeerGroupMarketData — proxy market-data-peer-group EF (TSR_REL_PEERS)
// ---------------------------------------------------------------------------

/**
 * Preview multi-peers (target + N peers) pour TSR_REL_PEERS.
 *
 * Renvoie : matrix corrélation (N+1)×(N+1), σ + S0 + dividend yield
 * par actif, sample_size commun. Convention Python engine : tickers[0]
 * = target, tickers[1..N] = peers (ordre préservé).
 *
 * Pour la preview wizard, on appelle l'EF avec un placeholder
 * `org_id`/`plan_id` (= activeOrgId du caller) — l'EF a une vérif de
 * `plan_id` mais en preview wizard on n'a pas encore de plan créé.
 * La validation business "le user appartient à l'org X" se fait via
 * `requirePermission`.
 */
export async function fetchPeerGroupMarketData(
  input: FetchPeerGroupMarketDataInput,
): Promise<Result<FetchPeerGroupMarketDataResult>> {
  const parsed = fetchPeerGroupMarketDataInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input invalide' };
  }

  const user = await requirePermission('plans.create');
  if (!user.activeOrgId) {
    return { ok: false, error: 'Organisation active manquante' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke('market-data-peer-group', {
    body: {
      org_id: user.activeOrgId,
      plan_id: parsed.data.planId ?? user.activeOrgId, // placeholder preview
      condition_id: parsed.data.conditionId,
      company_ticker: parsed.data.companyTicker,
      peers: parsed.data.peers,
      as_of_date: parsed.data.asOfDate,
      lookback_days: parsed.data.lookbackDays ?? 1095,
    },
  });

  if (error) {
    return { ok: false, error: `market-data-peer-group invoke échoué : ${error.message}` };
  }
  if (!data || typeof data !== 'object' || (data as { success?: boolean }).success === false) {
    const efError =
      (data as { error?: string } | null)?.error ?? 'market-data-peer-group a renvoyé un échec';
    return { ok: false, error: efError };
  }

  const payload = data as {
    success: true;
    data: FetchPeerGroupMarketDataResult;
  };
  if (!payload.data) {
    return { ok: false, error: 'Réponse EF malformée : data absent' };
  }

  return { ok: true, data: payload.data };
}
