'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cancelMyExerciseRequest } from '@/server/actions/exercises';

/**
 * Module 9 B3 — Dialog (collapse simple V1, pas de Modal) pour annuler
 * sa propre demande d'exercice. Affiché uniquement si status PENDING.
 */
export function CancelExerciseDialog({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelMyExerciseRequest({ requestId, reason });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="cancel-button">
        Annuler ma demande
      </Button>
    );
  }

  return (
    <div className="border-paper-300 bg-paper-50 space-y-4 rounded-lg border p-4">
      <p className="text-ink-900 text-sm font-medium">Confirmation d'annulation</p>
      <p className="text-ink-500 text-xs">
        Renseignez la raison de l'annulation (visible par l'admin).
      </p>
      <div className="space-y-2">
        <Label htmlFor="cancel-reason">Motif</Label>
        <Input
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={500}
          data-testid="cancel-reason-input"
        />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
          Retour
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || reason.trim().length < 3}
          data-testid="cancel-confirm-button"
        >
          {isPending ? 'Annulation…' : "Confirmer l'annulation"}
        </Button>
      </div>
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
          {error}
        </div>
      )}
    </div>
  );
}
