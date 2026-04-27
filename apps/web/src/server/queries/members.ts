import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type MemberRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  roles: string[];
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type InvitationRow = {
  id: string;
  email: string;
  roles: string[];
  invited_by_email: string | null;
  message: string | null;
  expires_at: string;
  created_at: string;
  status: string;
};

export async function listMembersForOrg(orgId: string): Promise<MemberRow[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('memberships')
    .select(
      `
      id, user_id, roles, status, invited_at, accepted_at, created_at,
      user_profiles ( email, full_name )
    `,
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const profile = row.user_profiles as { email?: string; full_name?: string | null } | null;
    return {
      id: row.id,
      user_id: row.user_id,
      email: profile?.email ?? '',
      full_name: profile?.full_name ?? null,
      roles: (row.roles ?? []) as string[],
      status: row.status,
      invited_at: row.invited_at,
      accepted_at: row.accepted_at,
      created_at: row.created_at,
    };
  });
}

export async function listPendingInvitationsForOrg(orgId: string): Promise<InvitationRow[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('invitations')
    .select(
      `
      id, email, roles, message, expires_at, created_at, status,
      invited_by
    `,
    )
    .eq('org_id', orgId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  // Récupérer les emails des inviteurs en un seul round-trip
  const inviterIds = Array.from(
    new Set(data.map((row) => row.invited_by).filter((id): id is string => Boolean(id))),
  );
  const inviterMap = new Map<string, string>();
  if (inviterIds.length > 0) {
    const { data: inviters } = await admin
      .from('user_profiles')
      .select('id, email')
      .in('id', inviterIds);
    for (const inv of inviters ?? []) {
      inviterMap.set(inv.id, inv.email);
    }
  }

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    roles: (row.roles ?? []) as string[],
    invited_by_email: row.invited_by ? (inviterMap.get(row.invited_by) ?? null) : null,
    message: row.message,
    expires_at: row.expires_at,
    created_at: row.created_at,
    status: row.status,
  }));
}
