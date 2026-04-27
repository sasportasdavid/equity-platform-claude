'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Role } from '@equity/shared';
import { uuidSchema, emailSchema } from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { getServerEnv } from '@/lib/env';
import { sendEmail } from '@/lib/resend/client';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const MAGIC_LINK_EXPIRES_MINUTES = 15;

// ===========================================================================
// sendMagicLink
// ===========================================================================
//
// Module 2 §1.3 — Flow login utilisateur existant.
//   1. Vérifier que l'email existe dans user_profiles (sinon « fake success »
//      pour éviter l'email enumeration, spec §11)
//   2. supabase.auth.admin.generateLink({ type: 'magiclink', ... }) → action_link
//   3. Envoyer l'email via Resend (template magic_link_login)
//   4. Logger audit `auth.magic_link_sent`
//   5. Retourner toujours `{ success: true }` (no leak)
//
// ⚠️ LIMITATION CONNUE — flow OTP legacy (pas PKCE).
//
// `admin.auth.admin.generateLink({ type: 'magiclink' })` génère **toujours**
// un lien OTP legacy de la forme :
//   https://<project>.supabase.co/auth/v1/verify?token=xxx&type=magiclink&redirect_to=...
//
// Le `flowType: 'pkce'` configuré côté SDK browser/server (cf. client.ts,
// server.ts, proxy.ts) ne s'applique qu'aux appels CÔTÉ CLIENT
// (`signInWithOtp`, OAuth `signInWithOAuth`). L'admin API server-side reste
// en OTP legacy.
//
// Conséquence pratique : les magic links sont vulnérables au pre-fetching
// par Gmail / Apple Mail qui consume le token avant que l'utilisateur ne
// clique → l'utilisateur reçoit `?error_code=otp_expired` au callback.
// Le fallback `verifyOtp` dans /auth/callback ne se déclenche pas car
// Supabase a déjà invalidé le token côté serveur.
//
// **Solutions possibles (à arbitrer selon priorité)** :
//
//   A. **Auth Hook "Send Email"** côté Dashboard Supabase :
//      Configure Supabase pour appeler une URL custom (notre webhook
//      Resend) au lieu du SMTP natif Supabase. Garde le flow PKCE natif
//      Supabase + le template Resend. C'est la solution propre prod.
//      Doc : https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
//
//   B. **Bascule vers `signInWithOtp` côté client** :
//      Au lieu de générer le link côté server + envoyer via Resend, on
//      appelle `supabase.auth.signInWithOtp({ email, options: {
//      emailRedirectTo: callbackUrl } })` côté client. Avec flowType:
//      'pkce', le verifier est posé en cookie au moment du click submit
//      → pre-fetching ne peut pas finaliser. Mais on perd le custom
//      template Resend (Supabase envoie son propre email).
//
//   C. **Ajouter un code OTP 6 digits** en complément du link :
//      `linkData.properties.email_otp` est exposé par generateLink.
//      L'utilisateur peut soit cliquer le link (vulnérable pre-fetch),
//      soit saisir le code manuellement (anti pre-fetch). Plus complexe
//      côté UX mais robuste.
//
// Pour l'instant on garde l'OTP legacy + fallback callback `verifyOtp`.
// Le bug pre-fetching est documenté dans le bandeau d'erreur de /login
// pour aider l'utilisateur à comprendre et essayer un autre client mail.

const SendMagicLinkSchema = z.object({
  email: emailSchema,
  redirectTo: z.string().startsWith('/').max(200).optional(),
});

export type SendMagicLinkResult = { success: true } | { success: false; error: string };

export async function sendMagicLink(
  input: z.input<typeof SendMagicLinkSchema>,
): Promise<SendMagicLinkResult> {
  const parsed = SendMagicLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Adresse email invalide' };
  }
  const { email, redirectTo } = parsed.data;
  const env = getServerEnv();
  const admin = getSupabaseAdminClient();

  // 1. Vérification d'existence (no leak)
  const { data: profile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!profile) {
    // Réponse identique pour ne pas révéler l'existence d'un compte
    return { success: true };
  }

  // 2. Génération du magic link via service_role
  const next = redirectTo ?? '/dashboard';
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: callbackUrl },
  });

  if (linkError || !linkData.properties?.action_link) {
    console.error('[auth] generateLink failed', linkError);
    return { success: true }; // toujours fake success
  }

  // 3. Envoi via Resend
  const sent = await sendEmail({
    to: email,
    template: 'magic_link_login',
    variables: {
      actionLink: linkData.properties.action_link,
      expiresInMinutes: MAGIC_LINK_EXPIRES_MINUTES,
    },
    audit: { userId: profile.id },
  });

  if (!sent.ok) {
    console.error('[auth] sendEmail magic_link_login failed', sent.error);
    // On garde la réponse "success" pour ne pas leaker une éventuelle bounce
  }

  // 4. Audit
  await logAuditEvent({
    eventType: 'auth.magic_link_sent',
    resourceType: 'USER',
    resourceId: profile.id,
    userId: profile.id,
    userEmail: email,
    metadata: { redirect_to: next, sent_via: 'resend' },
  });

  return { success: true };
}

// ===========================================================================
// logout — Module 2 §1.6
// ===========================================================================

export async function logout(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  if (user) {
    await logAuditEvent({
      eventType: 'auth.logout',
      resourceType: 'USER',
      resourceId: user.id,
      userId: user.id,
      userEmail: user.email ?? null,
    });
  }
  redirect('/login');
}

// ===========================================================================
// setActiveOrg — Module 2 §2.2
// ===========================================================================
//
//   1. Vérifie qu'un membership ACTIVE existe pour (user, org)
//   2. Met à jour user_profiles.default_org_id (le hook le re-lit au prochain
//      refresh) ET auth.users.raw_app_meta_data.active_org_id (effet immédiat
//      après refreshSession)
//   3. Logge audit.org_switched
//   4. revalidatePath('/') pour invalider tout le SSR cache
//   5. Renvoie { success } — le client doit ensuite appeler
//      supabase.auth.refreshSession() pour récupérer le nouveau JWT

const SetActiveOrgSchema = z.object({ orgId: uuidSchema });

export type SetActiveOrgResult =
  | { success: true; activeRoles: readonly Role[] }
  | { success: false; error: string };

export async function setActiveOrg(
  input: z.input<typeof SetActiveOrgSchema>,
): Promise<SetActiveOrgResult> {
  const parsed = SetActiveOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'org_id invalide' };
  }
  const { orgId } = parsed.data;
  const user = await requireUser();
  const previousOrgId = user.activeOrgId;

  const admin = getSupabaseAdminClient();

  // 1. Vérification du membership ACTIVE
  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .select('id, roles, org_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (membershipError || !membership) {
    return { success: false, error: 'Vous n’êtes pas membre actif de cette organisation' };
  }

  const roles = (membership.roles ?? []) as Role[];

  // 2. user_profiles.default_org_id — source pour les futurs JWT
  const { error: profileError } = await admin
    .from('user_profiles')
    .update({ default_org_id: orgId })
    .eq('id', user.id);
  if (profileError) {
    return { success: false, error: profileError.message };
  }

  // 2bis. auth.users.raw_app_meta_data — effet immédiat (au prochain refresh)
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const currentAppMeta = (authUser?.user?.app_metadata ?? {}) as Record<string, unknown>;
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...currentAppMeta,
      active_org_id: orgId,
      active_roles: roles,
    },
  });
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // 3. Audit
  await logAuditEvent({
    eventType: 'auth.org_switched',
    resourceType: 'MEMBERSHIP',
    resourceId: membership.id,
    userId: user.id,
    userEmail: user.email,
    orgId,
    metadata: { from_org_id: previousOrgId, to_org_id: orgId, roles },
  });

  // 4. Invalidation
  revalidatePath('/');

  return { success: true, activeRoles: roles };
}
