'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { CreateModificationModal } from '@/components/awards/CreateModificationModal';
import { isPostGrantStatus } from '@/lib/stateMachines/awardStateMachine';
import type { AwardDetailRow } from '@/server/queries/awards';
import type { AwardStatus, Json } from '@equity/shared';

const TYPE_BADGE_TONE: Record<string, string> = {
  REPRICING: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  EXTENSION: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  ACCELERATION: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  ADDITIONAL_GRANT:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  CANCELLATION: 'border-destructive/40 bg-destructive/10 text-destructive',
};

/**
 * Onglet Modifications IFRS 2.27-28 — Module 3b B4 + B6 (modale activée).
 *
 * Bouton "Nouvelle modification" actif si :
 *   - canModify (permission `awards.modify`)
 *   - ET award status post-GRANTED (cf. isPostGrantStatus)
 *   - ET status pas terminal (CANCELLED/EXPIRED/FORFEITED) — implicite via
 *     la pré-condition côté RPC apply_award_modification, mais on filtre
 *     aussi côté UI pour cacher le bouton.
 *
 * Sinon : table chronologique avec type (badge color-coded), effective_date,
 * incremental_fair_value, approved_by, approved_at, action « Voir le diff »
 * → Dialog JsonDiffViewer.
 */
export function AwardModificationsTab({
  detail,
  canModify,
}: {
  detail: AwardDetailRow;
  canModify: boolean;
}) {
  const router = useRouter();
  const { modifications, award, plan } = detail;
  const [diffOpen, setDiffOpen] = useState<{
    type: string;
    before: Json;
    after: Json;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const status = award.status as AwardStatus;
  const isTerminal = ['CANCELLED', 'EXPIRED', 'FORFEITED'].includes(status);
  const canCreate = canModify && isPostGrantStatus(status) && !isTerminal;

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
              onClick={() => setCreateOpen(true)}
              disabled={!canCreate}
              title={
                canCreate
                  ? 'Créer une modification IFRS 2.27-28'
                  : !canModify
                    ? 'Permission awards.modify requise'
                    : isTerminal
                      ? `Award en statut ${status} — modifications non disponibles`
                      : `Award en statut ${status} — modifications réservées au post-GRANTED`
              }
              data-testid="new-modification-button"
            >
              <Plus className="mr-2 size-4" />
              Nouvelle modification
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
                ADDITIONAL_GRANT / CANCELLATION) déclenchent un recalcul du fair value incrémental.
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
                        <Badge
                          variant="outline"
                          className={`font-medium ${TYPE_BADGE_TONE[m.modification_type] ?? ''}`}
                        >
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

      {canCreate ? (
        <CreateModificationModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          award={{ ...award, plan_id: plan?.id }}
          onSuccess={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
