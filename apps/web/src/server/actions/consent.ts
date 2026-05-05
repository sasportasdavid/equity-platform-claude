'use server';

import { z } from 'zod';
import { COOKIE_CONSENT_LEVELS } from '@/lib/legal/constants';
import { logAuditEvent } from '@/lib/audit';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 14 PR §B4 — Server Action pour mirroir le consentement cookie
 * dans `user_profiles.cookie_preferences` quand l'utilisateur est
 * authentifié.
 *
 * Anonyme : le cookie `cookie_consent_v1` côté browser suffit. Cette
 * action ne fait rien si l'user n'est pas authentifié (return ok: true
 * silencieux).
 *
 * Pas de `requireUser()` ici (qui redirige `/login`) : on lit la session
 * via `createSupabaseServerClient` et on retourne ok sans erreur si
 * pas de session, pour ne pas casser le flow de l'utilisateur anon qui
 * cliquerait sur le banner avant de signer up.
 */

const RecordConsentSchema = z.object({
  level: z.enum(COOKIE_CONSENT_LEVELS),
});
type RecordConsentInput = z.input<typeof RecordConsentSchema>;

export type RecordCookieConsentResult = { ok: true };

export async function recordCookieConsent(
  input: RecordConsentInput,
): Promise<RecordCookieConsentResult> {
  const parsed = RecordConsentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: true };
  }
  const { level } = parsed.data;

  // Lit la session sans rediriger
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Anon — le cookie côté browser suffit
    return { ok: true };
  }

  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Lit prefs existantes pour merge non-destructif
  const { data: profile } = await admin
    .from('user_profiles')
    .select('cookie_preferences')
    .eq('id', user.id)
    .single();
  const prev = (profile?.cookie_preferences ?? {}) as Record<string, unknown>;

  await admin
    .from('user_profiles')
    .update({
      cookie_preferences: {
        ...prev,
        acknowledged: true,
        accepted_at: nowIso,
        level,
      },
    })
    .eq('id', user.id);

  await logAuditEvent({
    eventType: 'user.cookie_consent_recorded',
    resourceType: 'USER',
    resourceId: user.id,
    userId: user.id,
    userEmail: user.email ?? null,
    metadata: { level },
  });

  return { ok: true };
}
