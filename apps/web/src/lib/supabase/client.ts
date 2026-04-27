'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@equity/shared';
import { clientEnv } from '@/lib/env';

/**
 * Supabase client pour les Client Components (browser).
 * Utilise l'anon key, soumis aux RLS du user authentifié.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
