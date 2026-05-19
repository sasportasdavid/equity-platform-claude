'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Role, SignupWithMagicLinkInput } from '@equity/shared';
import { uuidSchema, emailSchema, signupWithMagicLinkSchema } from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { ensureUserProfileExists } from '@/lib/auth/ensure-user-profile';
import { getServerEnv } from '@/lib/env';
import { checkRateLimitForCurrentRequest, formatRateLimitedMessage } from '@/lib/rate-limit/server';
import { sendEmail } from '@/lib/resend/client';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const MAGIC_LINK_EXPIRES_MINUTES = 15;

// ===========================================================================
// checkEmailExistsForLogin
// ===========================================================================
//
// Server Action utilitaire pour le login self-service via signInWithOtp
// côté browser (Option C). Le pré-check d'existence est nécessaire parce
// que :
//
//   - On veut bloquer le signup public (l'inscription se fait par
//     invitation admin uniquement).
//   - Si on appelle `signInWithOtp({ shouldCreateUser: false })` côté
//     client + Supabase Dashboard a "Signups disabled", Supabase répond
//     422 `otp_disabled` même pour un email valide (cf. diagnostic
//     dans le commit précédent).
//   - Donc on appelle `signInWithOtp({ shouldCreateUser: true })` SEULEMENT
//     si l'email existe en DB. Si l'email n'existe pas, on retourne
//     fake success côté client (anti email enumeration préservé).
//
// Cette fonction renvoie un boolean — pas l'identifiant du user, pour
// limiter la surface d'attaque en cas d'abus (rate limit côté Supabase
// + Vercel + this server).
//
// **Rate limiting recommandé** : à ajouter côté webhook Vercel ou via
// upstash en future itération si le bot scraping devient un problème.

export async function checkEmailExistsForLogin(rawEmail: string): Promise<boolean> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return false;
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', parsed.data)
    .maybeSingle();
  return !!profile;
}

// ===========================================================================
// signupWithMagicLink — Module 14 PR #43 §B1 (Option C : magic-link only)
// + Bug #1 fix sprint 6 mai 2026 PM (envoi serverside via Resend)
// ===========================================================================
//
// Spec MODULE_02 §1.2 + §2.4 + brief PR #43.
//
// Flow :
//   1. Rate limit + Zod parse.
//   2. Anti email enumeration : si l'email a déjà un user_profile + une
//      membership ACTIVE (= compte finalisé), fake success. On envoie quand
//      même un magic-link login pour que le user puisse se reconnecter.
//   3. Si profile partiel (auth.users sans membership) : update ToS,
//      isNewUser=true.
//   4. Si totalement nouveau : `auth.admin.createUser({ email_confirm: false })`
//      → `ensureUserProfileExists` (RPC) → UPDATE ToS.
//   5. **Bug #1 fix** : on génère le magic link via
//      `admin.auth.admin.generateLink({ type: 'magiclink' })` puis on envoie
//      via Resend (template `magic_link_login`). Avant ce fix le client
//      faisait `signInWithOtp` (résultat IGNORÉ → UI mentait quand le mail
//      ne partait pas). Maintenant la Server Action est l'unique source de
//      vérité — si l'envoi fail, on retourne ok=false.
//   6. Audit + return.
//
// Tradeoff connu (dette V1.5 #40) : `admin.generateLink({ type: 'magiclink' })`
// génère un lien OTP legacy (`?token=&type=magiclink`) vulnérable au
// pre-fetching Gmail/Apple Mail (le scanner consume le token avant le
// clic → otp_expired). Acceptable beta privée — V1.5 = Auth Hook custom
// email pour PKCE + Resend en un seul flow.

export type SignupWithMagicLinkResult =
  | { ok: true; isNewUser: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function signupWithMagicLink(
  input: SignupWithMagicLinkInput,
): Promise<SignupWithMagicLinkResult> {
  // Module 14 B5 — rate limit 5/15min/IP
  const rl = await checkRateLimitForCurrentRequest('signup');
  if (!rl.allowed) {
    return { ok: false, error: formatRateLimitedMessage(rl.retryAfterMs) };
  }

  const parsed = signupWithMagicLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Veuillez corriger les erreurs ci-dessous.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { email, tosVersion } = parsed.data;
  console.log('[auth] signup start', { email, tosVersion });

  const env = getServerEnv();
  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent('/onboarding/profile')}`;

  // 1. Check existing profile
  const { data: profile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let userId: string;
  let isNewUser: boolean;

  if (profile) {
    // 2. Check si compte finalisé (≥1 membership ACTIVE) → anti enumeration
    const { count: activeMemberships } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('status', 'ACTIVE');

    if ((activeMemberships ?? 0) > 0) {
      // Compte finalisé → on déclenche un magic link de LOGIN (best-effort,
      // pour que le user puisse se reconnecter normalement) PUIS on retourne
      // success. La réponse est identique à un nouveau signup (anti enum).
      console.log('[auth] signup existing-active', { email, userId: profile.id });
      await sendMagicLinkInternal({
        email,
        userId: profile.id,
        callbackUrl,
      });
      await logAuditEvent({
        eventType: 'auth.signup_attempted_existing',
        resourceType: 'USER',
        resourceId: profile.id,
        userEmail: email,
        metadata: { tos_version: tosVersion },
      });
      return { ok: true, isNewUser: false };
    }
    // Compte partiel : update ToS, on relance la confirmation par magic link
    userId = profile.id;
    isNewUser = true;
    console.log('[auth] signup partial-profile', { email, userId });
  } else {
    // 3. User totalement nouveau : crée auth.users + user_profile
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
    });
    if (createError || !created.user) {
      console.error('[auth] signup createUser failed', { email, error: createError?.message });
      return {
        ok: false,
        error: createError?.message ?? 'Création du compte impossible. Réessayez dans un instant.',
      };
    }
    userId = created.user.id;
    isNewUser = true;
    console.log('[auth] signup createUser ok', { email, userId });

    try {
      await ensureUserProfileExists(userId, email);
    } catch (err) {
      console.error('[auth] signup ensureUserProfile failed', { email, userId, err });
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Création du profil utilisateur impossible.',
      };
    }
  }

  // 4. Persiste ToS dans user_profiles
  const { error: tosError } = await admin
    .from('user_profiles')
    .update({
      tos_accepted_at: nowIso,
      tos_version_accepted: tosVersion,
    })
    .eq('id', userId);
  if (tosError) {
    console.error('[auth] signup tos update failed', { email, userId, err: tosError.message });
    // Non-bloquant — le user pourra finaliser au callback. On poursuit
    // avec l'envoi du magic link.
  }

  // 5. Génération + envoi du magic link via Resend (Bug #1 fix)
  const sent = await sendMagicLinkInternal({
    email,
    userId,
    callbackUrl,
  });
  if (!sent.ok) {
    console.error('[auth] signup magic link send failed', { email, userId, err: sent.error });
    return {
      ok: false,
      error: 'Envoi du lien de connexion impossible. Vérifiez votre adresse email et réessayez.',
    };
  }

  // 6. Audit
  await logAuditEvent({
    eventType: 'auth.signup_initiated',
    resourceType: 'USER',
    resourceId: userId,
    userId,
    userEmail: email,
    metadata: { tos_version: tosVersion, magic_link_sent_via: 'resend' },
  });
  console.log('[auth] signup complete', { email, userId, isNewUser });

  return { ok: true, isNewUser };
}

/**
 * Helper interne — génère un magic link via service_role + envoie via Resend.
 * Utilisé par signupWithMagicLink pour les nouveaux comptes ET les comptes
 * existants ACTIVE (login standard). Renvoie un Result au lieu de throw,
 * pour que le caller décide d'échouer franchement (signup nouveau) ou de
 * fake-success (anti enumeration sur compte existant).
 *
 * Cf. dette #40 V1.5 (pre-fetching Gmail).
 */
async function sendMagicLinkInternal(params: {
  email: string;
  userId: string;
  callbackUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getSupabaseAdminClient();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: params.email,
    options: { redirectTo: params.callbackUrl },
  });
  if (linkError || !linkData.properties?.action_link) {
    console.error('[auth] generateLink failed', { email: params.email, err: linkError?.message });
    return { ok: false, error: linkError?.message ?? 'generateLink failed' };
  }
  console.log('[auth] generateLink ok', { email: params.email });

  const sent = await sendEmail({
    to: params.email,
    template: 'magic_link_login',
    variables: {
      actionLink: linkData.properties.action_link,
      expiresInMinutes: MAGIC_LINK_EXPIRES_MINUTES,
    },
    audit: { userId: params.userId },
  });
  if (!sent.ok) {
    console.error('[auth] Resend send failed', { email: params.email, err: sent.error });
    return { ok: false, error: sent.error };
  }
  console.log('[auth] Resend sent', {
    email: params.email,
    providerMessageId: sent.providerMessageId,
  });
  return { ok: true };
}

// ===========================================================================
// sendMagicLink — RÉSERVÉ AUX INVITATIONS ADMIN (n'est plus utilisé pour
// le login self-service depuis la refonte Option B — cf. login-form.tsx)
// ===========================================================================
//
// Module 2 §1.3 — Génération + envoi d'un magic link via le service_role
// (admin) avec template Resend custom. Utilisé pour :
//   - Les invitations bénéficiaires (Module 2 §3.4)
//   - Tout flow où l'admin doit déclencher un envoi de magic link à un
//     autre utilisateur (recovery contrôlé, etc.)
//
// ⚠️ NE PAS UTILISER pour le login self-service utilisateur :
// `admin.auth.admin.generateLink({ type: 'magiclink' })` génère un lien
// OTP legacy (`?token=&type=magiclink`) vulnérable au pre-fetching
// Gmail / Apple Mail (consume le token one-time-use avant le clic →
// `otp_expired`). Pour le login user, on utilise `signInWithOtp` côté
// client browser qui pose un PKCE verifier en cookie (résistant au
// pre-fetching). Voir `apps/web/src/app/(auth)/login/login-form.tsx`.
//
// Cette Server Action reste pertinente pour les invitations car :
//   - L'admin doit déclencher l'envoi d'un email à QUELQU'UN D'AUTRE,
//     pas pour lui-même (signInWithOtp ne marche pas dans ce cas).
//   - Le template Resend custom (`magic_link_login`) reste utile pour
//     le branding email des invites.
//   - Le pre-fetching reste un risque mais l'invité peut toujours
//     redemander un nouveau lien.
//
// Étape de migration future possible : configurer un Auth Hook
// "Send Email" côté Dashboard Supabase pour combiner PKCE natif +
// template Resend dans un seul flow propre.

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
//
// **Bug "boucle de profile switch" (fix 2026-05-19)** :
// `supabase.auth.signOut()` queue les cookie writes via
// `onAuthStateChange('SIGNED_OUT', ...)` qui est async — sous certaines
// races (Next 16 Server Action + `redirect()` synchrone), les Set-Cookie
// peuvent ne pas être appliqués au 303 response. Résultat : User A
// "déconnecté" garde sa session côté browser, User B s'auth par dessus,
// et le proxy voit un état mixte → boucle entre /login ↔ /dashboard ↔
// /select-org.
//
// Defensive sweep : on énumère TOUS les cookies `sb-*` du request et on
// les force à expirer (`maxAge: 0`) AVANT le redirect — en plus du
// signOut() canonique. Garantit que le 303 transporte les Set-Cookie
// de suppression, même si l'event listener Supabase n'a pas terminé.
// Coût : ~5 cookieStore.set() supplémentaires (négligeable).

export async function logout(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. signOut() canonique — invalide la session côté Supabase (scope:
  //    'global' par défaut, ce qui révoque le refresh token globalement).
  await supabase.auth.signOut();

  // 2. Sweep défensif : force-delete tous les cookies `sb-*` du browser.
  //    Inclut les variantes chunked (`sb-xxx.0`, `sb-xxx.1`...) et le PKCE
  //    verifier (`sb-xxx-auth-token-code-verifier`).
  const cookieStore = await cookies();
  const sbCookies = cookieStore.getAll().filter((c) => c.name.startsWith('sb-'));
  for (const { name } of sbCookies) {
    cookieStore.set(name, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  console.info('[auth] logout', {
    userId: user?.id ?? null,
    cookiesCleared: sbCookies.map((c) => c.name),
  });

  if (user) {
    await logAuditEvent({
      eventType: 'auth.logout',
      resourceType: 'USER',
      resourceId: user.id,
      userId: user.id,
      userEmail: user.email ?? null,
    });
  }

  // 3. Invalide tout le SSR cache — évite que User B voit des données
  //    cachées par User A (sidebar counts, etc.).
  revalidatePath('/', 'layout');

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
