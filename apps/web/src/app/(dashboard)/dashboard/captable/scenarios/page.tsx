import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { CompassIllustration } from '@/components/shared/illustrations';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Scénarios cap table · Capiwise',
};

/**
 * Module 10 B4 — Liste des scénarios de dilution.
 *
 * Affiche les scénarios partagés (`is_shared=TRUE`) + ceux du créateur
 * (filtrés via RLS policy `scenarios_select_own_or_shared`).
 *
 * Permission requise : `captable.scenario.read`. Si absente → redirect /dashboard.
 */
export default async function ScenariosListPage() {
  const user = await requireUser();
  const canRead = await hasPermission('captable.scenario.read');
  if (!canRead) {
    redirect('/dashboard');
  }

  const supabase = await createSupabaseServerClient();

  const { data: scenarios } = await supabase
    .from('dilution_scenarios')
    .select(
      'id, name, description, scenario_type, is_shared, created_by, created_at, result_computed_at',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const list = scenarios ?? [];
  const now = new Date();

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: 'Scénarios' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · SIMULATIONS</PageShell.Overline>
        <PageShell.Title>
          Scénarios <PageShell.TitleAccent>de dilution</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          {list.length} scénario{list.length > 1 ? 's' : ''} · Modèles déterministes (NEW_ROUND,
          POOL_TOPUP, BULK_EXERCISE, EXIT)
        </PageShell.Subtitle>
        <PageShell.Actions>
          <Link href="/dashboard/captable/scenarios/new">
            <Button>
              <Plus className="mr-1 size-4" />
              Nouveau scénario
            </Button>
          </Link>
        </PageShell.Actions>
      </PageShell.Header>

      <PageShell.Content>
        {list.length === 0 ? (
          <EmptyState
            variant="list"
            illustration={<CompassIllustration />}
            title="Aucun scénario pour le moment"
            description="Créez votre premier scénario pour modéliser une levée future, un top-up de pool ESOP, un batch d'exercices ou une sortie de la société."
            action={{
              label: 'Créer mon premier scénario',
              href: '/dashboard/captable/scenarios/new',
            }}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((s) => {
              const isMine = s.created_by === user.id;
              const cacheAgeHours = s.result_computed_at
                ? (now.getTime() - new Date(s.result_computed_at).getTime()) / 3_600_000
                : null;
              const cacheLabel =
                cacheAgeHours == null
                  ? 'Jamais calculé'
                  : cacheAgeHours < 24
                    ? `Calculé il y a ${cacheAgeHours < 1 ? '<1h' : `${Math.floor(cacheAgeHours)}h`}`
                    : 'Cache expiré (>24h)';
              return (
                <Link key={s.id} href={`/dashboard/captable/scenarios/${s.id}`}>
                  <Card className="hover:border-primary/40 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="font-mono text-xs">
                            {s.scenario_type}
                          </Badge>
                          {s.is_shared ? (
                            <Badge variant="default" className="text-xs">
                              Partagé
                            </Badge>
                          ) : null}
                          {isMine ? null : (
                            <Badge variant="secondary" className="text-xs">
                              Autre user
                            </Badge>
                          )}
                        </div>
                      </div>
                      {s.description ? <CardDescription>{s.description}</CardDescription> : null}
                    </CardHeader>
                    <CardContent className="text-muted-foreground text-xs">
                      {cacheLabel} · Créé le {new Date(s.created_at).toLocaleDateString('fr-FR')}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </PageShell.Content>
    </PageShell>
  );
}
