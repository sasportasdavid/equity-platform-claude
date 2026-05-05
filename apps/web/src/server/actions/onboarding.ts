'use server';

import { revalidatePath } from 'next/cache';
import {
  onboardingProfileSchema,
  type OnboardingProfileInput,
  type RoleTitle,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

// ===========================================================================
// updateOnboardingProfile — Module 14 §B2 wizard étape 1
// ===========================================================================
//
// Persiste prénom + nom + titre/rôle dans :
//   - user_profiles.full_name = "firstName lastName"
//   - user_profiles.preferences.role_title (JSONB merge)
//   - auth.users.user_metadata.full_name (cohérence JWT)
//
// Pas de side-effect onboarding_completed (la complétion se fait via
// `completeOnboarding` à l'étape 4 / welcome).

export type UpdateOnboardingProfileResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateOnboardingProfile(
  input: OnboardingProfileInput,
): Promise<UpdateOnboardingProfileResult> {
  const parsed = onboardingProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Veuillez corriger les erreurs ci-dessous.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { firstName, lastName, roleTitle } = parsed.data;
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  const fullName = `${firstName} ${lastName}`.trim();

  // Lecture preferences existantes pour merge non-destructif
  const { data: profile } = await admin
    .from('user_profiles')
    .select('full_name, preferences')
    .eq('id', user.id)
    .single();

  const prevPrefs = (profile?.preferences ?? {}) as Record<string, unknown>;
  const nextPrefs = { ...prevPrefs, role_title: roleTitle };

  const { error: updateError } = await admin
    .from('user_profiles')
    .update({ full_name: fullName, preferences: nextPrefs })
    .eq('id', user.id);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Mirror dans user_metadata (JWT) — utile pour l'affichage du nom dans
  // le header sans round-trip DB.
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const currentUserMeta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...currentUserMeta, full_name: fullName },
  });

  await logAuditEvent({
    eventType: 'onboarding.profile_updated',
    resourceType: 'USER',
    resourceId: user.id,
    userId: user.id,
    userEmail: user.email,
    afterState: { full_name: fullName, role_title: roleTitle },
  });

  return { ok: true };
}

// ===========================================================================
// completeOnboarding — Module 14 §B2 wizard étape 4 (welcome)
// ===========================================================================
//
// Finalise l'onboarding :
//   - SET user_profiles.onboarding_completed_at = now() (idempotent via
//     condition `IS NULL` côté UPDATE)
//   - SET app_metadata.onboarding_completed = true (effet immédiat au
//     prochain refresh JWT — utilisé par proxy.ts pour la gate)
//   - Audit `user.onboarding_completed`
//
// Pré-conditions : le user DOIT avoir une membership ACTIVE (l'étape 2
// company crée une org OU rejoint une org via invitation token). Sinon
// on rejette — la welcome step n'est jamais atteignable sans org.

export type CompleteOnboardingResult = { ok: true } | { ok: false; error: string };

export async function completeOnboarding(): Promise<CompleteOnboardingResult> {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  // Vérifie qu'au moins une membership ACTIVE existe pour ce user
  const { count: activeMemberships } = await admin
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');
  if ((activeMemberships ?? 0) === 0) {
    return {
      ok: false,
      error: 'Vous devez rejoindre ou créer une organisation avant de finaliser.',
    };
  }

  const nowIso = new Date().toISOString();

  // 1. user_profiles : SET onboarding_completed_at IF NULL (idempotent)
  const { error: profileError } = await admin
    .from('user_profiles')
    .update({ onboarding_completed_at: nowIso })
    .eq('id', user.id)
    .is('onboarding_completed_at', null);
  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  // 2. app_metadata.onboarding_completed = true (mirror pour proxy gate)
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const currentAppMeta = (authUser?.user?.app_metadata ?? {}) as Record<string, unknown>;
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...currentAppMeta, onboarding_completed: true },
  });

  // 3. Audit
  await logAuditEvent({
    eventType: 'user.onboarding_completed',
    resourceType: 'USER',
    resourceId: user.id,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
    metadata: { completed_at: nowIso },
  });

  revalidatePath('/');
  return { ok: true };
}

// ===========================================================================
// resolveOnboardingState — read-only helper (used by SSR routing)
// ===========================================================================
//
// Lit l'état d'onboarding du user pour décider quelle step afficher.
// Pas de side-effect, pas de redirect ici — la décision de routing
// reste côté Server Component (page.tsx).
//
//   - profile_filled : full_name non null
//   - has_org        : ≥1 membership ACTIVE
//   - completed      : onboarding_completed_at non null
//
// Le client n'utilise pas cet helper directement — c'est pour les Server
// Components qui veulent éviter de dupliquer la logique de routing.

export type OnboardingState = {
  profileFilled: boolean;
  hasOrg: boolean;
  completed: boolean;
  roleTitle: RoleTitle | null;
};

export async function resolveOnboardingState(): Promise<OnboardingState> {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  const [{ data: profile }, { count: activeMemberships }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('full_name, onboarding_completed_at, preferences')
      .eq('id', user.id)
      .single(),
    admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE'),
  ]);

  const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
  const roleTitle = (prefs.role_title as RoleTitle | undefined) ?? null;

  return {
    profileFilled: !!profile?.full_name,
    hasOrg: (activeMemberships ?? 0) > 0,
    completed: !!profile?.onboarding_completed_at,
    roleTitle,
  };
}
