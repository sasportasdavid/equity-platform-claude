/**
 * Filtres `beforeSend` Sentry — extraits en pur pour test.
 *
 * Liste blanche d'erreurs à NE PAS envoyer à Sentry :
 *  - `NEXT_REDIRECT` : Next.js throw cette erreur quand `redirect()` est
 *    appelé dans un Server Component. Bug-by-design, comportement attendu.
 *  - `NEXT_NOT_FOUND` : idem pour `notFound()`.
 *  - `AuthSessionMissingError` : Supabase Auth throw quand le caller n'est
 *    pas loggé. Pas une erreur applicative — la layout dashboard redirige
 *    vers /login. Sinon Sentry est noyé sous des events crawler/bot.
 *
 * Utilisé par `sentry.{client,server,edge}.config.ts`.
 */

const IGNORED_ERROR_PATTERNS = ['NEXT_REDIRECT', 'NEXT_NOT_FOUND', 'AuthSessionMissingError'];

export function shouldIgnoreSentryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return IGNORED_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}
