'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
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
export function LoginForm() {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

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
