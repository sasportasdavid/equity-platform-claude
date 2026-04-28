import type { Metadata } from 'next';
import { PieChart } from 'lucide-react';
import { PageShell } from '@/components/shared/PageShell';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/rbac';

export const metadata: Metadata = {
  title: 'Cap table · Capiwise',
};

export default async function CapTablePage() {
  await requireUser();
  return (
    <PageShell title="Cap table" description="Tableau de capitalisation et scénarios de dilution.">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <PieChart className="text-muted-foreground size-10" />
          <p className="font-medium">Module à venir</p>
          <p className="text-muted-foreground max-w-md text-sm">
            Cap table dynamique avec scénarios de levée et simulation de dilution. Disponible dans
            un module dédié (post-Module 3).
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
