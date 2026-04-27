import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 2 §1.3 — Auth callback : échange le `code` (PKCE flow) contre
 * une session, puis redirige vers `next` (par défaut /dashboard).
 *
 * Cette route est appelée par Supabase après que l'utilisateur a cliqué
 * sur son magic link. Le `code` est passé en query string.
 *
 * Whitelist `next` : doit commencer par `/` pour éviter open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextRaw = searchParams.get('next') ?? '/dashboard';
  const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // Audit (best-effort)
  await logAuditEvent({
    eventType: 'auth.login_success',
    resourceType: 'USER',
    resourceId: data.user.id,
    userId: data.user.id,
    userEmail: data.user.email ?? null,
    metadata: { redirect_to: next, method: 'magic_link' },
  });

  return NextResponse.redirect(`${origin}${next}`);
}
