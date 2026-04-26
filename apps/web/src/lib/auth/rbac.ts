import 'server-only';
import { redirect } from 'next/navigation';
import type { Permission } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  activeOrgId: string | null;
};

/**
 * Récupère l'utilisateur authentifié côté serveur.
 *
 * @throws redirect('/login') si pas de session
 */
export async function requireUser(): Promise<AuthUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  // active_org_id est injecté par l'Auth Hook custom_access_token_hook
  const claims = user.user_metadata as { full_name?: string } | null;
  const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
  let activeOrgId: string | null = null;
  if (accessToken) {
    try {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1] ?? '', 'base64').toString('utf8'),
      ) as {
        active_org_id?: string;
      };
      activeOrgId = payload.active_org_id ?? null;
    } catch {
      activeOrgId = null;
    }
  }

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: claims?.full_name ?? null,
    activeOrgId,
  };
}

/**
 * Récupère l'org_id actif de l'utilisateur courant.
 * À utiliser systématiquement avant toute insertion qui requiert org_id.
 */
export async function getServerOrgId(): Promise<string> {
  const user = await requireUser();
  if (!user.activeOrgId) {
    redirect('/onboarding');
  }
  return user.activeOrgId;
}

/**
 * Vérifie qu'un user a une permission donnée. Lève une erreur sinon.
 *
 * NOTE: cette fonction délègue à `has_permission()` PostgreSQL via RPC pour
 * garantir la cohérence avec les RLS policies.
 */
export async function requirePermission(perm: Permission): Promise<AuthUser> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('has_permission', { perm });

  if (error || !data) {
    throw new Error(`Permission denied: '${perm}' is required`);
  }
  return user;
}

/**
 * Variante non-throwing : retourne true/false.
 */
export async function hasPermission(perm: Permission): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('has_permission', { perm });
  return !error && data === true;
}
