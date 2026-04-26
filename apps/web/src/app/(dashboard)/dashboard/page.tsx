import type { Metadata } from 'next';
import { ChartLine, FileText, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/rbac';

export const metadata: Metadata = {
  title: 'Tableau de bord',
};

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-8" data-testid="dashboard-page">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bienvenue {user.fullName ?? ''}</h1>
          <p className="text-muted-foreground mt-1">Votre espace Capiwise.</p>
        </div>
        <Badge variant={user.activeOrgId ? 'default' : 'outline'} className="font-mono text-[10px]">
          {user.activeOrgId ? 'ORG ACTIVE' : 'ONBOARDING REQUIS'}
        </Badge>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <Users className="text-primary mb-2 size-5" />
            <CardTitle className="text-sm font-medium">Bénéficiaires</CardTitle>
            <CardDescription className="font-mono text-2xl">—</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <FileText className="text-primary mb-2 size-5" />
            <CardTitle className="text-sm font-medium">Plans actifs</CardTitle>
            <CardDescription className="font-mono text-2xl">—</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <ChartLine className="text-primary mb-2 size-5" />
            <CardTitle className="text-sm font-medium">Attributions vestées</CardTitle>
            <CardDescription className="font-mono text-2xl">—</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <ShieldCheck className="text-primary mb-2 size-5" />
            <CardTitle className="text-sm font-medium">Alertes conformité</CardTitle>
            <CardDescription className="font-mono text-2xl">—</CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Phase 1 — Bootstrap terminé</CardTitle>
          <CardDescription>
            Le socle architectural est en place. Les modules 2 à 13 ajouteront progressivement les
            fonctionnalités métier (identité, plans, awards, signatures, cap table, IFRS 2,
            conformité, audit).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>Authentification email + mot de passe via Supabase</li>
            <li>RLS multi-tenant active sur 46 tables</li>
            <li>RBAC granulaire (41 permissions, 5 rôles standard)</li>
            <li>Audit trail immuable sur toutes les actions</li>
            <li>Thème Capiwise (indigo / emerald) + dark mode système</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
