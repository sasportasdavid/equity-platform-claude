'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { checkEmailExistsForLogin } from '@/server/actions/auth';

/**
 * Login form V2 — email + mot de passe (primaire) + magic link (fallback).
 *
 * Pourquoi password + magic link (au lieu de magic link only) :
 *   - Magic link a multiplié les bugs en prod (PKCE incompatible server-side,
 *     pre-fetching Gmail, domaine Resend non vérifié, comptes zombies). Cf
 *     PR #58 + audit V1.X.
 *   - Password = UX standard, pas de dépendance Resend pour login quotidien.
 *   - Magic link reste disponible en fallback pour les users qui préfèrent.
 *
 * Flow :
 *   1. User tape email + password → signInWithPassword côté browser
 *      → session établie via cookies → redirect /dashboard ou /portal
 *   2. Si "Mot de passe oublié" → /forgot-password (Phase 3)
 *   3. Si "Pas de mot de passe ?" → clic "Recevoir un lien magique" →
 *      signInWithOtp browser (PKCE) → email → /auth/callback
 */
function getAuthErrorMessage(
  queryError: string | null,
  fragmentErrorCode: string | null,
  fragmentDescription: string | null,
): string | null {
  if (fragmentErrorCode === 'otp_expired') {
    return (
      'Le lien de connexion a expiré ou a déjà été utilisé. ' +
      'Demandez un nouveau lien et cliquez dessus rapidement.'
    );
  }
  if (fragmentErrorCode) {
    return fragmentDescription ?? `Erreur d'authentification : ${fragmentErrorCode}`;
  }
  switch (queryError) {
    case 'missing_code':
      return (
        'Le lien de connexion ne contient pas de code valide. ' +
        'Le lien a peut-être déjà été utilisé ou a expiré.'
      );
    case 'exchange_failed':
      return 'Échange du code échoué. Demandez un nouveau lien.';
    case 'otp_failed':
      return 'Vérification du code OTP échouée. Demandez un nouveau lien.';
    case 'unknown_otp_type':
      return "Type d'OTP inconnu. Contactez le support.";
    case 'invalid_credentials':
      return 'Email ou mot de passe incorrect.';
    default:
      return null;
  }
}

export function LoginForm() {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [magicSentTo, setMagicSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

  // Fragment error (Supabase posée parfois dans #error=...)
  const [fragmentError, setFragmentError] = useState<{
    errorCode: string | null;
    description: string | null;
  }>({ errorCode: null, description: null });
  const [hasReadFragment, setHasReadFragment] = useState(false);
  if (!hasReadFragment && typeof window !== 'undefined') {
    setHasReadFragment(true);
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      const fragmentParams = new URLSearchParams(hash);
      const errorCode = fragmentParams.get('error_code');
      const description = fragmentParams.get('error_description');
      if (errorCode || description) {
        setFragmentError({
          errorCode,
          description: description?.replace(/\+/g, ' ') ?? null,
        });
      }
    }
  }

  const queryError = params.get('error');
  const authErrorMessage =
    credentialsError ??
    getAuthErrorMessage(queryError, fragmentError.errorCode, fragmentError.description);

  function getRedirectTo(): string {
    const redirectToQuery = params.get('redirectTo');
    return redirectToQuery?.startsWith('/') ? redirectToQuery : '/dashboard';
  }

  function onSubmitPassword(formData: FormData) {
    setErrors({});
    setCredentialsError(null);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!email || !email.includes('@')) {
      setErrors({ email: ['Adresse email invalide'] });
      return;
    }
    if (!password) {
      setErrors({ password: ['Mot de passe requis'] });
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Anti-enumeration : on n'expose pas la différence entre "email
        // inconnu" et "mot de passe faux". Message générique unique.
        if (error.status === 400 || error.status === 401) {
          setCredentialsError('Email ou mot de passe incorrect.');
        } else if (error.status && error.status >= 500) {
          setCredentialsError(`Erreur serveur (${error.status}). Réessayez dans un instant.`);
        } else {
          setCredentialsError(error.message || 'Connexion impossible.');
        }
        return;
      }

      // Hard reload pour que le proxy lise les cookies fraîchement écrits
      // (cf fix boucle login switch profile — branche router.replace
      // utilise parfois les anciens cookies).
      window.location.href = getRedirectTo();
    });
  }

  function onRequestMagicLink() {
    setErrors({});
    setCredentialsError(null);
    const emailInput = document.getElementById('email') as HTMLInputElement | null;
    const email = (emailInput?.value ?? '').trim();
    if (!email || !email.includes('@')) {
      setErrors({ email: ['Saisissez votre email pour recevoir un lien magique'] });
      return;
    }
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      getRedirectTo(),
    )}`;

    startTransition(async () => {
      const exists = await checkEmailExistsForLogin(email);
      if (!exists) {
        // Anti enum : fake success comme avant.
        setMagicSentTo(email);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl, shouldCreateUser: true },
      });
      if (error && error.status && error.status >= 500) {
        setErrors({ email: [`Erreur serveur (${error.status}). Réessayez dans un instant.`] });
        return;
      }
      setMagicSentTo(email);
    });
  }

  if (magicSentTo) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" /> Email envoyé
          </CardTitle>
          <CardDescription>
            Si un compte existe pour <strong>{magicSentTo}</strong>, un lien de connexion vient de
            partir. Cliquez sur le bouton dans l’email pour vous connecter (le lien expire dans 15
            minutes).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setMagicSentTo(null)}
          >
            Utiliser une autre adresse
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Se connecter</CardTitle>
        <CardDescription>Saisissez votre email et votre mot de passe Capiwise.</CardDescription>
      </CardHeader>
      <CardContent>
        {authErrorMessage ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
            data-testid="login-auth-error"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{authErrorMessage}</p>
          </div>
        ) : null}

        <form action={onSubmitPassword} className="space-y-4" data-testid="login-form">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="vous@entreprise.fr"
              aria-invalid={!!errors.email}
            />
            {errors.email?.[0] ? (
              <p className="text-destructive text-xs">{errors.email[0]}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <Link
                href="/forgot-password"
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
              aria-invalid={!!errors.password}
            />
            {errors.password?.[0] ? (
              <p className="text-destructive text-xs">{errors.password[0]}</p>
            ) : null}
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            <Lock className="mr-2 size-4" />
            {pending ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        {/* Magic link fallback */}
        <div className="text-muted-foreground border-border/60 mt-6 border-t pt-4 text-center text-xs">
          Pas de mot de passe ?{' '}
          <button
            type="button"
            onClick={onRequestMagicLink}
            disabled={pending}
            className="hover:text-foreground underline disabled:opacity-50"
          >
            Recevoir un lien magique
          </button>
        </div>

        <p className="text-muted-foreground mt-3 text-center text-xs">
          Pas encore de compte ?{' '}
          <Link href="/signup" className="hover:text-foreground underline">
            Créer un compte
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
