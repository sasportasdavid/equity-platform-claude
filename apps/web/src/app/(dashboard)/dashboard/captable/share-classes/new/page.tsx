import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { ShareClassForm } from './share-class-form';

export const metadata: Metadata = {
  title: "Nouvelle classe d'actions · Capiwise",
};

/**
 * Module 10 B4 — Page minimale création share class (V5 fix empty state CTA).
 *
 * V1 : form simple créant une COMMON / PREFERRED / ESOP via createShareClass.
 * V2 (B6+) : wizard multi-step avec presets (Common Stock, Pool ESOP 10%, etc.)
 *
 * Permission : `captable.share_class.create`.
 */
export default async function NewShareClassPage() {
  await requireUser();
  const canCreate = await hasPermission('captable.share_class.create');
  if (!canCreate) {
    redirect('/dashboard/captable');
  }

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise', href: '/dashboard' },
          { label: 'Cap Table', href: '/dashboard/captable' },
          { label: "Nouvelle classe d'actions" },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · CLASSES D&apos;ACTIONS</PageShell.Overline>
        <PageShell.Title>
          Créer <PageShell.TitleAccent>une classe d&apos;actions</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          Définit le type d&apos;instrument (Common, Preferred, ESOP, etc.) avec ses termes
          (liquidation preference, voting rights, anti-dilution).
        </PageShell.Subtitle>
      </PageShell.Header>

      <PageShell.Content>
        <ShareClassForm />
      </PageShell.Content>
    </PageShell>
  );
}
