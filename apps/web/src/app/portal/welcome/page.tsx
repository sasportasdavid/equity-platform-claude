import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { ContinueOnboardingButton } from './ContinueButton';

/**
 * Module 8 — Étape 1 onboarding bénéficiaire (§3.2).
 *
 * Server Component qui charge :
 *   - L'org du bénéficiaire (depuis le RPC `get_beneficiary_portal_dashboard`)
 *   - Le nombre d'awards GRANTED
 *
 * Affiche un message de bienvenue éducatif (sans jargon) et un bouton
 * "Continuer →" qui mène vers /portal/profile/setup.
 *
 * Si le profil est déjà complet (l'utilisateur revient sur cette page),
 * on redirect vers /portal/awards.
 */
export default async function PortalWelcomePage() {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  // Charge le beneficiary + org via le RPC SECURITY DEFINER (B1).
  // On bypass via admin pour pouvoir l'appeler côté Server Component (le
  // RPC vérifie auth.uid() côté DB — mais ici on lit juste pour l'affichage,
  // pas de modification). Préférence : query directe pour simplicité.
  const { data: bene } = await admin
    .from('beneficiaries')
    .select('id, org_id, first_name, address_line_1, country, tax_residence_country')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!bene) {
    redirect('/dashboard');
  }

  // Si déjà complet, skip → portail
  const isComplete =
    !!bene.first_name && !!bene.address_line_1 && !!bene.country && !!bene.tax_residence_country;
  if (isComplete) {
    redirect('/portal/awards');
  }

  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', bene.org_id)
    .maybeSingle();

  const { count: awardsCount } = await admin
    .from('awards')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiary_id', bene.id)
    .eq('status', 'GRANTED')
    .is('deleted_at', null);

  const orgName = org?.name ?? 'votre société';
  const awards = awardsCount ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="space-y-6 p-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Bienvenue sur Capiwise</h1>
            <p className="text-muted-foreground leading-relaxed">
              {orgName} vous a attribué{' '}
              <span className="text-foreground font-medium">
                {awards} plan{awards > 1 ? 's' : ''}
              </span>{' '}
              d&apos;actionnariat salarié.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Avant de découvrir vos attributions, nous avons besoin de quelques informations
              personnelles pour finaliser votre profil.
            </p>
          </div>

          <hr className="border-border/40" />

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">
              Qu&apos;est-ce qu&apos;un plan d&apos;actionnariat salarié&nbsp;?
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Un plan vous permet d&apos;acquérir progressivement des actions de votre société, soit
              gratuitement (AGA), soit en exerçant un droit d&apos;achat à un prix préférentiel
              (BSPCE, Stock Options).
            </p>
            <p className="text-muted-foreground leading-relaxed">En pratique :</p>
            <ul className="text-muted-foreground space-y-1.5 pl-5 leading-relaxed [&>li]:list-disc">
              <li>Vous recevez un nombre d&apos;unités initialement.</li>
              <li>Elles deviennent acquises au fil du temps (vesting).</li>
              <li>
                Si applicable, vous pouvez les exercer pour devenir actionnaire de la société.
              </li>
            </ul>
          </div>

          <hr className="border-border/40" />

          <div className="flex justify-end">
            <ContinueOnboardingButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
