'use server';

import { revalidatePath } from 'next/cache';
import {
  membershipActionSchema,
  updateMemberRolesSchema,
  type MembershipActionInput,
  type UpdateMemberRolesInput,
  type Role,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { sendEmail } from '@/lib/resend/client';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

// ===========================================================================
// Garde-fou : ne jamais retirer le dernier OWNER d'une org
// ===========================================================================
async function lastOwnerProtection(
  orgId: string,
  membershipId: string,
  willStillBeOwner: boolean,
  isStillActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (willStillBeOwner && isStillActive) return { ok: true };

  const admin = getSupabaseAdminClient();
  const { data: target } = await admin
    .from('memberships')
    .select('roles, status')
    .eq('id', membershipId)
    .single();

  const wasOwner = target?.roles?.includes('OWNER') ?? false;
  const wasActive = target?.status === 'ACTIVE';

  if (!wasOwner || !wasActive) return { ok: true };

  // Compte les autres OWNER ACTIVE
  const { count } = await admin
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'ACTIVE')
    .contains('roles', ['OWNER'])
    .neq('id', membershipId);

  if ((count ?? 0) === 0) {
    return {
      ok: false,
      error: 'Au moins un OWNER actif doit rester dans l’organisation.',
    };
  }
  return { ok: true };
}

// ===========================================================================
// updateMemberRoles
// ===========================================================================

export type UpdateMemberRolesResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateMemberRoles(
  input: UpdateMemberRolesInput,
): Promise<UpdateMemberRolesResult> {
  const parsed = updateMemberRolesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Veuillez corriger les erreurs ci-dessous.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const user = await requirePermission('org.manage_members');
  if (!user.activeOrgId) {
    return { success: false, error: 'Aucune organisation active' };
  }
  const admin = getSupabaseAdminClient();

  // Vérifie que le membership appartient à l'org active
  const { data: target } = await admin
    .from('memberships')
    .select('id, user_id, org_id, roles, status')
    .eq('id', data.membershipId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();
  if (!target) return { success: false, error: 'Membre introuvable.' };

  const willBeOwner = data.roles.includes('OWNER');
  const guard = await lastOwnerProtection(
    user.activeOrgId,
    data.membershipId,
    willBeOwner,
    target.status === 'ACTIVE',
  );
  if (!guard.ok) return { success: false, error: guard.error };

  const { error } = await admin
    .from('memberships')
    .update({ roles: data.roles })
    .eq('id', data.membershipId);
  if (error) return { success: false, error: error.message };

  // Notification email best-effort
  const { data: targetProfile } = await admin
    .from('user_profiles')
    .select('email')
    .eq('id', target.user_id)
    .single();
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', user.activeOrgId)
    .single();

  if (targetProfile?.email && org?.name) {
    await sendEmail({
      to: targetProfile.email,
      template: 'org_role_changed',
      variables: {
        orgName: org.name,
        newRoles: data.roles,
      },
      audit: {
        orgId: user.activeOrgId,
        userId: target.user_id,
        relatedEntityType: 'MEMBERSHIP',
        relatedEntityId: data.membershipId,
      },
    });
  }

  await logAuditEvent({
    eventType: 'membership.roles_updated',
    orgId: user.activeOrgId,
    userId: user.id,
    userEmail: user.email,
    resourceType: 'MEMBERSHIP',
    resourceId: data.membershipId,
    beforeState: { roles: target.roles as Role[] },
    afterState: { roles: data.roles },
  });

  revalidatePath('/dashboard/settings/members');
  return { success: true };
}

// ===========================================================================
// suspendMember / reactivateMember / removeMember
// ===========================================================================

async function changeMembershipStatus(
  input: MembershipActionInput,
  newStatus: 'ACTIVE' | 'SUSPENDED',
  eventType: 'membership.suspended' | 'membership.reactivated',
): Promise<UpdateMemberRolesResult> {
  const parsed = membershipActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'membershipId invalide' };

  const user = await requirePermission('org.manage_members');
  if (!user.activeOrgId) return { success: false, error: 'Aucune organisation active' };
  const admin = getSupabaseAdminClient();

  const { data: target } = await admin
    .from('memberships')
    .select('id, status, roles')
    .eq('id', parsed.data.membershipId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();
  if (!target) return { success: false, error: 'Membre introuvable.' };

  if (newStatus === 'SUSPENDED') {
    const guard = await lastOwnerProtection(
      user.activeOrgId,
      parsed.data.membershipId,
      true,
      false,
    );
    if (!guard.ok) return { success: false, error: guard.error };
  }

  const { error } = await admin
    .from('memberships')
    .update({ status: newStatus })
    .eq('id', parsed.data.membershipId);
  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    eventType,
    orgId: user.activeOrgId,
    userId: user.id,
    userEmail: user.email,
    resourceType: 'MEMBERSHIP',
    resourceId: parsed.data.membershipId,
    beforeState: { status: target.status },
    afterState: { status: newStatus },
  });

  revalidatePath('/dashboard/settings/members');
  return { success: true };
}

export async function suspendMember(input: MembershipActionInput) {
  return changeMembershipStatus(input, 'SUSPENDED', 'membership.suspended');
}

export async function reactivateMember(input: MembershipActionInput) {
  return changeMembershipStatus(input, 'ACTIVE', 'membership.reactivated');
}

// ===========================================================================
// removeMember — suppression DURE du membership (mais user et profile restent
// car potentiellement actifs dans d'autres orgs). On garde la trace via audit.
// ===========================================================================

export async function removeMember(input: MembershipActionInput): Promise<UpdateMemberRolesResult> {
  const parsed = membershipActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'membershipId invalide' };

  const user = await requirePermission('org.manage_members');
  if (!user.activeOrgId) return { success: false, error: 'Aucune organisation active' };
  const admin = getSupabaseAdminClient();

  const { data: target } = await admin
    .from('memberships')
    .select('id, user_id, roles, status')
    .eq('id', parsed.data.membershipId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();
  if (!target) return { success: false, error: 'Membre introuvable.' };

  const guard = await lastOwnerProtection(user.activeOrgId, parsed.data.membershipId, false, false);
  if (!guard.ok) return { success: false, error: guard.error };

  const { error } = await admin.from('memberships').delete().eq('id', parsed.data.membershipId);
  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    eventType: 'membership.removed',
    orgId: user.activeOrgId,
    userId: user.id,
    userEmail: user.email,
    resourceType: 'MEMBERSHIP',
    resourceId: parsed.data.membershipId,
    beforeState: { user_id: target.user_id, roles: target.roles, status: target.status },
  });

  revalidatePath('/dashboard/settings/members');
  return { success: true };
}
