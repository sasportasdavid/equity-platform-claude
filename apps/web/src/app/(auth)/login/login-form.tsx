'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { checkEmailExistsForLogin } from '@/server/actions/auth';

/**
 * Magic-link login form — flow PKCE côté CLIENT (Module 2 §1.1, §5.2).
 *
 * **Architecture (refacto Option B)** :
 *  - L'envoi du magic link est fait DIRECTEMENT par le browser via
 *    `supabase.auth.signInWithOtp(...)` — au lieu de passer par une
 *    Server Action `sendMagicLink` qui utilisait `admin.generateLink`.
 *  - Avec `flowType: 'pkce'` configuré sur `createSupabaseBrowserClient`,
 *    Supabase pose un PKCE verifier en cookie au moment du submit. Le
 *    pre-fetching Gmail / Apple Mail ne peut donc plus consommer le
 *    code car il manque ce verifier côté serveur de mail.
 *  - **`shouldCreateUser: false`** : pas de signup public — si l'email
 *    n'existe pas, Supabase ne crée PAS de compte (l'inscription se
 *    fait uniquement par invitation admin).
 *
 * **Trade-off accepté** : on perd le custom template Resend
 * (template_magic_link_login). Supabase envoie son propre template
 * configuré dans Dashboard > Authentication > Email Templates. Le
 * template par défaut Supabase reste correct pour MVP. La Server Action
 * `sendMagicLink` reste utilisée pour les invitations admin (template
 * Resend custom préservé pour ce cas).
 *
 * **Anti email enumeration** : on affiche toujours "Email envoyé" peu
 * importe le retour de Supabase (sauf network error pure). Si l'email
 * n'existe pas, Supabase répond silencieusement (avec `shouldCreateUser:
 * false`) — pas de leak.
 *
 * Le `redirectTo` est lu dans `?redirectTo=/some/path` (proxy.ts l'ajoute
 * automatiquement quand un user anon hit une route privée).
 */
/**
 * Mappe les codes d'erreur Supabase vers un message FR user-friendly.
 * Les erreurs viennent soit de la query string (ex : `?error=missing_code`),
 * soit du fragment URL (`#error=access_denied&error_code=otp_expired`)
 * que Supabase pose sur certaines erreurs auth — ce dernier est lu
 * côté client via `window.location.hash` au mount.
 */
function getAuthErrorMessage(
  queryError: string | null,
  fragmentErrorCode: string | null,
  fragmentDescription: string | null,
): string | null {
  if (fragmentErrorCode === 'otp_expired') {
    return (
      'Le lien de connexion a expiré ou a déjà été utilisé. ' +
      'Cause fréquente : votre client mail (Gmail, Apple Mail) pré-charge ' +
      'les liens pour les analyser, ce qui consomme le code à usage unique. ' +
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
    default:
      return null;
  }
}

export function LoginForm() {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  // Erreurs Supabase posées dans le fragment `#error=...&error_code=...`
  // — invisibles côté server. On utilise le pattern derived state (set
  // pendant le render, gardé par un flag `hasReadFragment`) plutôt
  // qu'un `useEffect` interdit par la règle Next 16
  // `react-hooks/set-state-in-effect`.
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
  const authErrorMessage = getAuthErrorMessage(
    queryError,
    fragmentError.errorCode,
    fragmentError.description,
  );

  function onSubmit(formData: FormData) {
    setErrors({});
    const email = String(formData.get('email') ?? '').trim();
    if (!email || !email.includes('@')) {
      setErrors({ email: ['Adresse email invalide'] });
      return;
    }
    const redirectToQuery = params.get('redirectTo');
    const redirectTo = redirectToQuery?.startsWith('/') ? redirectToQuery : '/dashboard';
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      redirectTo,
    )}`;

    startTransition(async () => {
      // Pre-check d'existence côté server (Server Action) — nécessaire
      // pour bloquer le signup public sans tomber sur le 422
      // `otp_disabled` que Supabase renvoie quand on combine
      // `shouldCreateUser: false` + Signups disabled côté Dashboard.
      const exists = await checkEmailExistsForLogin(email);
      if (!exists) {
        // Anti email enumeration : on simule le succès même si l'email
        // n'existe pas. Le seul side-effect distinguable serait la
        // latence — qu'on pourrait aussi smoother ici via setTimeout.
        setSentTo(email);
        return;
      }

      // L'email existe → on peut appeler signInWithOtp en sécurité avec
      // `shouldCreateUser: true` (Supabase ne créera rien car le user
      // existe déjà). Le PKCE verifier est posé en cookie au moment de
      // cet appel, anti pre-fetching Gmail/Apple Mail.
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: true,
        },
      });
      if (error && error.status && error.status >= 500) {
        setErrors({ email: [`Erreur serveur (${error.status}). Réessayez dans un instant.`] });
        return;
      }
      // 4xx Supabase (rate limit, etc.) → fake success malgré tout
      setSentTo(email);
    });
  }

  if (sentTo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" /> Email envoyé
          </CardTitle>
          <CardDescription>
            Si un compte existe pour <strong>{sentTo}</strong>, un lien de connexion vient de
            partir. Cliquez sur le bouton dans l’email pour vous connecter (le lien expire dans 15
            minutes).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setSentTo(null)}
          >
            Utiliser une autre adresse
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Se connecter</CardTitle>
        <CardDescription>
          Saisissez votre adresse email professionnelle. Nous vous enverrons un lien de connexion
          sécurisé — pas de mot de passe à retenir.
        </CardDescription>
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
        <form action={onSubmit} className="space-y-4" data-testid="login-form">
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
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Envoi du lien…' : 'Recevoir un lien de connexion'}
          </Button>
        </form>
        <p className="text-muted-foreground mt-6 text-center text-xs">
          Pas encore de compte ?{' '}
          <Link href="/signup" className="hover:text-foreground underline">
            Créer un compte
          </Link>
          . Inscription gratuite par email — pas de mot de passe.
        </p>
      </CardContent>
    </Card>
  );
}
