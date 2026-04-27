'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { acceptInvitation } from '@/server/actions/invitations';

export function AcceptInviteAction({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    startTransition(async () => {
      const result = await acceptInvitation({ token });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Le serveur a généré un magic link auto-login : on saute directement
      // dessus. Le callback Supabase + le custom_access_token_hook
      // s'occuperont d'établir la session avec le bon active_org_id.
      window.location.href = result.redirectUrl;
    });
  }

  return (
    <Button type="button" className="w-full" disabled={pending} onClick={onClick}>
      {pending ? 'Activation de votre compte…' : 'Accepter et accéder à mon espace'}
    </Button>
  );
}
