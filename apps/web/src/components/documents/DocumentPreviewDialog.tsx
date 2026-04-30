'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getDocumentPreviewUrl } from '@/server/actions/documents';

type Variant = 'ORIGINAL' | 'SIGNED' | 'PROOF';

const VARIANT_LABELS: Record<Variant, string> = {
  ORIGINAL: 'PDF généré',
  SIGNED: 'PDF signé',
  PROOF: 'Certificat de preuve',
};

/**
 * Module 6 B4 — Modale d'aperçu PDF document.
 *
 * Génère un signed URL Storage 1h via getDocumentPreviewUrl côté Server
 * Action puis l'affiche dans une iframe. Le bouton "Télécharger" ouvre
 * le signed URL dans un nouvel onglet (le navigateur déclenche le
 * download via Content-Disposition côté Storage).
 *
 * `variant` contrôle quel PDF servir : 'ORIGINAL' (défaut, avant
 * signature), 'SIGNED' (après webhook completed), 'PROOF' (audit trail).
 */
export function DocumentPreviewDialog({
  open,
  onOpenChange,
  documentId,
  documentNumber,
  variant = 'ORIGINAL',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentNumber: string | null;
  variant?: Variant;
}) {
  const [pending, startTransition] = useTransition();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSignedUrl(null);
      setError(null);
      return;
    }
    startTransition(async () => {
      const res = await getDocumentPreviewUrl({ documentId, variant });
      if (res.ok) {
        setSignedUrl(res.signedUrl);
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }, [open, documentId, variant]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {VARIANT_LABELS[variant]} — {documentNumber ?? documentId.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            URL signée valide 1h. Lien direct ci-dessous pour ouvrir/télécharger.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[60vh] flex-1 overflow-hidden rounded-md border">
          {pending && !signedUrl ? (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              <Loader2 className="mr-2 size-4 animate-spin" /> Chargement de l&apos;aperçu…
            </div>
          ) : error ? (
            <div className="text-destructive flex h-full items-center justify-center text-sm">
              {error}
            </div>
          ) : signedUrl ? (
            <iframe
              src={signedUrl}
              title={`PDF preview ${documentNumber ?? documentId}`}
              className="h-full min-h-[60vh] w-full"
            />
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          {signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center text-sm hover:underline"
            >
              Ouvrir dans un nouvel onglet <ExternalLink className="ml-1 size-3" />
            </a>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {signedUrl ? (
              <a
                href={signedUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-xs inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium"
              >
                <Download className="mr-2 size-4" /> Télécharger
              </a>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
