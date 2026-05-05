'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestInvitationResendByToken } from '@/server/actions/invitations';

/**
 * Module 14 PR §B3 — bouton anonyme "Demander une nouvelle invitation"
 * affiché sur la page `/accept-invite` quand le token est invalide ou
 * expiré.
 *
 * Anti enumeration : la Server Action `requestInvitationResendByToken`
 * retourne toujours `{ ok: true }` peu importe la validité du token,
 * donc on affiche toujours le même message de confirmation. Pas de
 * gate côté UI sur la valeur retournée (cohérent côté server).
 */
export function RequestResendAction({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function onClick() {
    if (pending || sent) return;
    startTransition(async () => {
      await requestInvitationResendByToken({ token });
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div
        className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700"
        data-testid="invitation-resend-confirmed"
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <p>
          Si une invitation existait pour cette adresse, l’expéditeur original a été notifié. Il
          pourra vous renvoyer une nouvelle invitation.
        </p>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={onClick}
      disabled={pending}
      data-testid="invitation-request-resend"
    >
      {pending ? 'Envoi…' : 'Demander une nouvelle invitation'}
    </Button>
  );
}
