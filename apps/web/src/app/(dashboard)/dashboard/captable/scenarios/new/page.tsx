import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { ScenarioBuilder } from './scenario-builder';

export const metadata: Metadata = {
  title: 'Nouveau scénario · Capiwise',
};

/**
 * Module 10 B4 — Création d'un scénario de dilution.
 *
 * Wizard form avec switch sur `scenarioType` (NEW_ROUND / POOL_TOPUP /
 * BULK_EXERCISE / EXIT). Pour chaque type, un sub-form spécifique avec les
 * paramètres requis.
 *
 * Permission requise : `captable.scenario.create`.
 */
export default async function NewScenarioPage() {
  await requireUser();
  const canCreate = await hasPermission('captable.scenario.create');
  if (!canCreate) {
    redirect('/dashboard/captable/scenarios');
  }

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: 'Scénarios', href: '/dashboard/captable/scenarios' },
          { label: 'Nouveau' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · NOUVEAU SCÉNARIO</PageShell.Overline>
        <PageShell.Title>
          Modéliser <PageShell.TitleAccent>une dilution</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          4 types de scénarios déterministes. Pour les simulations Monte Carlo (Exit avec
          distribution lognormale), utilisez le simulateur Monte Carlo (B5).
        </PageShell.Subtitle>
      </PageShell.Header>

      <PageShell.Content>
        <ScenarioBuilder />
      </PageShell.Content>
    </PageShell>
  );
}
