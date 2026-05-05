import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { OrgCard } from './org-card';

export const metadata: Metadata = {
  title: 'Choisir une organisation',
};

export default async function SelectOrgPage() {
  const user = await requireUser();

  // Liste des memberships ACTIVE du user, joins l'org pour afficher nom + roles
  const admin = getSupabaseAdminClient();
  const { data: memberships } = await admin
    .from('memberships')
    .select('id, org_id, roles, organizations(name, slug)')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

  if (!memberships || memberships.length === 0) {
    // Module 14 B2 : on passe par le routeur /onboarding (page.tsx) qui
    // décide entre /profile, /company ou /welcome selon l'état du user.
    redirect('/onboarding');
  }

  // Si une seule org ET qu'elle est DÉJÀ l'active du JWT → redirect /dashboard.
  // Sinon (ex: JWT sans active_org_id à cause de la dette #33 — hook
  // `custom_access_token_hook` instable), on AFFICHE le picker même avec
  // 1 seule org : l'user clique → `setActiveOrg` met à jour app_metadata
  // côté DB → refreshSession() → /dashboard. Sans ce check on tombe en
  // boucle infinie : proxy → /select-org → /dashboard → proxy → /select-org…
  if (memberships.length === 1 && memberships[0]!.org_id === user.activeOrgId) {
    redirect('/dashboard');
  }

  const singleMembership = memberships.length === 1;

  return (
    <div className="w-full max-w-2xl">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {singleMembership ? 'Confirmer votre organisation' : 'Choisissez une organisation'}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {singleMembership
            ? 'Cliquez pour activer votre organisation et accéder à la plateforme.'
            : `Vous êtes membre de ${memberships.length} organisations. Sélectionnez celle sur laquelle travailler.`}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {memberships.map((m) => (
          <OrgCard
            key={m.id}
            orgId={m.org_id}
            name={m.organizations?.name ?? 'Organisation sans nom'}
            slug={m.organizations?.slug ?? null}
            roles={(m.roles ?? []) as string[]}
            isActive={m.org_id === user.activeOrgId}
          />
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" /> Créer une nouvelle organisation
          </CardTitle>
          <CardDescription>Vous démarrez sur Capiwise pour un nouveau client ?</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/onboarding/company"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
          >
            Créer une organisation
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
