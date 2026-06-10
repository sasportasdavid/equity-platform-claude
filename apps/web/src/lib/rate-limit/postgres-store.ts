import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { RateLimitDecision, RateLimitInput, RateLimiter } from './types';

/**
 * RateLimiter backé par Postgres (table `rate_limit_counters` + RPC atomique
 * `rate_limit_hit`). Contrairement au MemoryRateLimiter (Map process-local,
 * inopérant en serverless Vercel), ce store est partagé entre toutes les
 * instances Lambda — le compteur survit aux cold starts (audit 2026-06-10 P1).
 *
 * Appelé via le client admin (service_role) : fonctionne quel que soit l'état
 * d'auth du caller (flows anon comme signup / magic-link), et la table reste
 * privée (aucun grant anon/authenticated).
 *
 * Fail-open : si la RPC échoue (DB indispo, env manquant), on AUTORISE la
 * requête plutôt que de bloquer des utilisateurs légitimes — un rate limiter
 * cassé ne doit pas devenir un déni de service. L'erreur est loggée.
 */
export class PostgresRateLimiter implements RateLimiter {
  async check({ key, limit, windowMs }: RateLimitInput): Promise<RateLimitDecision> {
    try {
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin
        .rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_ms: windowMs })
        .maybeSingle<{ allowed: boolean; remaining: number; retry_after_ms: number }>();

      if (error || !data) {
        console.warn('[rate-limit] rate_limit_hit RPC error, fail-open:', error?.message);
        return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: 0 };
      }

      return {
        allowed: data.allowed,
        remaining: data.remaining,
        retryAfterMs: Number(data.retry_after_ms) || 0,
      };
    } catch (err) {
      console.warn(
        '[rate-limit] PostgresRateLimiter exception, fail-open:',
        err instanceof Error ? err.message : String(err),
      );
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: 0 };
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await getSupabaseAdminClient().from('rate_limit_counters').delete().eq('key', key);
    } catch {
      /* best-effort */
    }
  }
}

let cached: PostgresRateLimiter | undefined;

/**
 * Factory du RateLimiter serveur (store Postgres partagé). Utilisé par
 * `checkRateLimitForCurrentRequest`. Le MemoryRateLimiter reste disponible
 * pour les tests unitaires (import direct).
 */
export function getServerRateLimiter(): RateLimiter {
  if (!cached) cached = new PostgresRateLimiter();
  return cached;
}
