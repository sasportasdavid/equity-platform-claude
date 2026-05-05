import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 14 PR #43 B1 — Helper TS qui invoque la RPC
 * `public.ensure_user_profile_exists` (migration 00098).
 *
 * **Pourquoi pas un trigger DB** : sur Supabase managed PG17, le rôle
 * `postgres` (utilisé par les migrations MCP) n'est pas membre de
 * `supabase_auth_admin` (owner d'auth.users) → impossible de créer un
 * trigger AFTER INSERT ON auth.users via migration. Solution : RPC
 * SECURITY DEFINER appelée explicitement par les Server Actions qui
 * créent des `auth.users` (signup, invitation accept, admin.createUser).
 *
 * Idempotent côté DB (`ON CONFLICT (id) DO NOTHING`) — peut être appelé
 * plusieurs fois sans risque.
 *
 * @example
 * const { data: created } = await admin.auth.admin.createUser({ email });
 * await ensureUserProfileExists(created.user.id, email);
 */
export async function ensureUserProfileExists(userId: string, email: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.rpc('ensure_user_profile_exists', {
    p_user_id: userId,
    p_email: email,
  });
  if (error) {
    // Best-effort logging — le caller ne doit pas crash si la RPC fail
    // (mais c'est inhabituel : la RPC est SECURITY DEFINER + idempotent).
    console.error('[auth] ensureUserProfileExists failed', error);
    throw new Error(`ensure_user_profile_exists failed: ${error.message}`);
  }
}
