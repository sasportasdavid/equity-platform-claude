'use client';

/**
 * Module 12 B4 — Dialog de confirmation pour reset all overrides.
 *
 * Action irréversible : supprime tous les overrides de l'org et restaure
 * la configuration par défaut. Demande confirmation explicite (pas
 * juste un confirm() natif).
 */

import { useTransition } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resetAllComplianceOverrides } from '@/server/actions/complianceRules';

export type ResetAllConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function ResetAllConfirmDialog({
  open,
  onOpenChange,
  onSuccess,
}: ResetAllConfirmDialogProps) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const res = await resetAllComplianceOverrides();
      if (!res.ok) {
        toast.error(`Erreur : ${res.error}`);
        return;
      }
      toast.success(
        res.deletedCount > 0
          ? `${res.deletedCount} personnalisation${res.deletedCount > 1 ? 's' : ''} supprimée${res.deletedCount > 1 ? 's' : ''}.`
          : 'Aucune personnalisation à supprimer.',
      );
      onOpenChange(false);
      onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="reset-all-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="size-5 text-amber-700 dark:text-amber-400"
              strokeWidth={1.75}
            />
            Réinitialiser toute la configuration ?
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            Cette action supprimera <strong>toutes les personnalisations</strong> de votre
            organisation et restaurera les seuils par défaut pour les 23 règles compliance.
            <br />
            <br />
            <span className="text-destructive font-medium">Cette action est irréversible.</span>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <DialogClose
            render={
              <Button variant="outline" disabled={isPending}>
                Annuler
              </Button>
            }
          />
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
            data-testid="reset-all-confirm"
          >
            {isPending ? 'Réinitialisation…' : 'Confirmer la réinitialisation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
