'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { BeneficiaryDocumentSummary } from '@/server/queries/portal';
import { DocumentDownloadButton } from './DocumentDownloadButton';

/**
 * Module 8 B5 — Liste globale des documents SIGNED du bénéficiaire
 * (§4.4).
 *
 * Affiche tous les awards confondus, avec :
 *   - Card par document avec award_number + plan_name + plan_type
 *   - Filter dropdown par award (V1 simple — pas de pagination)
 *   - Empty state si aucun document
 *
 * Client Component (filter state).
 */
export function PortalDocumentsTable({ documents }: { documents: BeneficiaryDocumentSummary[] }) {
  const [filterAwardId, setFilterAwardId] = useState<string>('');

  // Liste des awards distincts pour le filter
  const awardOptions = useMemo(() => {
    const seen = new Map<string, { id: string; number: string; planName: string }>();
    for (const d of documents) {
      if (!seen.has(d.award_id)) {
        seen.set(d.award_id, {
          id: d.award_id,
          number: d.award_number,
          planName: d.plan_name,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.number.localeCompare(b.number));
  }, [documents]);

  const filtered = useMemo(() => {
    if (!filterAwardId) return documents;
    return documents.filter((d) => d.award_id === filterAwardId);
  }, [documents, filterAwardId]);

  if (documents.length === 0) {
    return (
      <div
        className="border-border/40 bg-muted/20 rounded-md border border-dashed p-12 text-center"
        data-testid="portal-documents-empty"
      >
        <p className="text-muted-foreground text-sm">
          Aucun document signé pour le moment. Les documents apparaîtront ici dès que vos
          attributions seront signées.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="portal-documents-table">
      {awardOptions.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="doc-filter" className="text-xs">
            Filtrer par attribution
          </Label>
          <select
            id="doc-filter"
            value={filterAwardId}
            onChange={(e) => setFilterAwardId(e.target.value)}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 max-w-xs rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
            data-testid="portal-documents-filter"
          >
            <option value="">Toutes les attributions ({documents.length})</option>
            {awardOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.number} · {opt.planName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun document pour ce filtre.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((doc) => (
            <li key={doc.id}>
              <Card className="hover:border-primary/40 h-full transition-colors">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">
                        {doc.document_number ?? 'Document'}
                      </p>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                          {doc.plan_type}
                        </span>
                        <span className="truncate">{doc.plan_name}</span>
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {doc.award_number}
                        {doc.signed_at ? ` · Signé le ${formatDate(doc.signed_at)}` : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <DocumentDownloadButton
                      documentId={doc.id}
                      variant="outline"
                      label="Télécharger le PDF"
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
