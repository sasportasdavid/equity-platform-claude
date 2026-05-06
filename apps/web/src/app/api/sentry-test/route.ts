import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * Endpoint test Sentry — vérifie en prod que la chaîne
 * Server Action → Sentry SDK → dashboard fonctionne.
 *
 * Usage : `curl https://www.capiwise.fr/api/_sentry-test`
 *
 * Comportement :
 *  - throw une erreur identifiée → Sentry capture + tags
 *  - retourne 500 JSON `{ ok: false, sent_to_sentry: true }`
 *
 * Pas de logique métier, pas de DB, pas de leak — juste un canary.
 *
 * Volontairement exposé en prod pour permettre la vérification
 * post-deploy depuis n'importe quel poste. Anti-abuse :
 *  - aucune ressource serveur consommée hors event Sentry
 *  - les events sont sample-rated (et Sentry rate-limit côté SaaS)
 *  - tag `sentry_canary=true` permet de filtrer/exclure dans
 *    les alertes du dashboard si nécessaire
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class SentryCanaryError extends Error {
  constructor() {
    super('Sentry canary — vérification déclenchée par /api/_sentry-test');
    this.name = 'SentryCanaryError';
  }
}

export async function GET() {
  const error = new SentryCanaryError();

  Sentry.withScope((scope) => {
    scope.setTag('sentry_canary', 'true');
    scope.setTag('server_action', '_sentry-test');
    scope.setLevel('error');
    Sentry.captureException(error);
  });

  await Sentry.flush(2000);

  return NextResponse.json(
    {
      ok: false,
      sent_to_sentry: true,
      message:
        'Canary error logged to Sentry. Check https://sentry.io/ for the SentryCanaryError event.',
    },
    { status: 500 },
  );
}
