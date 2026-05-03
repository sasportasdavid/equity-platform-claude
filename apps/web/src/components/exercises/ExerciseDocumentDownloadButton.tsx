'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { getDocumentPreviewUrl } from '@/server/actions/documents';
import { getPortalDocumentSignedUrl } from '@/server/actions/portal';

/**
 * Module 9 B5 — Bouton de téléchargement pour les PDFs exercise
 * (notification d'exercice + bulletin de souscription).
 *
 * Côté admin : utilise `getDocumentPreviewUrl` (Module 6, perm `documents.read`).
 * Côté portal : utilise `getPortalDocumentSignedUrl` (Module 8 B3, ownership chain).
 *
 * Pattern : appel Server Action → ouvre signed URL dans un nouvel onglet
 * (les TTL sont 1h admin / 5min portal).
 */
export function ExerciseDocumentDownloadButton({
  documentId,
  label,
  scope,
}: {
  documentId: string;
  label: string;
  scope: 'admin' | 'portal';
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result =
        scope === 'admin'
          ? await getDocumentPreviewUrl({ documentId, variant: 'ORIGINAL' })
          : await getPortalDocumentSignedUrl({ documentId });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      const url = 'signedUrl' in result ? result.signedUrl : null;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setError('URL signée indisponible');
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={isPending}
        data-testid={`download-${scope}-doc-${documentId.slice(0, 8)}`}
      >
        {isPending ? 'Génération du lien…' : label}
      </Button>
      {error && (
        <p className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
          {error}
        </p>
      )}
    </div>
  );
}
