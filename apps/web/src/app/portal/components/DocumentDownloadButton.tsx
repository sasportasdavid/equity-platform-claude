'use client';

import { useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getPortalDocumentSignedUrl } from '@/server/actions/portal';

/**
 * Module 8 — Bouton "Télécharger" partagé entre :
 *   - PortalDocumentsList (B3, page détail award)
 *   - PortalDocumentsTable (B5, page liste globale /portal/documents)
 *
 * Appelle Server Action `getPortalDocumentSignedUrl` (avec ownership chain
 * Module 8 B3) puis ouvre l'URL signée dans un nouvel onglet.
 */
export function DocumentDownloadButton({
  documentId,
  size = 'sm',
  variant = 'ghost',
  label = 'Télécharger',
}: {
  documentId: string;
  size?: 'sm' | 'default';
  variant?: 'ghost' | 'default' | 'outline';
  label?: string;
}) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await getPortalDocumentSignedUrl({ documentId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.open(res.signedUrl, '_blank', 'noopener');
    });
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onClick}
      disabled={pending}
      data-testid={`portal-doc-download-${documentId}`}
      className="shrink-0 gap-2"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {label}
    </Button>
  );
}
