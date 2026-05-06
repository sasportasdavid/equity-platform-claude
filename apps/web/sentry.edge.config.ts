/**
 * Sentry — config Edge runtime (proxy.ts, route handlers `runtime: 'edge'`).
 *
 * Edge runtime ≠ Node : pas tous les SDKs Sentry compatibles. Init minimale.
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
