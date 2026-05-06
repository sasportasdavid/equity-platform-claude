/**
 * Sentry — config Node runtime (Server Components, Server Actions, route handlers).
 *
 * Pas de Replay côté server (browser only).
 *
 * Tags par défaut :
 *  - environment : production / preview / development
 *  - release     : 7 chars du SHA git Vercel
 *
 * Tags contextuels (org_id, user_id, route, server_action) ajoutés par les
 * call sites via Sentry.withScope() — voir lib/monitoring/sentry.ts.
 */

import * as Sentry from '@sentry/nextjs';
import { shouldIgnoreSentryError } from '@/lib/monitoring/sentry-filters';

const isProd = process.env.NODE_ENV === 'production';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),

    tracesSampleRate: isProd ? 0.1 : 1.0,

    beforeSend(event, hint) {
      if (shouldIgnoreSentryError(hint?.originalException)) {
        return null;
      }
      return event;
    },
  });
}
