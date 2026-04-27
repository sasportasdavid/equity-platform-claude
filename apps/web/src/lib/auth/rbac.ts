import 'server-only';
import { redirect } from 'next/navigation';
import type { Permission, Role } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Shape des claims custom injectés par `custom_access_token_hook` (cf. migration
 * 00012). Vit dans `user.app_metadata`, donc read-only côté client (la vraie
 * source de vérité reste la table `memberships` côté DB ; ces claims servent
 * uniquement à éviter un round-trip à chaque check d'org/role).
 */
type AppMetadata = {
  active_org_id?: string;
  org_ids?: string[];
  active_roles?: Role[];
} & Record<string, unknown>;

type UserMetadata = { full_name?: string } & Record<string, unknown>;

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  activeOrgId: string | null;
  orgIds: readonly string[];
  activeRoles: readonly Role[];
};

/**
 * Récupère l'utilisateur authentifié côté serveur.
 *
 * Lit `active_org_id`, `org_ids` et `active_roles` depuis `user.app_metadata`
 * (alimenté par le custom_access_token_hook côté DB).
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

  const appMeta = (user.app_metadata ?? {}) as AppMetadata;
  const userMeta = (user.user_metadata ?? {}) as UserMetadata;

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: userMeta.full_name ?? null,
    activeOrgId: appMeta.active_org_id ?? null,
    orgIds: appMeta.org_ids ?? [],
    activeRoles: appMeta.active_roles ?? [],
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
 * Délègue à `user_has_permission()` PostgreSQL (Module 2 §3.3, migration 00007)
 * pour garantir la cohérence stricte avec les RLS policies — toute la logique
 * de résolution rôles/grants/revokes vit en SQL.
 */
export async function requirePermission(perm: Permission): Promise<AuthUser> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('user_has_permission', { p_perm: perm });

  if (error || !data) {
    throw new Error(`Permission denied: '${perm}' is required`);
  }
  return user;
}

/**
 * Variante non-throwing : retourne true/false. Utile pour conditionner
 * l'affichage UI sans déclencher de redirect.
 */
export async function hasPermission(perm: Permission): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('user_has_permission', { p_perm: perm });
  return !error && data === true;
}

/**
 * Renvoie la liste complète des permissions effectives du user actif (rôles
 * ∪ grants \ revokes). Wrapper autour de la RPC `user_all_permissions` (Module
 * 2 §3.4, migration 00007).
 */
export async function getAllPermissions(): Promise<readonly Permission[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('user_all_permissions');
  if (error || !data) return [];
  return data as Permission[];
}
