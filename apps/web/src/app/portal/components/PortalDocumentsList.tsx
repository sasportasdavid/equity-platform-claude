import { FileText } from 'lucide-react';
import type { PortalDocumentLink } from '@equity/shared';
import { DocumentDownloadButton } from './DocumentDownloadButton';

/**
 * Module 8 B3 — Liste des documents SIGNED associés à un award (§4.3
 * section 4).
 *
 * Server Component (le bouton de téléchargement est extrait en Client
 * Component DocumentDownloadButton — Module 8 B5 refactor pour réutiliser
 * la logique sur /portal/documents).
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
        <li key={doc.id} className="flex items-center justify-between gap-4 px-4 py-3">
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
          <DocumentDownloadButton documentId={doc.id} />
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
