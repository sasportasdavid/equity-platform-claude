'use client';

/**
 * Module 10 B6 — Bouton + Dialog pour créer un snapshot manuel.
 *
 * Champs : asof_date, label, is_immutable. snapshot_type fixé à
 * MANUAL_FREEZE côté Server Action.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2 } from 'lucide-react';
import { createManualSnapshot } from '@/server/actions/cap-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CreateSnapshotButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [asofDate, setAsofDate] = useState(today);
  const [label, setLabel] = useState('');
  const [isImmutable, setIsImmutable] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createManualSnapshot({
        asofDate,
        label: label || undefined,
        isImmutable,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setLabel('');
      setIsImmutable(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Camera className="mr-1 size-4" />
            Créer un snapshot
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau snapshot manuel</DialogTitle>
          <DialogDescription>
            Fige l&apos;état de la cap table à une date précise. Type{' '}
            <span className="font-mono text-xs">MANUAL_FREEZE</span>. Une fois marqué immutable, il
            ne peut plus être supprimé.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="asofDate">Date du snapshot *</Label>
            <Input
              id="asofDate"
              type="date"
              value={asofDate}
              onChange={(e) => setAsofDate(e.target.value)}
              required
              max={today}
            />
            <p className="text-muted-foreground text-xs">
              Cap table calculée à cette date (positions et prix). Ne peut pas être future.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : Avant Series B, Audit 2026"
              maxLength={200}
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              id="isImmutable"
              type="checkbox"
              checked={isImmutable}
              onChange={(e) => setIsImmutable(e.target.checked)}
              className="mt-1 size-4"
            />
            <div>
              <Label htmlFor="isImmutable" className="font-normal">
                Marquer immutable (PRE_AUDIT)
              </Label>
              <p className="text-muted-foreground text-xs">
                Si coché, le snapshot ne pourra plus être supprimé même par un OWNER.
              </p>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending || !asofDate}>
              {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
