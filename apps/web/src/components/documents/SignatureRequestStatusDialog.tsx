'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Eye, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { cancelSignatureRequest } from '@/server/actions/documents';
import type { AwardDocumentSignatureRequest } from '@/server/queries/documents';

const SIGNER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700 border-border dark:text-slate-300',
  SENT: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900',
  VIEWED:
    'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:border-indigo-900',
  SIGNED:
    'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900',
  DECLINED: 'bg-destructive/10 text-destructive border-destructive/30',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Module 6 B4 — Modale read-only détail signature request + cancel.
 *
 * Sections :
 *  1. Header : status global sig_request + sent/completed timestamps + expiry
 *  2. Tableau signers (full_name, email, role, status, viewed/signed timestamps)
 *  3. Bouton "Annuler signature" (admin only via canCancel) → confirm en
 *     ligne avec textarea reason min 10 chars
 *
 * `canCancel` doit être passé par le parent (qui a le hasPermission check).
 */
export function SignatureRequestStatusDialog({
  open,
  onOpenChange,
  documentNumber,
  request,
  canCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentNumber: string | null;
  request: AwardDocumentSignatureRequest;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isFinal = request.status === 'COMPLETED' || request.status === 'CANCELLED';
  const cancelTooShort = cancelReason.trim().length < 10;

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelSignatureRequest({
        requestId: request.id,
        reason: cancelReason.trim(),
      });
      if (res.ok) {
        toast.success('Signature request annulée');
        onOpenChange(false);
        setShowCancelForm(false);
        setCancelReason('');
        router.refresh();
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Statut signature — {documentNumber ?? '—'}</DialogTitle>
          <DialogDescription>
            Envoi Yousign
            {request.yousign_procedure_id ? ` (${request.yousign_procedure_id.slice(0, 12)}…)` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status global + timestamps */}
          <section className="grid gap-3 rounded-md border p-3 sm:grid-cols-3 sm:gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Statut</Label>
              <div className="mt-0.5">
                <Badge variant="outline" className="font-mono text-[11px]">
                  {request.status}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Envoyé le</Label>
              <p className="mt-0.5 text-sm">{formatDateTime(request.sent_at)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">
                {request.completed_at ? 'Terminé le' : 'Expire le'}
              </Label>
              <p className="mt-0.5 text-sm">
                {formatDateTime(request.completed_at ?? request.expiry_date)}
              </p>
            </div>
          </section>

          {/* Tableau signers */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Signataires ({request.signers.length})</h3>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Nom · Email</th>
                    <th className="px-2 py-1.5 text-left">Rôle</th>
                    <th className="px-2 py-1.5 text-left">Statut</th>
                    <th className="px-2 py-1.5 text-left">Vu</th>
                    <th className="px-2 py-1.5 text-left">Signé</th>
                  </tr>
                </thead>
                <tbody>
                  {request.signers.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-2 py-1.5 font-mono">{s.signing_order}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{s.full_name}</div>
                        <div className="text-muted-foreground text-xs">{s.email}</div>
                      </td>
                      <td className="px-2 py-1.5 text-xs">{s.role_in_signature}</td>
                      <td className="px-2 py-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${SIGNER_STATUS_COLORS[s.status] ?? ''}`}
                        >
                          {s.status === 'SIGNED' ? (
                            <Check className="mr-1 inline size-3" />
                          ) : s.status === 'VIEWED' ? (
                            <Eye className="mr-1 inline size-3" />
                          ) : s.status === 'DECLINED' ? (
                            <X className="mr-1 inline size-3" />
                          ) : null}
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-xs">{formatDateTime(s.viewed_at)}</td>
                      <td className="px-2 py-1.5 text-xs">{formatDateTime(s.signed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Cancel form (collapsible) */}
          {showCancelForm ? (
            <section className="border-destructive/30 bg-destructive/5 space-y-2 rounded-md border p-3">
              <Label htmlFor="cancel-reason" className="text-xs">
                Raison de l&apos;annulation (min 10 caractères)
              </Label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
                placeholder="Erreur dans le document, mauvais signataire, etc."
              />
              <p className="text-muted-foreground text-xs">
                {cancelReason.trim().length}/10 caractères minimum
              </p>
              {error ? <div className="text-destructive text-xs">{error}</div> : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCancelForm(false);
                    setCancelReason('');
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Retour
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  disabled={pending || cancelTooShort}
                >
                  {pending ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <X className="mr-1 size-3" />
                  )}
                  Confirmer l&apos;annulation
                </Button>
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          {canCancel && !isFinal && !showCancelForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCancelForm(true)}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <X className="mr-1.5 size-3.5" /> Annuler la signature
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
