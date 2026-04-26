import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@equity/shared';
import { getServerEnv } from '@/lib/env';

/**
 * Supabase **admin** client (service_role).
 *
 * ⚠️ CONTOURNE LES RLS. À utiliser uniquement côté serveur, pour :
 *   - les Edge Functions / webhooks (Yousign, Resend) qui n'ont pas de session user
 *   - le seeding initial d'une organisation au signup
 *   - les jobs cron (recalc vesting, expirations awards, alertes compliance)
 *   - l'écriture directe dans `audit_events` (pas de policy INSERT publique)
 *
 * NE JAMAIS importer ce module depuis un Client Component (`server-only`
 * lèvera une erreur de build). Pour les opérations user-scoped, utiliser
 * `createSupabaseServerClient()` qui respecte les RLS.
 */
let cachedAdmin: ReturnType<typeof createClient<Database>> | undefined;

export function getSupabaseAdminClient() {
  if (cachedAdmin) return cachedAdmin;
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required to use the admin client. ' +
        'Set it in apps/web/.env.local for server-side operations.',
    );
  }
  cachedAdmin = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
  return cachedAdmin;
}
