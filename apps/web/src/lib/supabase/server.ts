import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@equity/shared';
import { getServerEnv } from '@/lib/env';

/**
 * Supabase client pour Server Components / Server Actions / Route Handlers.
 *
 * IMPORTANT (Next 16) : `cookies()` est asynchrone. Cette factory est donc
 * `async` et doit être awaited.
 *
 * Utilise l'anon key et propage les cookies de session — soumis aux RLS du user.
 */
export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // The `setAll` method may be called from a Server Component.
            // Safe to ignore if the session is being refreshed via the proxy.
          }
        },
      },
    },
  );
}
