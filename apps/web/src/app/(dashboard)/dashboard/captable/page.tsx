import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ImportIcon, Plus } from 'lucide-react';
import { VIEW_MODES, type ViewMode } from '@equity/shared';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CapTableTabs } from '@/components/captable/cap-table-tabs';
import { ValuationToggle } from '@/components/captable/valuation-toggle';
import { EmptyState } from '@/components/shared/empty-state';
import { ScalesIllustration } from '@/components/shared/illustrations';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
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
          <Button variant="outline" disabled title="Disponible en B6">
            <ImportIcon className="mr-1 size-4" />
            Importer historique
          </Button>
          <Link href="/dashboard/captable/scenarios/new">
            <Button>
              <Plus className="mr-1 size-4" />
              Nouveau scénario
            </Button>
          </Link>
        </PageShell.Actions>
      </PageShell.Header>

      <PageShell.Content>
        <div className="flex items-center gap-3">
          <ValuationToggle current={viewMode} />
        </div>

        {hasPositions ? (
          <CapTableTabs
            positions={positions}
            totalsByClass={totals_by_class}
            grandTotal={grand_total_units}
          />
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
