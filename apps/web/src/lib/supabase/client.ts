'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@equity/shared';
import { clientEnv } from '@/lib/env';

/**
 * Supabase client pour les Client Components (browser).
 * Utilise l'anon key, soumis aux RLS du user authentifié.
 *
 * `flowType: 'pkce'` : force le flow PKCE pour les magic links / OAuth
 * (au lieu du legacy OTP token-in-URL). Le client génère un PKCE
 * verifier au `signInWithOtp()`, le stocke en cookie, et Supabase
 * envoie l'utilisateur vers `?code=xxx` que `/auth/callback` échange
 * via `exchangeCodeForSession`. Sans cette option, le magic link
 * revient avec `?token=xxx&type=magiclink` (legacy OTP) que la route
 * callback ne sait pas traiter par défaut → erreur `missing_code`.
 *
 * Doit rester aligné avec la config server (server.ts) et le proxy
 * (proxy.ts) — sinon le verifier ne sera pas trouvé à l'échange.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { flowType: 'pkce' },
    },
  );
}
