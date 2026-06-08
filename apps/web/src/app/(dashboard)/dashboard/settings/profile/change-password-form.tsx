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
 * 3 champs : current_password (vérifié via signInWithPassword côté server),
 * new_password (min 8), confirm_new. Submit → changeMyPassword Server Action.
 */
export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next.length < 8) {
      setError('Le nouveau mot de passe doit faire au moins 8 caractères');
      return;
    }
    if (next !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas');
      return;
    }

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
      setCurrent('');
      setNext('');
      setConfirm('');
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
          type={showAll ? 'text' : 'password'}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-new">Nouveau mot de passe (8 caractères min)</Label>
        <Input
          id="cp-new"
          type={showAll ? 'text' : 'password'}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
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
          type={showAll ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
        />
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <Button type="submit" disabled={pending || !current || !next || !confirm}>
        <Lock className="mr-2 size-4" />
        {pending ? 'Mise à jour…' : 'Changer mon mot de passe'}
      </Button>
    </form>
  );
}
