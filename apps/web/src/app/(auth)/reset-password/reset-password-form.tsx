'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirmPasswordReset } from '@/server/actions/auth';

/**
 * /reset-password — étape 2 du flow forgot password.
 * Pré-requis : session "recovery" établie par /auth/callback (vérifié dans
 * la page Server Component parent).
 *
 * Uncontrolled (FormData) pour rester compatible avec les password managers
 * (1Password, Chrome, etc.) qui autofill sans déclencher `onChange` React.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirmPassword = String(formData.get('confirm') ?? '');

    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas');
      return;
    }

    startTransition(async () => {
      const res = await confirmPasswordReset({ password });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      toast.success('Mot de passe mis à jour');
      setTimeout(() => router.replace('/login'), 1500);
    });
  }

  if (success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="size-5" /> Mot de passe mis à jour
          </CardTitle>
          <CardDescription>
            Votre mot de passe a été modifié. Redirection vers la connexion…
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Nouveau mot de passe</CardTitle>
        <CardDescription>
          Choisissez un nouveau mot de passe pour votre compte Capiwise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Nouveau mot de passe (8 caractères min)</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                placeholder="••••••••"
                disabled={pending}
                aria-invalid={!!error}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((s) => !s)}
                className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
                aria-label={showPassword ? 'Cacher' : 'Afficher'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmation</Label>
            <Input
              id="confirm"
              name="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              placeholder="••••••••"
              disabled={pending}
            />
          </div>

          {error ? <p className="text-destructive text-xs">{error}</p> : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Mise à jour…' : 'Définir mon mot de passe'}
          </Button>

          <p className="text-muted-foreground text-center text-xs">
            <Link href="/login" className="hover:text-foreground underline">
              Retour à la connexion
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
