import 'server-only';
import { headers } from 'next/headers';
import { getDefaultRateLimiter } from './memory-store';
import type { RateLimitDecision } from './types';

/**
 * Module 14 PR §B5 — Helper Server Actions pour rate-limit auth flows.
 *
 * Convention V1 (alignée brief §B5) :
 *   - signup           → 5 tentatives / 15 min / IP
 *   - magic_link       → 5 tentatives / 15 min / IP
 *   - accept_invite    → 5 tentatives / 15 min / IP
 *   - invitation_resend → 5 tentatives / 15 min / IP
 *
 * Usage :
 *   const decision = await checkRateLimitForCurrentRequest('signup');
 *   if (!decision.allowed) {
 *     return { ok: false, error: 'Trop de tentatives, réessayez dans X min' };
 *   }
 */

const DEFAULT_LIMITS = {
  signup: { limit: 5, windowMs: 15 * 60 * 1000 },
  magic_link: { limit: 5, windowMs: 15 * 60 * 1000 },
  accept_invite: { limit: 5, windowMs: 15 * 60 * 1000 },
  invitation_resend: { limit: 5, windowMs: 15 * 60 * 1000 },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

export type RateLimitCategory = keyof typeof DEFAULT_LIMITS;

/**
 * Récupère l'IP du caller depuis les headers de la request courante.
 * Best-effort : sur Vercel, `x-forwarded-for` est posé par le edge ;
 * en dev local, `x-real-ip` peut être absent — on retombe sur 'unknown'.
 *
 * Anti-spoofing (V1.5) : Vercel pose lui-même `x-forwarded-for` ; les
 * proxies front-edge le font aussi. Si l'utilisateur le forge côté
 * client, ça reste en `req.headers` mais sera supplanté par celui posé
 * par le edge — donc safe.
 */
export async function getCurrentIp(): Promise<string> {
  const hdrs = await headers();
  const fwd = hdrs.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return hdrs.get('x-real-ip') ?? 'unknown';
}

export async function checkRateLimitForCurrentRequest(
  category: RateLimitCategory,
  /** Optionnel : suffixe key pour différenciation fine (ex: email). */
  subject?: string,
): Promise<RateLimitDecision> {
  const limiter = getDefaultRateLimiter();
  const ip = await getCurrentIp();
  const key = `${category}:${ip}${subject ? `:${subject}` : ''}`;
  const { limit, windowMs } = DEFAULT_LIMITS[category];
  return limiter.check({ key, limit, windowMs });
}

/**
 * Helper user-friendly : convertit un retryAfterMs en message FR
 * "Trop de tentatives, réessayez dans X minutes".
 */
export function formatRateLimitedMessage(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60000);
  if (minutes <= 1) return 'Trop de tentatives. Réessayez dans une minute.';
  return `Trop de tentatives. Réessayez dans ${minutes} minutes.`;
}
