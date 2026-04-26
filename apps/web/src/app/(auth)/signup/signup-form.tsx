'use client';

import { useTransition, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUpAction } from '../login/actions';

export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setErrors({});
    startTransition(async () => {
      const result = await signUpAction(formData);
      if (result && !result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un compte</CardTitle>
        <CardDescription>Rejoignez Capiwise pour gérer vos plans.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4" data-testid="signup-form">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              aria-invalid={!!errors.fullName}
            />
            {errors.fullName?.[0] && (
              <p className="text-destructive text-xs">{errors.fullName[0]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
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
              autoComplete="new-password"
              required
              aria-invalid={!!errors.password}
            />
            {errors.password?.[0] && (
              <p className="text-destructive text-xs">{errors.password[0]}</p>
            )}
            <p className="text-muted-foreground text-xs">
              Au moins 12 caractères, avec majuscule, chiffre et caractère spécial.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword?.[0] && (
              <p className="text-destructive text-xs">{errors.confirmPassword[0]}</p>
            )}
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Création…' : 'Créer mon compte'}
          </Button>
        </form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Déjà inscrit ?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
