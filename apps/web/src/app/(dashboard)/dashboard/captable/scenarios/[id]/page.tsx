import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { CapTableResult } from '@/server/queries/cap-table';
import { runScenario } from '@/server/actions/cap-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DilutionComparator } from '@/components/captable/dilution-comparator';
import { EmptyState } from '@/components/shared/empty-state';
import { CompassIllustration } from '@/components/shared/illustrations';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { getCapTable } from '@/server/queries/cap-table';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Scénario · Capiwise',
};

/**
 * Module 10 B4 — Détail d'un scénario avec comparator Avant/Après.
 *
 * Charge en parallèle :
 *  - Le scénario lui-même (metadata)
 *  - La cap table CONSOLIDATED (= "Avant")
 *  - Le résultat du scénario via runScenario (= "Après", PRO_FORMA)
 *
 * Permission : `captable.scenario.read` (RLS filtre own + shared).
 */
export default async function ScenarioDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireUser();
  const canRead = await hasPermission('captable.scenario.read');
  if (!canRead) {
    redirect('/dashboard/captable/scenarios');
  }

  const { id } = await props.params;
  const supabase = await createSupabaseServerClient();

  const { data: scenario } = await supabase
    .from('dilution_scenarios')
    .select(
      'id, name, description, scenario_type, parameters, is_shared, created_by, created_at, result_computed_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!scenario) {
    notFound();
  }

  // Run en parallèle
  const [beforeResult, runResult] = await Promise.all([
    getCapTable({ viewMode: 'CONSOLIDATED' }),
    runScenario(id),
  ]);

  const before = beforeResult.ok ? beforeResult.data : null;
  const after = runResult.ok ? (runResult.result as CapTableResult) : null;

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: 'Scénarios', href: '/dashboard/captable/scenarios' },
          { label: scenario.name },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · {scenario.scenario_type}</PageShell.Overline>
        <PageShell.Title>{scenario.name}</PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          {scenario.description ?? 'Pas de description'} ·{' '}
          {scenario.is_shared ? 'Partagé' : 'Privé'} · Créé le{' '}
          {new Date(scenario.created_at).toLocaleDateString('fr-FR')}
        </PageShell.Subtitle>
        <PageShell.Actions>
          <Link href="/dashboard/captable/scenarios">
            <Button variant="outline">
              <ChevronLeft className="mr-1 size-4" />
              Retour à la liste
            </Button>
          </Link>
        </PageShell.Actions>
      </PageShell.Header>

      <PageShell.Content>
        {/* Card paramètres */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Paramètres</CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                {scenario.scenario_type}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted/40 max-h-40 overflow-auto rounded p-3 text-xs">
              {JSON.stringify(scenario.parameters, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Comparator Avant / Après */}
        {!before || !after ? (
          <EmptyState
            variant="error"
            illustration={<CompassIllustration />}
            title="Impossible de calculer le scénario"
            description={
              !before
                ? 'Erreur de chargement de la cap table actuelle.'
                : "Erreur d'exécution du scénario."
            }
            action={{ label: 'Recharger', href: `/dashboard/captable/scenarios/${id}` }}
          />
        ) : (
          <DilutionComparator
            beforePositions={before.positions}
            beforeTotalsByClass={before.totals_by_class}
            beforeGrandTotal={before.grand_total_units}
            afterPositions={after.positions}
            afterTotalsByClass={after.totals_by_class}
            afterGrandTotal={after.grand_total_units}
            scenarioName={scenario.name}
            scenarioType={scenario.scenario_type}
          />
        )}
      </PageShell.Content>
    </PageShell>
  );
}
