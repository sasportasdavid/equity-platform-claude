'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '@/server/actions/auth';

/**
 * /forgot-password — Phase 3 étape 1.
 *
 * Form simple : saisir email → POST requestPasswordReset → email envoyé via
 * Resend (template `password_reset`) avec lien `/auth/callback?token_hash=...
 * &type=recovery&next=/reset-password`.
 *
 * Anti email enumeration : on affiche toujours "Email envoyé" peu importe
 * si l'email existe en DB (cf. Server Action requestPasswordReset).
 */
export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const email = String(formData.get('email') ?? '').trim();
    if (!email || !email.includes('@')) {
      setError('Adresse email invalide');
      return;
    }

    startTransition(async () => {
      const res = await requestPasswordReset({ email });
      if (res.ok) {
        setSentTo(email);
      } else {
        setError('Erreur serveur. Réessayez dans un instant.');
      }
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
            Si un compte existe pour <strong>{sentTo}</strong>, un lien de réinitialisation vient de
            partir. Cliquez sur le bouton dans l’email pour choisir un nouveau mot de passe. Le lien
            expire dans 60 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground block text-center text-xs underline"
          >
            Retour à la connexion
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
        <CardDescription>
          Saisissez votre email Capiwise. Nous vous enverrons un lien pour choisir un nouveau mot de
          passe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="vous@entreprise.fr"
              aria-invalid={!!error}
            />
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Envoi…' : 'Recevoir un lien de réinitialisation'}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          <Link href="/login" className="hover:text-foreground underline">
            Retour à la connexion
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
