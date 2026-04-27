import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 2 §1.3 — Auth callback : termine le flow magic link / OAuth
 * et redirige vers `next` (par défaut /dashboard).
 *
 * **Deux flows supportés** (defensive coding) :
 *  1. **PKCE** (recommandé, par défaut) : Supabase envoie l'utilisateur
 *     sur `/auth/callback?code=xxx&next=/dashboard`. On échange via
 *     `exchangeCodeForSession(code)` qui utilise le verifier en cookie
 *     posé au signInWithOtp().
 *  2. **OTP legacy** (fallback) : Supabase envoie sur
 *     `/auth/callback?token=xxx&type=magiclink&...`. On échange via
 *     `verifyOtp({ type, token_hash: token })`. Ce cas devrait
 *     disparaître une fois `flowType: 'pkce'` activé partout — mais on
 *     le garde en filet de sécurité au cas où un ancien email serait
 *     ouvert ou si la config Supabase Dashboard n'est pas alignée.
 *
 * Whitelist `next` : doit commencer par `/` pour éviter open redirect.
 *
 * Logging server-side (`console.info`) à chaque étape pour faciliter le
 * diagnostic des erreurs auth (les logs apparaissent dans le terminal
 * `pnpm dev` ou les logs Vercel).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash') ?? searchParams.get('token');
  const type = searchParams.get('type');
  const nextRaw = searchParams.get('next') ?? '/dashboard';
  const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard';

  console.info('[auth/callback] received', {
    hasCode: !!code,
    hasTokenHash: !!tokenHash,
    type,
    next,
    queryKeys: [...searchParams.keys()],
  });

  const supabase = await createSupabaseServerClient();

  // --- Flow 1 : PKCE (?code=) -------------------------------------------
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      console.error('[auth/callback] PKCE exchange failed', {
        error: error?.message,
        code: error?.code ?? null,
        status: error?.status ?? null,
      });
      return NextResponse.redirect(
        `${origin}/login?error=exchange_failed&details=${encodeURIComponent(error?.message ?? 'unknown')}`,
      );
    }
    console.info('[auth/callback] PKCE exchange OK', { userId: data.user.id });
    await logAuditEvent({
      eventType: 'auth.login_success',
      resourceType: 'USER',
      resourceId: data.user.id,
      userId: data.user.id,
      userEmail: data.user.email ?? null,
      metadata: { redirect_to: next, method: 'magic_link', flow: 'pkce' },
    });
    return NextResponse.redirect(`${origin}${next}`);
  }

  // --- Flow 2 : OTP legacy (?token=&type=) --------------------------------
  if (tokenHash && type) {
    // Types valides pour verifyOtp : 'magiclink' | 'recovery' | 'email_change' | 'invite' | 'signup'
    const allowed = ['magiclink', 'recovery', 'email_change', 'invite', 'signup'] as const;
    if (!allowed.includes(type as (typeof allowed)[number])) {
      console.error('[auth/callback] OTP unknown type', { type });
      return NextResponse.redirect(
        `${origin}/login?error=unknown_otp_type&type=${encodeURIComponent(type)}`,
      );
    }
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as (typeof allowed)[number],
      token_hash: tokenHash,
    });
    if (error || !data.user) {
      console.error('[auth/callback] OTP verify failed', {
        error: error?.message,
        code: error?.code ?? null,
        status: error?.status ?? null,
      });
      return NextResponse.redirect(
        `${origin}/login?error=otp_failed&details=${encodeURIComponent(error?.message ?? 'unknown')}`,
      );
    }
    console.info('[auth/callback] OTP verify OK', { userId: data.user.id, type });
    await logAuditEvent({
      eventType: 'auth.login_success',
      resourceType: 'USER',
      resourceId: data.user.id,
      userId: data.user.id,
      userEmail: data.user.email ?? null,
      metadata: { redirect_to: next, method: 'magic_link', flow: 'otp_legacy', type },
    });
    return NextResponse.redirect(`${origin}${next}`);
  }

  // --- Aucun paramètre attendu -------------------------------------------
  console.warn('[auth/callback] no code/token in URL', {
    queryKeys: [...searchParams.keys()],
  });
  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
