'use client';

/**
 * Module 10 B6 — Actions sur un snapshot existant.
 *
 * - Freeze (set is_immutable=true) : disponible si !is_immutable
 * - Delete : disponible si !is_immutable. AlertDialog de confirmation.
 *
 * Si is_immutable=true, le composant affiche juste un badge "Frozen" et
 * les 2 boutons sont masqués (pattern: render conditionnel côté parent).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Trash2 } from 'lucide-react';
import { deleteSnapshot, freezeSnapshot } from '@/server/actions/cap-table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function SnapshotActions({
  snapshotId,
  isImmutable,
}: {
  snapshotId: string;
  isImmutable: boolean;
}) {
  const router = useRouter();
  const [pendingFreeze, startFreezeTransition] = useTransition();
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFreeze() {
    setError(null);
    startFreezeTransition(async () => {
      const result = await freezeSnapshot(snapshotId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteSnapshot(snapshotId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/dashboard/captable/snapshots');
    });
  }

  if (isImmutable) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <Alert variant="destructive" className="py-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button variant="outline" onClick={handleFreeze} disabled={pendingFreeze || pendingDelete}>
        {pendingFreeze ? (
          <Loader2 className="mr-1 size-4 animate-spin" />
        ) : (
          <Lock className="mr-1 size-4" />
        )}
        Freeze (PRE_AUDIT)
      </Button>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" disabled={pendingFreeze || pendingDelete}>
              {pendingDelete ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 size-4" />
              )}
              Supprimer
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce snapshot ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le snapshot ne sera plus consultable. Si vous avez
              besoin d&apos;archive immutable pour audit, utilisez plutôt &laquo; Freeze &raquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer définitivement</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
