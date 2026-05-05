/**
 * Module 14 PR §B5 — Interface RateLimiter extensible.
 *
 * V1 = MemoryRateLimiter (Map JS, scope process — ok dev, suffisant prod
 * Vercel pour bloquer 95 % des bots cf. brief §"Pièges" #5).
 * V1.5 = swap vers UpstashRateLimiter ou VercelKVRateLimiter sans
 * refactor des consumers (la factory `getDefaultRateLimiter` change
 * d'implémentation, l'interface reste).
 *
 * Le `key` est arbitraire mais on suit la convention `<scope>:<ip>` ou
 * `<scope>:<email>` pour faciliter la différenciation.
 */

export type RateLimitDecision = {
  /** True si la requête peut continuer, false si rate-limited. */
  allowed: boolean;
  /** Nombre de tentatives restantes dans la fenêtre actuelle. */
  remaining: number;
  /** Millisecondes avant la prochaine fenêtre (0 si allowed). */
  retryAfterMs: number;
};

export type RateLimitInput = {
  /** Identifiant unique du scope+sujet (ex: `signup:1.2.3.4`). */
  key: string;
  /** Nombre max de hits autorisés par fenêtre. */
  limit: number;
  /** Durée de la fenêtre en ms. */
  windowMs: number;
};

export interface RateLimiter {
  /**
   * Enregistre une tentative pour `key` et renvoie la décision.
   * Atomique vis-à-vis du store sous-jacent.
   */
  check(input: RateLimitInput): Promise<RateLimitDecision>;
  /**
   * Reset le compteur pour `key` (ex: tests, debug). Optionnel.
   */
  reset?(key: string): Promise<void>;
}
