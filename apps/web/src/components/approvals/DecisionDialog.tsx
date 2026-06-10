'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { approveDecision, rejectDecision } from '@/server/actions/approvals';

/**
 * Module 5 B4 — Modale partagée Approve / Reject d'une décision.
 *
 * - Approve : comment optionnel
 * - Reject : comment min 10 chars (Zod refine côté Server Action)
 *
 * À submit : appelle approveDecision/rejectDecision, toast + refresh + close.
 */
export function DecisionDialog({
  open,
  onOpenChange,
  mode,
  decisionId,
  context,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'approve' | 'reject';
  decisionId: string;
  /** Récap affiché dans la modale (award, beneficiary, plan, units, étape). */
  context: {
    awardNumber: string | null;
    beneficiaryName: string | null;
    planName: string | null;
    unitsGranted: number | null;
    stepOrder: number;
    stepName: string | null;
    workflowTotalSteps: number;
  };
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isReject = mode === 'reject';
  const minChars = isReject ? 10 : 0;
  const tooShort = isReject && comment.trim().length < minChars;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const action = isReject
        ? rejectDecision({ decisionId, comment: comment.trim() })
        : approveDecision({ decisionId, comment: comment.trim() || undefined });
      const res = await action;
      if (res.ok) {
        toast.success(
          isReject
            ? `Décision REJECTED (${res.result.status})`
            : `Décision APPROVED (${res.result.status})`,
        );
        onOpenChange(false);
        setComment('');
        router.refresh();
        onSuccess?.();
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }

  function handleClose(open: boolean) {
    if (!open) {
      setComment('');
      setError(null);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isReject ? 'Rejeter la décision' : 'Approuver la décision'}</DialogTitle>
          <DialogDescription>Cette décision est immuable une fois enregistrée.</DialogDescription>
        </DialogHeader>

        <div className="bg-muted/30 space-y-1 rounded-md border p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Attribution</span>
            <span className="font-mono">{context.awardNumber ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bénéficiaire</span>
            <span>{context.beneficiaryName ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span>{context.planName ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Units</span>
            <span className="font-mono">
              {context.unitsGranted != null ? context.unitsGranted.toLocaleString('fr-FR') : '—'}
            </span>
          </div>
          <div className="border-t pt-1">
            <div className="flex justify-between font-medium">
              <span>
                Étape {context.stepOrder}
                {context.workflowTotalSteps ? `/${context.workflowTotalSteps}` : ''}
              </span>
              <span>{context.stepName ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="decision-comment" className="text-xs">
            Commentaire {isReject ? '*' : '(optionnel)'}
          </Label>
          <textarea
            id="decision-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              isReject
                ? 'Expliquer le motif du rejet (min 10 caractères)…'
                : "Optionnel : note pour l'historique…"
            }
            rows={4}
            maxLength={2000}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
          {isReject ? (
            <p
              className={`text-xs ${
                tooShort && comment.length > 0 ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {comment.length} / 10 minimum
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="bg-destructive/10 text-destructive rounded-md border p-2 text-xs">
            {error}
          </div>
        ) : null}

        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={pending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || (isReject && tooShort)}
            variant={isReject ? 'destructive' : 'default'}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isReject ? (
              <>
                <X className="mr-1 size-4" /> Rejeter
              </>
            ) : (
              <>
                <Check className="mr-1 size-4" /> Approuver
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
