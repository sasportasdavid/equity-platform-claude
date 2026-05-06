/**
 * Next.js 16 instrumentation hook — bootstrap Sentry selon le runtime.
 *
 * `register()` est appelée une fois au démarrage de chaque runtime
 * (Node ou Edge). On charge la config Sentry adéquate.
 *
 * `onRequestError` (Next 15+) ferme la boucle errors uncaught côté
 * Server Components / route handlers que Sentry ne capture pas via
 * son patch automatique.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
