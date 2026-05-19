import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ROLE_LABELS, type Role } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TitleRule } from '@/components/shared/title-rule';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveOnboardingState } from '@/server/actions/onboarding';
import { OnboardingStepper } from '../_components/stepper';
import { CompleteOnboardingButton } from './complete-button';

export const metadata: Metadata = {
  title: 'Onboarding · Bienvenue',
};

/**
 * Module 14 PR §B2 — Onboarding étape 4 (welcome) avec étape 3
 * (récap permissions) inline au-dessus du CTA final.
 *
 * Pré-conditions : profile filled + ≥1 membership ACTIVE. Sinon
 * redirect vers la 1re étape manquante.
 *
 * UX : on affiche les rôles attribués à l'org active + liste agrégée
 * des CATÉGORIES de permissions accordées (pas le détail granulaire ;
 * V1.X = page profil dédiée pour drill-down).
 */
export default async function OnboardingWelcomePage() {
  const state = await resolveOnboardingState();
  // Voir commentaire dans /onboarding/profile/page.tsx — invariants
  // complets requis pour shortcut /dashboard (sinon boucle).
  if (state.completed && state.profileFilled && state.hasOrg) redirect('/dashboard');
  if (!state.profileFilled) redirect('/onboarding/profile');
  if (!state.hasOrg) redirect('/onboarding/company');

  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  // Récupère les rôles du membership ACTIVE de l'org active. Si l'org
  // active n'est pas set (dette #33 hook), on prend la 1re ACTIVE.
  let roles: Role[] = [];
  if (user.activeOrgId) {
    const { data: membership } = await admin
      .from('memberships')
      .select('roles')
      .eq('user_id', user.id)
      .eq('org_id', user.activeOrgId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    roles = (membership?.roles ?? []) as Role[];
  }
  if (roles.length === 0) {
    const { data: anyMembership } = await admin
      .from('memberships')
      .select('roles')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle();
    roles = (anyMembership?.roles ?? []) as Role[];
  }

  // Catégories de permissions agrégées via role_permissions ↔ permissions_catalog
  let categories: string[] = [];
  if (roles.length > 0) {
    const { data: rolePerms } = await admin
      .from('role_permissions')
      .select('permissions_catalog!inner(category)')
      .in('role', roles);
    const catSet = new Set<string>();
    for (const row of rolePerms ?? []) {
      const cat = (row as unknown as { permissions_catalog: { category: string } | null })
        .permissions_catalog?.category;
      if (cat) catSet.add(cat);
    }
    categories = Array.from(catSet).sort();
  }

  return (
    <div className="w-full max-w-xl space-y-6">
      <OnboardingStepper currentStep={4} />

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            Vous êtes prêt·e.{' '}
            <span className="serif-italic text-brass-500">Voici ce que vous pouvez faire.</span>
          </CardTitle>
          <TitleRule />
          <CardDescription className="pt-1">
            Voici un récapitulatif des rôles et permissions attribués à votre compte. Vous pourrez
            les retrouver à tout moment dans vos paramètres.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <section>
            <h2 className="text-muted-foreground mb-2 font-mono text-xs uppercase tracking-wider">
              Vos rôles
            </h2>
            <div className="flex flex-wrap gap-1.5" data-testid="onboarding-roles">
              {roles.length === 0 ? (
                <span className="text-muted-foreground text-sm">Aucun rôle attribué</span>
              ) : (
                roles.map((r) => (
                  <Badge key={r} variant="secondary" data-testid={`onboarding-role-${r}`}>
                    {ROLE_LABELS[r] ?? r}
                  </Badge>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-muted-foreground mb-2 font-mono text-xs uppercase tracking-wider">
              Vos domaines d’action
            </h2>
            {categories.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune permission attribuée pour cette organisation.
              </p>
            ) : (
              <ul
                className="text-foreground grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2"
                data-testid="onboarding-categories"
              >
                {categories.map((cat) => (
                  <li
                    key={cat}
                    className="border-muted-foreground/15 bg-background/50 flex items-center gap-2 rounded border px-2.5 py-1.5"
                  >
                    <span className="bg-brass-500 size-1.5 rounded-full" aria-hidden />
                    <span className="text-xs">{cat}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="border-t pt-4">
            <CompleteOnboardingButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
