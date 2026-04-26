'use client';

import { useTransition, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signInAction } from './actions';

export function LoginForm() {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setErrors({});
    const redirectTo = params.get('redirectTo') ?? '/dashboard';
    formData.set('redirectTo', redirectTo);

    startTransition(async () => {
      const result = await signInAction(formData);
      if (result && !result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
      }
      // success: server action redirects, client never reaches here
    });
  }

  const signupSuccess = params.get('signup') === 'success';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Se connecter</CardTitle>
        <CardDescription>Accédez à votre espace Capiwise.</CardDescription>
      </CardHeader>
      <CardContent>
        {signupSuccess && (
          <div
            role="status"
            className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200"
          >
            Compte créé. Vérifiez votre email pour confirmer, puis connectez-vous.
          </div>
        )}
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
            {errors.email?.[0] && <p className="text-destructive text-xs">{errors.email[0]}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={!!errors.password}
            />
            {errors.password?.[0] && (
              <p className="text-destructive text-xs">{errors.password[0]}</p>
            )}
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Pas encore de compte ?{' '}
          <Link href="/signup" className="text-primary font-medium hover:underline">
            Créer un compte
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
