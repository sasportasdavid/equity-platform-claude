'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  revokeInvitationSchema,
  type CreateInvitationInput,
  type AcceptInvitationInput,
  type RevokeInvitationInput,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { getServerEnv } from '@/lib/env';
import { checkRateLimitForCurrentRequest } from '@/lib/rate-limit/server';
import { sendEmail } from '@/lib/resend/client';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const INVITATION_TTL_DAYS = 7;
const TOKEN_BYTES = 32; // 64 hex chars

function formatDateFr(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

// ===========================================================================
// createInvitation — Module 2 §1.4 / §6.2
// ===========================================================================

export type CreateInvitationResult =
  | { success: true; invitationId: string; email: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const parsed = createInvitationSchema.safeParse(input);
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
  const env = getServerEnv();

  // 1. Reject duplicate PENDING invitation for same (org, email)
  const { data: existing } = await admin
    .from('invitations')
    .select('id')
    .eq('org_id', user.activeOrgId)
    .eq('email', data.email)
    .eq('status', 'PENDING')
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'Une invitation est déjà en cours pour cet email.' };
  }

  // 2. INSERT invitation
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { data: invite, error: insertError } = await admin
    .from('invitations')
    .insert({
      org_id: user.activeOrgId,
      email: data.email,
      roles: data.roles,
      token,
      expires_at: expiresAt.toISOString(),
      message: data.message ?? null,
      beneficiary_id: data.beneficiaryId ?? null,
      invited_by: user.id,
    })
    .select('id')
    .single();

  if (insertError || !invite) {
    return { success: false, error: insertError?.message ?? 'Création de l’invitation impossible' };
  }

  // 3. Send email via Resend (template selon flow bénéficiaire vs team)
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', user.activeOrgId)
    .single();

  const orgName = org?.name ?? 'Capiwise';
  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;
  const isBeneficiary = data.roles.includes('BENEFICIARY');

  const sendResult = isBeneficiary
    ? await sendEmail({
        to: data.email,
        template: 'beneficiary_first_invite',
        variables: {
          orgName,
          acceptUrl,
          expiresAtHuman: formatDateFr(expiresAt),
        },
        audit: {
          orgId: user.activeOrgId,
          relatedEntityType: 'INVITATION',
          relatedEntityId: invite.id,
        },
      })
    : await sendEmail({
        to: data.email,
        template: 'team_member_invite',
        variables: {
          orgName,
          inviterEmail: user.email,
          acceptUrl,
          message: data.message ?? null,
          expiresAtHuman: formatDateFr(expiresAt),
        },
        audit: {
          orgId: user.activeOrgId,
          relatedEntityType: 'INVITATION',
          relatedEntityId: invite.id,
        },
      });

  if (!sendResult.ok) {
    console.error('[invitations] sendEmail failed', sendResult.error);
    // L'invitation reste valide en DB ; le user peut être relancé via "Renvoyer".
  }

  // 4. Audit
  await logAuditEvent({
    eventType: 'invitation.created',
    orgId: user.activeOrgId,
    userId: user.id,
    userEmail: user.email,
    resourceType: 'INVITATION',
    resourceId: invite.id,
    metadata: {
      email: data.email,
      roles: data.roles,
      is_beneficiary: isBeneficiary,
      email_sent: sendResult.ok,
    },
  });

  revalidatePath('/dashboard/settings/members');
  return { success: true, invitationId: invite.id, email: data.email };
}

// ===========================================================================
// acceptInvitation — Module 2 §1.4
// ===========================================================================
//
//   1. Lookup invitation par token (status PENDING + non expirée) — race-safe
//      grâce à un UPDATE conditionnel (CAS) qui marque ACCEPTED en une seule
//      requête : si 2 requêtes arrivent en parallèle, seule la 1re « gagne ».
//   2. Crée auth.users si inexistant, user_profile, membership(s)
//   3. Lie beneficiaries.user_id si invitation pour bénéficiaire
//   4. Set active_org_id côté auth.users
//   5. Génère un magic link pour auto-login
//
// Note race-condition (Module 2 §12 « Points de vigilance ») : le UPDATE
// conditionnel sur invitations.status garantit l'atomicité — pas besoin
// de SELECT FOR UPDATE explicit.

export type AcceptInvitationResult =
  | { success: true; redirectUrl: string }
  | { success: false; error: string };

export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  // Module 14 B5 — rate limit 5/15min/IP (anti brute-force token)
  const rl = await checkRateLimitForCurrentRequest('accept_invite');
  if (!rl.allowed) {
    return { success: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' };
  }

  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Token invalide.' };
  }
  const { token } = parsed.data;
  const admin = getSupabaseAdminClient();
  const env = getServerEnv();

  // 1. CAS : marque ACCEPTED en une seule requête, atomique
  const nowIso = new Date().toISOString();
  const { data: invite, error: claimError } = await admin
    .from('invitations')
    .update({ status: 'ACCEPTED', accepted_at: nowIso })
    .eq('token', token)
    .eq('status', 'PENDING')
    .gt('expires_at', nowIso)
    .select('id, org_id, email, roles, beneficiary_id, invited_by, created_at')
    .maybeSingle();

  if (claimError || !invite) {
    return { success: false, error: 'Invitation invalide, expirée ou déjà utilisée.' };
  }

  // 2. Find or create auth.users
  let userId: string;
  const { data: existingProfile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', invite.email)
    .maybeSingle();

  if (existingProfile) {
    userId = existingProfile.id;
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: invite.email,
      email_confirm: true,
      user_metadata: {},
    });
    if (createError || !created.user) {
      // Best-effort rollback : remettre PENDING (mais on a un audit trail OK)
      await admin
        .from('invitations')
        .update({ status: 'PENDING', accepted_at: null })
        .eq('id', invite.id);
      return {
        success: false,
        error: 'Création du compte impossible : ' + (createError?.message ?? ''),
      };
    }
    userId = created.user.id;

    await admin.from('user_profiles').insert({
      id: userId,
      email: invite.email,
      default_org_id: invite.org_id,
    });
  }

  // 3. Membership (idempotent via upsert)
  await admin.from('memberships').upsert(
    {
      org_id: invite.org_id,
      user_id: userId,
      roles: invite.roles,
      status: 'ACTIVE',
      invited_by: invite.invited_by,
      invited_at: invite.created_at,
      accepted_at: nowIso,
    },
    { onConflict: 'org_id,user_id' },
  );

  // 4. Lien beneficiary si invitation bénéficiaire
  if (invite.beneficiary_id) {
    await admin.from('beneficiaries').update({ user_id: userId }).eq('id', invite.beneficiary_id);
  }

  // 5. Set active_org_id côté auth.users (effet immédiat au prochain refresh)
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const currentAppMeta = (authUser?.user?.app_metadata ?? {}) as Record<string, unknown>;
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...currentAppMeta,
      active_org_id: invite.org_id,
      active_roles: invite.roles,
    },
  });

  // 6. Magic link auto-login
  const next = invite.roles.includes('BENEFICIARY') ? '/portal' : '/dashboard';
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: invite.email,
    options: { redirectTo: callbackUrl },
  });

  // 7. Audit
  await logAuditEvent({
    eventType: 'invitation.accepted',
    orgId: invite.org_id,
    userId,
    userEmail: invite.email,
    resourceType: 'INVITATION',
    resourceId: invite.id,
    metadata: { roles: invite.roles, is_beneficiary: !!invite.beneficiary_id },
  });

  return {
    success: true,
    redirectUrl: linkData?.properties?.action_link ?? `${env.NEXT_PUBLIC_APP_URL}/login`,
  };
}

// ===========================================================================
// requestInvitationResendByToken — Module 14 PR §B3
// ===========================================================================
//
// Quand un invité clique sur un lien d'invitation expiré ou déjà consommé,
// la page `/accept-invite` affiche un fallback graceful avec un bouton
// "Demander une nouvelle invitation". Ce bouton appelle cette Server
// Action côté anon (pas de session requise — le user n'est pas encore
// authentifié).
//
// Anti enumeration : on retourne TOUJOURS `{ ok: true }`, peu importe :
//   - token absent ou invalide
//   - invitation trouvée mais déjà acceptée / revoked / expirée
//   - invited_by null ou user inviter introuvable
// → empêche un attaquant de scanner les tokens valides via différence de
//   réponse. Le seul side-effect réel est l'envoi d'email à l'inviteur
//   quand toutes les conditions sont remplies.

const RequestInvitationResendSchema = z.object({
  token: z.string().min(8).max(128),
});
type RequestInvitationResendInput = z.input<typeof RequestInvitationResendSchema>;

export type RequestInvitationResendResult = { ok: true };

export async function requestInvitationResendByToken(
  input: RequestInvitationResendInput,
): Promise<RequestInvitationResendResult> {
  // Module 14 B5 — rate limit 5/15min/IP (anti spam de l'inviteur)
  const rl = await checkRateLimitForCurrentRequest('invitation_resend');
  if (!rl.allowed) {
    // Anti enum : on retourne ok: true même si rate-limited (le fallback
    // côté UI affiche le même message confirmation peu importe).
    return { ok: true };
  }

  const parsed = RequestInvitationResendSchema.safeParse(input);
  if (!parsed.success) {
    // Anti enum : silently OK
    return { ok: true };
  }
  const { token } = parsed.data;
  const admin = getSupabaseAdminClient();

  // 1. Lookup invitation (any status, n'importe quel expires_at)
  const { data: invitation } = await admin
    .from('invitations')
    .select('id, org_id, email, status, invited_by')
    .eq('token', token)
    .maybeSingle();

  if (!invitation || !invitation.invited_by) {
    return { ok: true };
  }

  // 2. Récupère email inviteur et org name
  const [{ data: inviterData }, { data: org }] = await Promise.all([
    admin.auth.admin.getUserById(invitation.invited_by),
    admin.from('organizations').select('name').eq('id', invitation.org_id).maybeSingle(),
  ]);

  const inviterEmail = inviterData?.user?.email ?? null;
  if (!inviterEmail) {
    return { ok: true };
  }

  // 3. Send email via Resend (best-effort — pas de gate sur le retour)
  await sendEmail({
    to: inviterEmail,
    template: 'invitation_expired_renotify',
    variables: {
      inviterEmail,
      inviteeEmail: invitation.email,
      orgName: org?.name ?? 'Capiwise',
    },
    audit: {
      orgId: invitation.org_id,
      relatedEntityType: 'INVITATION',
      relatedEntityId: invitation.id,
    },
  });

  // 4. Audit (best-effort — l'invitee est anonyme à ce point)
  await logAuditEvent({
    eventType: 'invitation.expired_resend_requested',
    orgId: invitation.org_id,
    userEmail: invitation.email,
    resourceType: 'INVITATION',
    resourceId: invitation.id,
    metadata: {
      inviter_email: inviterEmail,
      invitation_status: invitation.status,
    },
  });

  return { ok: true };
}

// ===========================================================================
// revokeInvitation — Module 2 §6.2
// ===========================================================================

export type RevokeInvitationResult = { success: true } | { success: false; error: string };

export async function revokeInvitation(
  input: RevokeInvitationInput,
): Promise<RevokeInvitationResult> {
  const parsed = revokeInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'invitationId invalide' };
  }
  const user = await requirePermission('org.manage_members');
  if (!user.activeOrgId) {
    return { success: false, error: 'Aucune organisation active' };
  }
  const admin = getSupabaseAdminClient();

  // CAS : on ne révoque que si encore PENDING, et seulement dans l'org active
  const { data: invite, error } = await admin
    .from('invitations')
    .update({ status: 'REVOKED' })
    .eq('id', parsed.data.invitationId)
    .eq('org_id', user.activeOrgId)
    .eq('status', 'PENDING')
    .select('id, email')
    .maybeSingle();

  if (error || !invite) {
    return { success: false, error: 'Invitation introuvable ou déjà traitée.' };
  }

  // Notification email best-effort
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', user.activeOrgId)
    .single();

  await sendEmail({
    to: invite.email,
    template: 'invitation_revoked',
    variables: {
      orgName: org?.name ?? 'Capiwise',
      inviterEmail: user.email,
    },
    audit: {
      orgId: user.activeOrgId,
      relatedEntityType: 'INVITATION',
      relatedEntityId: invite.id,
    },
  });

  await logAuditEvent({
    eventType: 'invitation.revoked',
    orgId: user.activeOrgId,
    userId: user.id,
    userEmail: user.email,
    resourceType: 'INVITATION',
    resourceId: invite.id,
    metadata: { email: invite.email },
  });

  revalidatePath('/dashboard/settings/members');
  return { success: true };
}
