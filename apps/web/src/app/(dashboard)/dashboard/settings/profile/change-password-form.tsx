'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeMyPassword } from '@/server/actions/auth';

/**
 * Phase 4 — Form "Changer mon mot de passe" dans /dashboard/settings/profile.
 *
 * Uncontrolled (FormData) pour rester compatible avec les password managers
 * qui autofill sans fire onChange React.
 */
export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const current = String(formData.get('current') ?? '');
    const next = String(formData.get('next') ?? '');
    const confirm = String(formData.get('confirm') ?? '');

    if (next.length < 8) {
      setError('Le nouveau mot de passe doit faire au moins 8 caractères');
      return;
    }
    if (next !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas');
      return;
    }

    const form = e.currentTarget;
    startTransition(async () => {
      const res = await changeMyPassword({
        currentPassword: current,
        newPassword: next,
        confirmNewPassword: confirm,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success('Mot de passe mis à jour');
      form.reset();
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          aria-label={showAll ? 'Cacher les mots de passe' : 'Afficher les mots de passe'}
        >
          {showAll ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          {showAll ? 'Cacher' : 'Afficher'}
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-current">Mot de passe actuel</Label>
        <Input
          id="cp-current"
          name="current"
          type={showAll ? 'text' : 'password'}
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-new">Nouveau mot de passe (8 caractères min)</Label>
        <Input
          id="cp-new"
          name="next"
          type={showAll ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
          aria-invalid={!!error}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm">Confirmation</Label>
        <Input
          id="cp-confirm"
          name="confirm"
          type={showAll ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
        />
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <Button type="submit" disabled={pending}>
        <Lock className="mr-2 size-4" />
        {pending ? 'Mise à jour…' : 'Changer mon mot de passe'}
      </Button>
    </form>
  );
}
