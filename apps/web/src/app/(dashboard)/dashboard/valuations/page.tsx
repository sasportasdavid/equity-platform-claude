import type { Metadata } from 'next';
import { Calculator } from 'lucide-react';
import { PageShell } from '@/components/shared/PageShell';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/rbac';

export const metadata: Metadata = {
  title: 'Valorisations · Capiwise',
};

export default async function ValuationsPage() {
  await requireUser();
  return (
    <PageShell
      title="Valorisations"
      description="Historique des simulations Monte Carlo (juste valeur IFRS 2)."
    >
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Calculator className="text-muted-foreground size-10" />
          <p className="font-medium">Module à venir</p>
          <p className="text-muted-foreground max-w-md text-sm">
            Le moteur Python Monte Carlo et les calculs IFRS 2 seront branchés au sous-module B5
            (Edge Function compute-valuation + table valuation_runs aligné sur l&apos;API du
            moteur).
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
