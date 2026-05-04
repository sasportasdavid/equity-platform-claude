import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { ImportPositionsWizard } from './import-wizard';

export const metadata: Metadata = {
  title: 'Import cap table · Capiwise',
};

/**
 * Module 10 B6 — Page import CSV positions cap_table.
 *
 * Permission requise : `captable.import`. Si absente → redirect /dashboard/captable.
 */
export default async function CapTableImportPage() {
  await requireUser();
  const canImport = await hasPermission('captable.import');
  if (!canImport) {
    redirect('/dashboard/captable');
  }

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: 'Import' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · BULK IMPORT</PageShell.Overline>
        <PageShell.Title>
          Import <PageShell.TitleAccent>de positions historiques</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          CSV des positions actuelles (founders, investisseurs anciens, beneficiaries déjà
          détenteurs). Atomique — toute ligne invalide bloque l&apos;import. Une seule passe par
          fichier.
        </PageShell.Subtitle>
      </PageShell.Header>

      <PageShell.Content>
        <ImportPositionsWizard />
      </PageShell.Content>
    </PageShell>
  );
}
