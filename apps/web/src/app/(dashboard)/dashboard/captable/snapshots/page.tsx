import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { VaultIllustration } from '@/components/shared/illustrations';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateSnapshotButton } from '@/components/captable/create-snapshot-button';

export const metadata: Metadata = {
  title: 'Snapshots cap table · Capiwise',
};

/**
 * Module 10 B6 — Liste des snapshots de cap table.
 *
 * Affiche tous les snapshots de l'org (RLS scope = current_org_id() +
 * permission `captable.read.all`). 100 derniers, tri DESC sur snapshot_date.
 *
 * Filtres futurs (V2) : par snapshot_type, par range de dates.
 */
export default async function SnapshotsListPage() {
  await requireUser();
  const canRead = await hasPermission('captable.read.all');
  if (!canRead) {
    redirect('/dashboard');
  }
  const canCreate = await hasPermission('captable.snapshot.create');

  const supabase = await createSupabaseServerClient();

  const { data: snapshots } = await supabase
    .from('cap_table_snapshots')
    .select(
      'id, snapshot_date, snapshot_type, label, is_immutable, total_units_issued, total_units_diluted, created_at, triggered_by_funding_round_id',
    )
    .order('snapshot_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  const list = snapshots ?? [];

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: 'Snapshots' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · ARCHIVES</PageShell.Overline>
        <PageShell.Title>
          Snapshots <PageShell.TitleAccent>cap table</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          {list.length} snapshot{list.length > 1 ? 's' : ''} archivé
          {list.length > 1 ? 's' : ''} · Auto post-round + manuels (PRE_AUDIT, MANUAL_FREEZE).
          Snapshots quotidiens automatiques disponibles V1.5.
        </PageShell.Subtitle>
        {canCreate ? (
          <PageShell.Actions>
            <CreateSnapshotButton />
          </PageShell.Actions>
        ) : null}
      </PageShell.Header>

      <PageShell.Content>
        {list.length === 0 ? (
          <EmptyState
            variant="list"
            illustration={<VaultIllustration />}
            title="Aucun snapshot pour le moment"
            description="Créez un snapshot manuel pour figer l'état de votre cap table à une date précise (audit, levée, fin d'année). Les snapshots automatiques quotidiens arrivent en V1.5."
            action={
              canCreate
                ? {
                    label: 'Créer mon premier snapshot',
                    href: '#',
                  }
                : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {list.map((s) => (
              <Link key={s.id} href={`/dashboard/captable/snapshots/${s.id}`}>
                <Card className="hover:border-primary/40 transition-colors">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Camera className="text-muted-foreground size-4" />
                        {s.label ?? 'Sans label'}
                        {s.is_immutable ? (
                          <Badge variant="default" className="gap-1 text-xs">
                            <Lock className="size-3" /> Frozen
                          </Badge>
                        ) : null}
                      </CardTitle>
                      <CardDescription>
                        {new Date(s.snapshot_date).toLocaleDateString('fr-FR', {
                          dateStyle: 'long',
                        })}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {s.snapshot_type}
                    </Badge>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex items-center gap-6 text-xs">
                    <span>
                      <strong className="text-foreground font-mono">
                        {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
                          Number(s.total_units_issued ?? 0),
                        )}
                      </strong>{' '}
                      units émises
                    </span>
                    <span>
                      <strong className="text-foreground font-mono">
                        {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
                          Number(s.total_units_diluted ?? 0),
                        )}
                      </strong>{' '}
                      units diluées
                    </span>
                    <span className="ml-auto">
                      Créé le {new Date(s.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </PageShell.Content>
    </PageShell>
  );
}
