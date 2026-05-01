'use client';

import { useTransition } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { PortalDocumentLink } from '@equity/shared';
import { getPortalDocumentSignedUrl } from '@/server/actions/portal';

/**
 * Module 8 B3 — Liste des documents SIGNED associés à un award (§4.3
 * section 4).
 *
 * Client Component pour gérer le download : appelle Server Action
 * `getPortalDocumentSignedUrl` (avec ownership check chain) puis ouvre
 * l'URL signée dans un nouvel onglet.
 */
export function PortalDocumentsList({ documents }: { documents: PortalDocumentLink[] | null }) {
  const visible = (documents ?? []).filter((d) => d.status === 'SIGNED' && d.has_signed_pdf);

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Aucun document signé pour cette attribution.</p>
    );
  }

  return (
    <ul className="divide-border/40 divide-y rounded-md border">
      {visible.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} />
      ))}
    </ul>
  );
}

function DocumentRow({ doc }: { doc: PortalDocumentLink }) {
  const [pending, startTransition] = useTransition();

  const onDownload = () => {
    startTransition(async () => {
      const res = await getPortalDocumentSignedUrl({ documentId: doc.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Open in new tab — user can download or save
      window.open(res.signedUrl, '_blank', 'noopener');
    });
  };

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{doc.document_number ?? 'Document'}</p>
          <p className="text-muted-foreground truncate text-xs">
            {doc.category ?? 'PDF signé'}
            {doc.signed_at ? ` · Signé le ${formatDate(doc.signed_at)}` : null}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onDownload}
        disabled={pending}
        data-testid={`portal-doc-download-${doc.id}`}
        className="shrink-0 gap-2"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Télécharger
      </Button>
    </li>
  );
}

function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
