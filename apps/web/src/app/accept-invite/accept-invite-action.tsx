'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { acceptInvitation } from '@/server/actions/invitations';

/**
 * Accept invite flow V2 (Phase 2 password) :
 *
 *   1. User voit la card invitation + form "Choisir mon mot de passe"
 *   2. Submit → acceptInvitation({ token, password })
 *      → server crée user (avec password) + profile + membership + active_org
 *   3. Si passwordSet=true (= password fourni) :
 *      Browser fait signInWithPassword({email, password}) → session établie
 *      → window.location.href = next (/portal ou /dashboard)
 *   4. Si passwordSet=false (legacy fallback) :
 *      Browser suit le redirectUrl (magic link OTP via /auth/callback)
 *
 * Le password est obligatoire V2 (UX cible). Magic link auto-login reste
 * comme fallback en cas d'erreur signInWithPassword post-acceptation.
 */
export function AcceptInviteAction({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères';
    if (password !== confirmPassword) return 'Les deux mots de passe ne correspondent pas';
    return null;
  }

  function onAccept() {
    setError(null);
    const vErr = validate();
    if (vErr) {
      setError(vErr);
      return;
    }

    startTransition(async () => {
      const result = await acceptInvitation({ token, password });
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      // Tente d'établir la session via password (Phase 2 V2)
      if (result.passwordSet) {
        const supabase = createSupabaseBrowserClient();
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: result.email,
          password,
        });
        if (!signInErr) {
          toast.success('Bienvenue sur Capiwise !');
          window.location.href = result.next;
          return;
        }
        // signInWithPassword fail → fallback magic link
        console.warn('[accept-invite] signInWithPassword failed, fallback magic link', signInErr);
      }

      // Fallback : suit le magic link auto-login (legacy / si signInWithPassword fail)
      window.location.href = result.redirectUrl;
    });
  }

  return (
    <div className="space-y-3">
      <div className="border-primary/20 bg-primary/5 flex items-start gap-2 rounded-md border p-3 text-xs">
        <Lock className="text-primary mt-0.5 size-4 shrink-0" />
        <p>
          Choisissez un mot de passe pour activer votre compte. Vous l’utiliserez ensuite pour vous
          connecter.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-password">Mot de passe (8 caractères minimum)</Label>
        <div className="relative">
          <Input
            id="invite-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            maxLength={128}
            disabled={pending}
            aria-invalid={!!error}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((s) => !s)}
            className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
            aria-label={showPassword ? 'Cacher le mot de passe' : 'Afficher le mot de passe'}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-password-confirm">Confirmation</Label>
        <Input
          id="invite-password-confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          minLength={8}
          maxLength={128}
          disabled={pending}
          aria-invalid={!!error}
        />
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <Button
        type="button"
        className="w-full"
        disabled={pending || !password || !confirmPassword}
        onClick={onAccept}
      >
        {pending ? (
          'Activation de votre compte…'
        ) : (
          <>
            <CheckCircle2 className="mr-2 size-4" />
            Accepter et créer mon compte
          </>
        )}
      </Button>
    </div>
  );
}
