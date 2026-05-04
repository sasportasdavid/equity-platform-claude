import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CapTableMatrix } from '@/components/captable/cap-table-matrix';
import { SnapshotActions } from '@/components/captable/snapshot-actions';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CapTablePosition } from '@/server/queries/cap-table';

export const metadata: Metadata = {
  title: 'Détail snapshot · Capiwise',
};

/**
 * Module 10 B6 — Détail snapshot cap table.
 *
 * Lit `cap_table_snapshots` (RLS + permission `captable.read.all`) puis
 * rend la matrice frozen via `CapTableMatrix` à partir de
 * `positions_json` (snapshot historisé immuable).
 *
 * Actions disponibles :
 *  - Freeze (si !is_immutable && permission snapshot.create)
 *  - Delete (si !is_immutable && permission snapshot.create)
 *
 * Pas d'édition en V1 — la table a une RLS UPDATE = USING(FALSE).
 */
export default async function SnapshotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const canRead = await hasPermission('captable.read.all');
  if (!canRead) {
    redirect('/dashboard');
  }
  const canManage = await hasPermission('captable.snapshot.create');

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: snapshot } = await supabase
    .from('cap_table_snapshots')
    .select(
      'id, snapshot_date, snapshot_type, label, is_immutable, total_units_issued, total_units_diluted, positions_json, totals_by_class, created_at, triggered_by_funding_round_id',
    )
    .eq('id', id)
    .maybeSingle();

  if (!snapshot) {
    notFound();
  }

  // positions_json est un JSONB array — cast côté TS
  const positions = (snapshot.positions_json as CapTablePosition[] | null) ?? [];
  const totalsByClass = (snapshot.totals_by_class as Record<string, number> | null) ?? {};
  const grandTotal = Number(snapshot.total_units_issued ?? 0);

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: 'Snapshots', href: '/dashboard/captable/snapshots' },
          { label: snapshot.label ?? 'Détail' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · ARCHIVE FROZEN</PageShell.Overline>
        <PageShell.Title>
          {snapshot.label ?? 'Snapshot'}{' '}
          <PageShell.TitleAccent>
            {new Date(snapshot.snapshot_date).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          Type <span className="font-mono text-sm">{snapshot.snapshot_type}</span> · Créé le{' '}
          {new Date(snapshot.created_at).toLocaleDateString('fr-FR')}
          {snapshot.is_immutable ? ' · Frozen' : null}
        </PageShell.Subtitle>
        {canManage ? (
          <PageShell.Actions>
            <SnapshotActions snapshotId={snapshot.id} isImmutable={snapshot.is_immutable} />
          </PageShell.Actions>
        ) : null}
      </PageShell.Header>

      <PageShell.Content>
        {/* Stats header */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              Synthèse
              {snapshot.is_immutable ? (
                <Badge variant="default" className="gap-1 text-xs">
                  <Lock className="size-3" /> Frozen
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="text-muted-foreground text-overline">Units émises</div>
                <div className="font-mono text-2xl">
                  {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
                    Number(snapshot.total_units_issued ?? 0),
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-overline">Units diluées</div>
                <div className="font-mono text-2xl">
                  {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
                    Number(snapshot.total_units_diluted ?? 0),
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-overline">Stakeholders</div>
                <div className="font-mono text-2xl">
                  {new Set(positions.map((p) => p.stakeholder_name)).size}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Matrice frozen */}
        <CapTableMatrix
          positions={positions}
          totalsByClass={totalsByClass}
          grandTotal={grandTotal}
        />
      </PageShell.Content>
    </PageShell>
  );
}
