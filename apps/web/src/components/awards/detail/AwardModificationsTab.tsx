'use client';

import { useState } from 'react';
import { Eye, FileEdit, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { JsonDiffViewer } from '@/components/shared/JsonDiffViewer';
import type { AwardDetailRow } from '@/server/queries/awards';
import type { Json } from '@equity/shared';

/**
 * Onglet Modifications IFRS 2.27-28 — Module 3b B4.
 *
 * Empty state si aucune modification + bouton « Nouvelle modification »
 * disabled (Module 3b B6 livrera la modale CreateModificationModal).
 *
 * Sinon : table chronologique avec type, effective_date, incremental_fair_value,
 * approved_by, approved_at, action « Voir le diff » → Dialog JSON viewer
 * avant/après côte à côte.
 */
export function AwardModificationsTab({
  detail,
  canModify,
}: {
  detail: AwardDetailRow;
  canModify: boolean;
}) {
  const { modifications } = detail;
  const [diffOpen, setDiffOpen] = useState<{
    type: string;
    before: Json;
    after: Json;
  } | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileEdit className="size-4" />
                Modifications post-grant (IFRS 2.27-28)
              </CardTitle>
              <CardDescription>
                {modifications.length === 0
                  ? 'Aucune modification enregistrée pour cet award'
                  : `${modifications.length} modification${modifications.length > 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <Button
              size="sm"
              disabled
              title="Disponible en B6"
              data-testid="new-modification-button"
            >
              <Plus className="mr-2 size-4" />
              Nouvelle (B6)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {modifications.length === 0 ? (
            <div className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-8 text-center text-sm">
              <FileEdit className="mx-auto mb-2 size-8 opacity-40" />
              <p>Aucune modification enregistrée</p>
              <p className="mt-1 text-xs">
                Les modifications IFRS 2.27-28 (REPRICING / EXTENSION / ACCELERATION /
                ADDITIONAL_GRANT / CANCELLATION) arriveront en B6.
              </p>
              {!canModify ? (
                <p className="text-muted-foreground/70 mt-2 text-xs">
                  Permission `awards.modify` requise.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date effective</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">Incrément FV</th>
                    <th className="px-3 py-2 font-medium">Approuvé par</th>
                    <th className="px-3 py-2 font-medium">Date approbation</th>
                    <th className="px-3 py-2 font-medium">Raison</th>
                    <th className="px-3 py-2 font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {modifications.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {formatDate(m.effective_date)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="font-medium">
                          {m.modification_type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {m.incremental_fair_value != null
                          ? `${Number(m.incremental_fair_value) >= 0 ? '+' : ''}${Number(m.incremental_fair_value).toFixed(4)} €`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{m.approved_by ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {m.approved_at ? formatDate(m.approved_at) : '—'}
                      </td>
                      <td className="text-muted-foreground max-w-xs truncate px-3 py-2 text-xs">
                        {m.reason ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDiffOpen({
                              type: m.modification_type,
                              before: m.before_snapshot,
                              after: m.after_snapshot,
                            })
                          }
                        >
                          <Eye className="mr-1 size-3" />
                          Voir
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={diffOpen != null} onOpenChange={(o) => !o && setDiffOpen(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Diff modification — {diffOpen?.type}</DialogTitle>
            <DialogDescription>
              Snapshots avant / après la modification (JSON brut côte à côte).
            </DialogDescription>
          </DialogHeader>
          {diffOpen ? <JsonDiffViewer before={diffOpen.before} after={diffOpen.after} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
