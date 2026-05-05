import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Camera, ImportIcon, Plus } from 'lucide-react';
import { VIEW_MODES, type ViewMode } from '@equity/shared';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CapTableTabs } from '@/components/captable/cap-table-tabs';
import type { CapTableEvolutionProps, EvolutionPoint } from '@/components/captable/evolution-chart';
import { StakeholderGroupingCards } from '@/components/captable/stakeholder-grouping-cards';
import { ValuationToggle } from '@/components/captable/valuation-toggle';
import { EmptyState } from '@/components/shared/empty-state';
import { ScalesIllustration } from '@/components/shared/illustrations';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCapTable } from '@/server/queries/cap-table';

export const metadata: Metadata = {
  title: 'Cap table · Capiwise',
};

/**
 * Module 10 B3 — Page principale `/dashboard/captable`.
 *
 * Tab Tableau seulement en B3. Tabs Camembert / Waterfall / Évolution
 * arrivent en B4 (scénarios) et B6 (snapshots historisés).
 *
 * Permission requise : `captable.read.all`. Si absente → redirect /dashboard
 * (pas de 404 — l'utilisateur est connecté mais sans accès cap_table).
 *
 * Empty state :
 *   - 0 positions → CTA `Créer ma première classe d'actions →`
 *
 * View mode : URL search param `?view=DILUTED|PRO_FORMA` (default CONSOLIDATED).
 * Géré par le composant `ValuationToggle`.
 */
export default async function CapTablePage(props: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const canRead = await hasPermission('captable.read.all');
  if (!canRead) {
    redirect('/dashboard');
  }

  const searchParams = await props.searchParams;
  const viewMode = (
    VIEW_MODES.includes(searchParams.view as ViewMode)
      ? (searchParams.view as ViewMode)
      : 'CONSOLIDATED'
  ) as ViewMode;

  const result = await getCapTable({ viewMode });

  // Load snapshots history (B6) pour le tab Évolution. Limit 30 récents.
  const supabaseRead = await createSupabaseServerClient();
  const [snapshotsResult, roundsResult] = await Promise.all([
    supabaseRead
      .from('cap_table_snapshots')
      .select('snapshot_date, totals_by_class')
      .order('snapshot_date', { ascending: true })
      .limit(30),
    supabaseRead
      .from('funding_rounds')
      .select('name, closed_at')
      .eq('status', 'CLOSED')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: true }),
  ]);

  // Construit les datapoints + classTypes uniques depuis les snapshots
  const evolution: CapTableEvolutionProps | undefined = (() => {
    const rows = snapshotsResult.data ?? [];
    if (rows.length === 0) return undefined;
    const allClassTypes = new Set<string>();
    const points: EvolutionPoint[] = rows.map((row) => {
      const totals = (row.totals_by_class as Record<string, number> | null) ?? {};
      // Agrège par class_type : on a totals_by_class par CODE (ex COMMON, PREF_A).
      // Pour le tab évolution on veut par TYPE (ex COMMON, PREFERRED, ESOP).
      // V1 simple : on prend le code comme proxy du type. Si la convention de
      // codes alignée avec types tient (COMMON, PREF_A, PREF_B → on regroupe
      // par préfixe), on pourrait raffiner. Pour V1 on garde par code.
      const point: EvolutionPoint = { date: row.snapshot_date };
      for (const [code, units] of Object.entries(totals)) {
        allClassTypes.add(code);
        point[code] = Number(units);
      }
      return point;
    });
    return {
      points,
      classTypes: Array.from(allClassTypes).sort(),
      rounds: (roundsResult.data ?? []).map((r) => ({
        date: r.closed_at as string,
        label: r.name,
      })),
    };
  })();

  if (!result.ok) {
    return (
      <PageShell title="Cap table" description="Erreur de chargement de la cap table.">
        <EmptyState
          variant="error"
          illustration={<ScalesIllustration />}
          title="Impossible de charger la cap table"
          description={result.error}
          action={{ label: 'Recharger', href: '/dashboard/captable' }}
        />
      </PageShell>
    );
  }

  const { positions, totals_by_class, grand_total_units } = result.data;
  const hasPositions = positions.length > 0;

  // Total stakeholders unique (pour subtitle)
  const stakeholderIds = new Set(positions.map((p) => p.stakeholder_id ?? p.stakeholder_name));

  // Subtitle adaptatif
  const subtitle = hasPositions
    ? `${positions.length} position${positions.length > 1 ? 's' : ''} · ${stakeholderIds.size} stakeholder${stakeholderIds.size > 1 ? 's' : ''} · vue ${viewMode}`
    : `Aucune position · vue ${viewMode}`;

  return (
    <PageShell>
      <PageShell.Breadcrumb items={[{ label: 'Capiwise' }, { label: 'Cap Table' }]} />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · CAP TABLE</PageShell.Overline>
        <PageShell.Title>
          Vue <PageShell.TitleAccent>d&apos;ensemble</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>{subtitle}</PageShell.Subtitle>
        <PageShell.Actions>
          <Link href="/dashboard/captable/import">
            <Button variant="outline">
              <ImportIcon className="mr-1 size-4" />
              Importer
            </Button>
          </Link>
          <Link href="/dashboard/captable/snapshots">
            <Button variant="outline">
              <Camera className="mr-1 size-4" />
              Snapshots
            </Button>
          </Link>
          <Link href="/dashboard/captable/scenarios/new">
            <Button>
              <Plus className="mr-1 size-4" />
              Nouveau scénario
            </Button>
          </Link>
        </PageShell.Actions>
      </PageShell.Header>

      <PageShell.Content>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ValuationToggle current={viewMode} />
          {hasPositions ? (
            <p className="serif-italic text-ink-500 max-w-xl text-sm leading-relaxed">
              La photographie du capital, à l&apos;instant.
            </p>
          ) : null}
        </div>

        {hasPositions ? (
          <>
            <StakeholderGroupingCards positions={positions} grandTotal={grand_total_units} />
            <CapTableTabs
              positions={positions}
              totalsByClass={totals_by_class}
              grandTotal={grand_total_units}
              evolution={evolution}
            />
          </>
        ) : (
          <EmptyState
            variant="list"
            illustration={<ScalesIllustration />}
            title="Aucune position dans la cap table"
            description="Créez d'abord une classe d'actions (par exemple « Common Stock »), puis ajoutez les positions des fondateurs ou enregistrez une levée de fonds."
            action={{
              label: "Créer ma première classe d'actions",
              href: '/dashboard/captable/share-classes/new',
            }}
            secondaryLink={{
              label: 'En savoir plus sur le cap table',
              href: '/docs/cap-table',
            }}
          />
        )}
      </PageShell.Content>

      {/* Voir l'utilisateur courant pour audit dev — pas affiché */}
      {user.email ? null : null}
    </PageShell>
  );
}
