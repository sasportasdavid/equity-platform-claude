import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { PageShell } from '@/components/shared/PageShell';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/rbac';

export const metadata: Metadata = {
  title: 'Bénéficiaires · Capiwise',
};

/**
 * Placeholder route /dashboard/beneficiaries — vraie page livrée en
 * Module 3b (gestion des grants individuels + bénéficiaires nominatifs).
 *
 * On crée la route dès B4 pour que le lien sidebar ne 404 pas et que
 * l'utilisateur ait une visibilité sur la roadmap.
 */
export default async function BeneficiariesPage() {
  await requireUser();
  return (
    <PageShell title="Bénéficiaires" description="Gestion individuelle des bénéficiaires de plans.">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Users className="text-muted-foreground size-10" />
          <p className="font-medium">Module à venir</p>
          <p className="text-muted-foreground max-w-md text-sm">
            La gestion des bénéficiaires (création, invitations, attributions individuelles,
            signatures Yousign) arrive avec le Module 3b.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
