'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { transitionBeneficiaryLifecycle } from '@/server/actions/beneficiaries';

type LifecycleStatus = 'active' | 'on_leave' | 'terminated';

const STATUS_LABELS: Record<LifecycleStatus, string> = {
  active: 'Actif',
  on_leave: 'En congé',
  terminated: 'Sorti',
};

/**
 * Dialog de transition lifecycle bénéficiaire — Module 4 B3.
 *
 * Form avec :
 *   - Reason (textarea, min 10 chars, required)
 *   - terminationDate (date input) — visible/required uniquement si
 *     toStatus='terminated'
 *
 * Au submit : appelle transitionBeneficiaryLifecycle Server Action,
 * affiche toast success/destructive selon Result, refresh la page.
 */
export function TransitionLifecycleDialog({
  open,
  onOpenChange,
  beneficiaryId,
  beneficiaryName,
  toStatus,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beneficiaryId: string;
  beneficiaryName: string;
  toStatus: LifecycleStatus;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().slice(0, 10));

  const reasonValid = reason.trim().length >= 10;
  const dateValid = toStatus !== 'terminated' || /^\d{4}-\d{2}-\d{2}$/.test(terminationDate);
  const canSubmit = reasonValid && dateValid && !pending;

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await transitionBeneficiaryLifecycle({
        beneficiaryId,
        toStatus,
        reason: reason.trim(),
        terminationDate: toStatus === 'terminated' ? terminationDate : undefined,
      });
      if (res.ok) {
        toast.success(`${beneficiaryName} → ${STATUS_LABELS[toStatus]}`);
        setReason('');
        onOpenChange(false);
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Transition de {beneficiaryName} → {STATUS_LABELS[toStatus]}
          </DialogTitle>
          <DialogDescription>
            {toStatus === 'terminated'
              ? 'Sortie définitive (status terminal). Date et raison requises.'
              : 'Documenter la raison du changement de statut (audit log).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lifecycle-reason">
              Raison * <span className="text-muted-foreground text-xs">(min 10 caractères)</span>
            </Label>
            <Input
              id="lifecycle-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. Congé maternité du 01/06/2026 au 30/09/2026"
              data-testid="lifecycle-reason"
            />
            {reason.length > 0 && !reasonValid ? (
              <p className="text-destructive text-xs">
                {reason.trim().length} / 10 caractères minimum
              </p>
            ) : null}
          </div>

          {toStatus === 'terminated' ? (
            <div className="space-y-1.5">
              <Label htmlFor="lifecycle-date">Date de sortie *</Label>
              <Input
                id="lifecycle-date"
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                data-testid="lifecycle-date"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            variant={toStatus === 'terminated' ? 'destructive' : 'default'}
            data-testid="lifecycle-confirm"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : 'Confirmer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
