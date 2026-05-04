import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/shared/empty-state';
import { LighthouseIllustration } from '@/components/shared/illustrations';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';

export const metadata: Metadata = {
  title: 'Simulateur Monte Carlo de sortie · Capiwise',
};

/**
 * Module 10 B5 — DEFERRED V1.5.
 *
 * Le moteur Python `equity-gem-quant-tonnom.fly.dev` n'expose actuellement
 * que `/compute/multi-tranche` (utilisé par Module 3a B5 pour la valorisation
 * IFRS 2). L'endpoint `/compute/dilution-monte-carlo` requis par cette page
 * est absent (HTTP 404 confirmé 2026-05-04).
 *
 * Voir `memory/module_10_b5_skipped.md` pour la spec endpoint à transmettre
 * au mainteneur Fly + la liste des fichiers à créer en V1.5 (Edge Function,
 * Server Action, composants).
 *
 * Permission `captable.scenario.run_montecarlo` reste seedée (00089) — prête
 * pour activation V1.5 sans nouvelle migration.
 */
export default async function ExitSimulatorPage() {
  await requireUser();
  const canRun = await hasPermission('captable.scenario.run_montecarlo');
  if (!canRun) {
    redirect('/dashboard/captable');
  }

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: 'Simulateur Monte Carlo' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · MONTE CARLO</PageShell.Overline>
        <PageShell.Title>
          Simulateur <PageShell.TitleAccent>de sortie</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          Distribution stochastique des gains par stakeholder selon une valuation de sortie
          modélisée en lognormal. Disponible en V1.5.
        </PageShell.Subtitle>
      </PageShell.Header>

      <PageShell.Content>
        <EmptyState
          variant="list"
          illustration={<LighthouseIllustration />}
          title="Le simulateur arrive en V1.5"
          description="Le moteur Python doit d'abord exposer l'endpoint /compute/dilution-monte-carlo. La page sera activée dès que le mainteneur Fly aura déployé la nouvelle route — sans nouvelle migration côté Capiwise."
          action={{
            label: 'Retour à la cap table',
            href: '/dashboard/captable',
          }}
          secondaryLink={{
            label: 'Voir les scénarios déterministes',
            href: '/dashboard/captable/scenarios',
          }}
        />
      </PageShell.Content>
    </PageShell>
  );
}
