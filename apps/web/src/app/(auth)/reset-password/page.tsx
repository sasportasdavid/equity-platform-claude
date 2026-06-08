import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe · Capiwise',
};

/**
 * /reset-password — Phase 3 étape 2.
 *
 * Prérequis : le user arrive ici via /auth/callback (verifyOtp type=recovery)
 * qui a établi une session de récupération. Si pas de session → redirect
 * /forgot-password (= lien expiré ou déjà consommé).
 */
export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/forgot-password?expired=1');

  return <ResetPasswordForm />;
}
