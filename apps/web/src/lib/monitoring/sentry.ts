import 'server-only';
import * as Sentry from '@sentry/nextjs';

/**
 * Wrappers Sentry pour Server Actions et code serveur Capiwise.
 *
 * Pourquoi : Sentry capture automatiquement les erreurs uncaught, mais on
 * veut enrichir les events avec du contexte métier (org_id, user_id,
 * server_action, route) pour pouvoir filtrer et trier en prod.
 *
 * Usage typique dans une Server Action :
 *
 *   export async function inviteBeneficiary(input: InviteInput) {
 *     return withSentryServerAction('inviteBeneficiary', async () => {
 *       // ... logique de l'action
 *     });
 *   }
 *
 * Le wrapper est noop si Sentry n'est pas init (DSN absent en local).
 */

export type SentryActionContext = {
  serverAction: string;
  orgId?: string | null;
  userId?: string | null;
  route?: string | null;
};

/**
 * Capture une erreur Sentry avec les tags Capiwise standards. À appeler
 * dans le `catch` d'une Server Action si on veut logger SANS rethrow.
 */
export function captureServerError(error: unknown, context: SentryActionContext): void {
  Sentry.withScope((scope) => {
    scope.setTag('server_action', context.serverAction);
    if (context.orgId) scope.setTag('org_id', context.orgId);
    if (context.userId) scope.setUser({ id: context.userId });
    if (context.route) scope.setTag('route', context.route);
    Sentry.captureException(error);
  });
}

/**
 * Wrap une Server Action : ajoute les tags, propage les erreurs (rethrow
 * pour préserver le pattern Result `{ ok: false, error }` côté caller).
 */
export async function withSentryServerAction<T>(
  serverAction: string,
  fn: () => Promise<T>,
  context: Omit<SentryActionContext, 'serverAction'> = {},
): Promise<T> {
  return Sentry.withScope(async (scope) => {
    scope.setTag('server_action', serverAction);
    if (context.orgId) scope.setTag('org_id', context.orgId);
    if (context.userId) scope.setUser({ id: context.userId });
    if (context.route) scope.setTag('route', context.route);

    try {
      return await fn();
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  });
}
