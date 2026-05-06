'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signupWithMagicLink } from '@/server/actions/auth';

/**
 * Module 14 PR #43 §B1 — Signup public via magic-link (Option C).
 * Bug #1 fix sprint 6 mai 2026 PM : envoi serverside via Resend.
 *
 * Flow :
 *   1. User remplit email + checkbox ToS, soumet.
 *   2. Server Action `signupWithMagicLink` :
 *      - valide Zod + rate limit + anti enumeration (fake success si compte
 *        existant ACTIVE)
 *      - crée auth.users + user_profile + persiste ToS pour les nouveaux
 *      - génère un magic link via admin.generateLink + envoie via Resend
 *      - retourne `{ ok: true, isNewUser: bool }` ou `{ ok: false, error }`
 *   3. Affichage "Email envoyé" SEULEMENT si Server Action ok=true. Si
 *      ok=false, on affiche l'erreur explicite (avant Bug #1 fix, le client
 *      faisait un `signInWithOtp` dont le résultat était IGNORÉ → l'UI
 *      mentait quand le mail ne partait pas).
 *
 * **Pas de password** (spec MODULE_02 §1.1, magic-link only V1).
 * **Pas de full_name au signup** : capturé à l'étape 1 du wizard
 * onboarding (B2).
 *
 * UX éditorial DS V1 : `Card` shadcn avec lead Fraunces italic via
 * `font-serif italic` (cf. tokens DS V1).
 */
export function SignupForm({ tosVersion }: { tosVersion: string }) {
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setErrors({});
    setGlobalError(null);
    const email = String(formData.get('email') ?? '').trim();
    const tosAccepted = formData.get('tos_accepted') === 'on';

    if (!email || !email.includes('@')) {
      setErrors({ email: ['Adresse email invalide'] });
      return;
    }
    if (!tosAccepted) {
      setErrors({
        tosAccepted: ['Vous devez accepter les conditions d’utilisation pour continuer.'],
      });
      return;
    }

    startTransition(async () => {
      const result = await signupWithMagicLink({
        email,
        tosAccepted: true,
        tosVersion,
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        setGlobalError(result.error);
        return;
      }

      // Bug #1 fix : la Server Action a envoyé le magic link via Resend.
      // Si on arrive ici, le mail est parti (ou la Server Action aurait
      // retourné ok=false). On affiche le success.
      setSentTo(email);
    });
  }

  if (sentTo) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" /> Email envoyé
          </CardTitle>
          <CardDescription>
            Si vous n’aviez pas encore de compte sur Capiwise, nous venons de le créer. Cliquez sur
            le lien dans l’email envoyé à <strong>{sentTo}</strong> pour confirmer votre email et
            finaliser votre inscription. Le lien expire dans 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setSentTo(null);
              setErrors({});
              setGlobalError(null);
            }}
          >
            Utiliser une autre adresse
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Vous avez déjà un compte ?{' '}
            <Link href="/login" className="hover:text-foreground underline">
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Créer votre compte</CardTitle>
        <CardDescription>
          Rejoignez Capiwise — la plateforme française d’actionnariat salarié. Pas de mot de passe à
          retenir : nous vous envoyons un lien sécurisé par email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {globalError ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive mb-4 rounded-md border px-3 py-2 text-xs"
            data-testid="signup-global-error"
          >
            {globalError}
          </div>
        ) : null}
        <form action={onSubmit} className="space-y-4" data-testid="signup-form">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email professionnel</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="vous@entreprise.fr"
              aria-invalid={!!errors.email}
              data-testid="signup-email"
            />
            {errors.email?.[0] ? (
              <p className="text-destructive text-xs">{errors.email[0]}</p>
            ) : null}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="tos_accepted"
              name="tos_accepted"
              required
              aria-invalid={!!errors.tosAccepted}
              data-testid="signup-tos"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor="tos_accepted"
                className="text-muted-foreground text-xs font-normal leading-relaxed"
              >
                J’accepte les{' '}
                <Link
                  href="/legal/terms"
                  className="hover:text-foreground underline"
                  target="_blank"
                >
                  Conditions d’utilisation
                </Link>{' '}
                et la{' '}
                <Link
                  href="/legal/privacy"
                  className="hover:text-foreground underline"
                  target="_blank"
                >
                  Politique de confidentialité
                </Link>
                .
              </Label>
              {errors.tosAccepted?.[0] ? (
                <p className="text-destructive text-xs">{errors.tosAccepted[0]}</p>
              ) : null}
            </div>
          </div>

          <Button type="submit" disabled={pending} className="w-full" data-testid="signup-submit">
            {pending ? 'Création du compte…' : 'Créer mon compte'}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          Déjà inscrit ?{' '}
          <Link href="/login" className="hover:text-foreground underline">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
