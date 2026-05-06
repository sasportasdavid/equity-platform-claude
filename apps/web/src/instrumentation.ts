/**
 * Next.js 16 instrumentation hook — bootstrap Sentry selon le runtime.
 *
 * **Doit vivre dans `src/`** — Next.js 16 avec un dossier `src/` ne
 * regarde QUE `src/instrumentation.ts`. Le fichier à la racine
 * (`apps/web/instrumentation.ts`) est silencieusement ignoré, ce qui
 * empêche `Sentry.init` de s'exécuter et rend `captureException` no-op
 * (cf incident V1.X #43, dashboard "Waiting for first error" malgré
 * `sent_to_sentry: true` côté API).
 *
 * `register()` est appelée une fois au démarrage de chaque runtime
 * (Node ou Edge). On charge la config Sentry adéquate.
 *
 * `onRequestError` (Next 15+) ferme la boucle errors uncaught côté
 * Server Components / route handlers que Sentry ne capture pas via
 * son patch automatique.
 *
 * Les fichiers `sentry.{client,server,edge}.config.ts` restent à la
 * racine (`apps/web/`) — convention Sentry, indépendante du `src/`
 * de Next.js. D'où le `../` dans les imports dynamiques.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  console.log('[sentry] register() called, NEXT_RUNTIME =', process.env.NEXT_RUNTIME);

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
