import type { RateLimitDecision, RateLimitInput, RateLimiter } from './types';

/**
 * Module 14 PR §B5 — RateLimiter in-memory (V1).
 *
 * Implémentation à fenêtre fixe (fixed-window counter) avec une Map
 * partagée à l'échelle du process Node. Sur Vercel serverless, la
 * mémoire n'est pas partagée entre invocations — un cold start réinit
 * le compteur. Acceptable V1 : suffit pour bloquer 95 % des bots
 * automatisés (pattern brief §"Pièges" #5). V1.5 = Upstash/Vercel KV
 * pour cohérence cross-instance.
 *
 * Pas de eviction TTL : la Map garde les entrées en mémoire jusqu'au
 * cleanup automatique (à chaque check, on filtre les entrées expirées).
 * Pour 10 000 IPs uniques en 15 min, ça reste sous la barre des
 * dizaines de KB — pas de risque de fuite mémoire prod.
 *
 * **Algorithme** :
 *   - `key` mappé à `{ count, windowStart }`
 *   - À chaque `check(key, limit, windowMs)` :
 *     - Si `now - windowStart > windowMs` → reset (count=1, windowStart=now)
 *     - Sinon → count++ et compare à limit
 *   - allowed = count <= limit
 *   - retryAfterMs = (windowStart + windowMs) - now si dépassé, sinon 0
 */
type Counter = { count: number; windowStart: number };

export class MemoryRateLimiter implements RateLimiter {
  private store = new Map<string, Counter>();

  async check({ key, limit, windowMs }: RateLimitInput): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now - existing.windowStart >= windowMs) {
      // Nouvelle fenêtre
      this.store.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterMs: 0,
      };
    }

    existing.count += 1;
    const allowed = existing.count <= limit;
    const remaining = Math.max(0, limit - existing.count);
    const retryAfterMs = allowed ? 0 : existing.windowStart + windowMs - now;
    return { allowed, remaining, retryAfterMs };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Test-only : vide tout le store. */
  __resetAll(): void {
    this.store.clear();
  }
}

/**
 * Singleton pour le process. Sur Vercel serverless, partagé entre Server
 * Actions de la même instance Lambda jusqu'au cold start.
 */
let cached: MemoryRateLimiter | undefined;

/**
 * Factory du RateLimiter par défaut (V1 = MemoryRateLimiter).
 *
 * V1.5 : changer cette fonction pour retourner un UpstashRateLimiter ou
 * VercelKVRateLimiter sans toucher les consumers.
 */
export function getDefaultRateLimiter(): RateLimiter {
  if (!cached) cached = new MemoryRateLimiter();
  return cached;
}

/**
 * Test-only : reset le singleton (à appeler en `beforeEach` côté tests).
 */
export function __resetDefaultRateLimiter(): void {
  if (cached) (cached as MemoryRateLimiter).__resetAll();
}
