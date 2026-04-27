'use server';

import { revalidatePath } from 'next/cache';
import { updateProfileSchema, type UpdateProfileInput } from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type UpdateProfileResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Module 2 §6.4 — patch du profil utilisateur courant.
 * Pas de check de permission spécifique : tout user authentifié peut éditer
 * SON propre profil (la policy user_profiles_update_self filtre sur auth.uid()).
 */
export async function updateMyProfile(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Veuillez corriger les erreurs ci-dessous.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  const { data: before } = await admin
    .from('user_profiles')
    .select('full_name, phone, preferences')
    .eq('id', user.id)
    .single();

  const patch: Record<string, unknown> = {};
  if (data.fullName !== undefined) patch.full_name = data.fullName;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.preferences !== undefined) patch.preferences = data.preferences;

  const { error } = await admin
    .from('user_profiles')
    .update(patch as never)
    .eq('id', user.id);
  if (error) return { success: false, error: error.message };

  // Met aussi à jour user_metadata.full_name pour cohérence côté JWT
  if (data.fullName !== undefined) {
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    const currentUserMeta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...currentUserMeta, full_name: data.fullName },
    });
  }

  await logAuditEvent({
    eventType: 'profile.updated',
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
    resourceType: 'USER',
    resourceId: user.id,
    beforeState: before as Record<string, unknown> | null,
    afterState: patch,
  });

  revalidatePath('/dashboard/settings/profile');
  return { success: true };
}
