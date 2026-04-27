'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMagicLink } from '@/server/actions/auth';

/**
 * Magic-link login form (Module 2 §1.1, §5.2).
 *
 * UX :
 *  1. L'utilisateur saisit son email, soumet
 *  2. Server Action `sendMagicLink` répond toujours `success` (no email enumeration)
 *  3. On affiche un état "Email envoyé" — l'utilisateur consulte sa boîte
 *  4. Le lien magique le redirige vers `/auth/callback?next=...` puis dashboard
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
    const redirectTo = params.get('redirectTo') ?? undefined;

    startTransition(async () => {
      const result = await sendMagicLink({ email, redirectTo });
      if (!result.success) {
        toast.error(result.error);
        setErrors({ email: [result.error] });
        return;
      }
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
          Pas encore de compte ? L’inscription se fait uniquement par invitation. Demandez à votre
          OWNER ou administrateur RH.
        </p>
      </CardContent>
    </Card>
  );
}
