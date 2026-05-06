/**
 * Sentry — config browser (Client Components, événements onClick, etc.).
 *
 * Pas de wizard interactif (incompat CI). Configuration manuelle.
 *
 * Sample rates :
 *  - prod  : tracesSampleRate 0.1, replaysSessionSampleRate 0.1, replaysOnErrorSampleRate 1.0
 *  - dev   : tracesSampleRate 1.0 (utile pour debug), replays désactivés
 *
 * `beforeSend` filtre les erreurs attendues (Next.js redirects, auth missing).
 */

import * as Sentry from '@sentry/nextjs';
import { shouldIgnoreSentryError } from '@/lib/monitoring/sentry-filters';

const isProd = process.env.NODE_ENV === 'production';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7),

    tracesSampleRate: isProd ? 0.1 : 1.0,

    replaysSessionSampleRate: isProd ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    beforeSend(event, hint) {
      if (shouldIgnoreSentryError(hint?.originalException)) {
        return null;
      }
      return event;
    },
  });
  console.log(
    '[sentry] client SDK init OK, env =',
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  );
} else if (typeof window !== 'undefined') {
  console.warn('[sentry] client SDK skipped — NEXT_PUBLIC_SENTRY_DSN not set');
}
