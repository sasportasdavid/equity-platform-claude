'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  approveExerciseDecision,
  rejectExerciseDecision,
  confirmExercisePayment,
  adminCancelExercise,
} from '@/server/actions/exercises-admin';

/**
 * Module 9 B4 — 4 dialogs admin pour traiter les exercise_requests.
 *
 * Chaque dialog est une "collapse inline" simple (pas de Modal Base UI
 * pour rester cohérent avec le pattern V1 du portail). L'admin clique
 * sur le bouton CTA → la zone collapse s'ouvre avec le formulaire.
 */

function ActionShell({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="border-paper-300 bg-paper-50 space-y-4 rounded-lg border p-4">
      <header className="flex items-baseline justify-between gap-3">
        <p className="text-ink-900 text-sm font-medium">{title}</p>
        <button type="button" onClick={onClose} className="text-ink-500 hover:text-ink-900 text-xs">
          ✕ Fermer
        </button>
      </header>
      {children}
    </div>
  );
}

/** Approve dialog : comment optionnel. */
export function AdminApproveButton({ exerciseRequestId }: { exerciseRequestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await approveExerciseDecision({ exerciseRequestId, comment });
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
      <Button onClick={() => setOpen(true)} data-testid="admin-approve-button">
        Approuver
      </Button>
    );
  }

  return (
    <ActionShell open={open} onClose={() => setOpen(false)} title="Approuver la demande">
      <div className="space-y-2">
        <Label htmlFor="approve-comment">Commentaire (optionnel)</Label>
        <textarea
          id="approve-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          className="border-paper-300 bg-paper-50 text-ink-900 focus:border-brass-500 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
          Retour
        </Button>
        <Button onClick={submit} disabled={isPending} data-testid="admin-approve-confirm">
          {isPending ? 'Approbation…' : "Confirmer l'approbation"}
        </Button>
      </div>
      {error && (
        <p className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
          {error}
        </p>
      )}
    </ActionShell>
  );
}

/** Reject dialog : comment requis ≥ 10 chars. */
export function AdminRejectButton({ exerciseRequestId }: { exerciseRequestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await rejectExerciseDecision({ exerciseRequestId, comment });
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
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="admin-reject-button"
        className="border-rose-300 text-rose-700 hover:bg-rose-50"
      >
        Rejeter
      </Button>
    );
  }

  return (
    <ActionShell open={open} onClose={() => setOpen(false)} title="Rejeter la demande">
      <div className="space-y-2">
        <Label htmlFor="reject-comment">
          Motif du rejet <span className="text-rose-700">(requis, ≥ 10 caractères)</span>
        </Label>
        <textarea
          id="reject-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          minLength={10}
          maxLength={2000}
          required
          className="border-paper-300 bg-paper-50 text-ink-900 w-full rounded-md border px-3 py-2 text-sm focus:border-rose-500"
        />
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
          Retour
        </Button>
        <Button
          onClick={submit}
          disabled={isPending || comment.trim().length < 10}
          data-testid="admin-reject-confirm"
        >
          {isPending ? 'Rejet…' : 'Confirmer le rejet'}
        </Button>
      </div>
      {error && (
        <p className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
          {error}
        </p>
      )}
    </ActionShell>
  );
}

/** Confirm payment dialog : amount + reference + admin notes. */
export function AdminConfirmPaymentButton({
  exerciseRequestId,
  expectedAmount,
}: {
  exerciseRequestId: string;
  expectedAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(expectedAmount);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await confirmExercisePayment({
        exerciseRequestId,
        paymentAmountReceived: amount,
        paymentReference: reference,
        adminNotes: notes || undefined,
      });
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
      <Button onClick={() => setOpen(true)} data-testid="admin-confirm-payment-button">
        Confirmer la réception du paiement
      </Button>
    );
  }

  return (
    <ActionShell open={open} onClose={() => setOpen(false)} title="Confirmer le paiement reçu">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="payment-amount">Montant reçu (€)</Label>
          <Input
            id="payment-amount"
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-ref">Référence virement / chèque</Label>
          <Input
            id="payment-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
            maxLength={200}
            data-testid="admin-payment-ref"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-notes">Notes admin (optionnel)</Label>
        <textarea
          id="payment-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className="border-paper-300 bg-paper-50 text-ink-900 focus:border-brass-500 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
          Retour
        </Button>
        <Button
          onClick={submit}
          disabled={isPending || reference.trim().length === 0}
          data-testid="admin-confirm-payment-confirm"
        >
          {isPending ? 'Confirmation…' : 'Confirmer le paiement'}
        </Button>
      </div>
      {error && (
        <p className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
          {error}
        </p>
      )}
    </ActionShell>
  );
}

/** Admin cancel dialog : reason requis. */
export function AdminCancelButton({ exerciseRequestId }: { exerciseRequestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await adminCancelExercise({ exerciseRequestId, reason });
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
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="admin-cancel-button">
        Annuler la demande (admin)
      </Button>
    );
  }

  return (
    <ActionShell open={open} onClose={() => setOpen(false)} title="Annuler la demande (admin)">
      <div className="space-y-2">
        <Label htmlFor="cancel-reason">Motif de l'annulation (requis)</Label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          minLength={3}
          maxLength={500}
          required
          data-testid="admin-cancel-reason"
          className="border-paper-300 bg-paper-50 text-ink-900 focus:border-brass-500 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
          Retour
        </Button>
        <Button
          onClick={submit}
          disabled={isPending || reason.trim().length < 3}
          data-testid="admin-cancel-confirm"
        >
          {isPending ? 'Annulation…' : "Confirmer l'annulation"}
        </Button>
      </div>
      {error && (
        <p className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
          {error}
        </p>
      )}
    </ActionShell>
  );
}
