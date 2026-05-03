import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ProfileSetupForm } from './ProfileSetupForm';

/**
 * Module 8 — Étape 2 onboarding bénéficiaire (§3.3).
 *
 * Server Component qui pré-remplit le form avec les valeurs déjà existantes
 * sur la table beneficiaries (first_name + last_name peuvent venir de Module 4
 * import CSV admin ; address_* sont vides en V1 jusqu'au self-fill).
 *
 * Submit appelle `completeBeneficiaryProfile()` (Server Action).
 *
 * Skip behavior :
 *   - Le bouton "Plus tard" redirect /portal/awards SANS sauvegarder.
 *   - Si le profil est déjà complet, on redirect /portal/awards.
 *
 * IMPORTANT : tax_residence_country est read-only V1 (bloqué par trigger
 * Module 4). Affiché en info only.
 */
export default async function PortalProfileSetupPage() {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  const { data: bene } = await admin
    .from('beneficiaries')
    .select(
      'id, first_name, last_name, address_line_1, address_line_2, postal_code, city, country, tax_residence_country',
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!bene) {
    redirect('/dashboard');
  }

  const isComplete =
    !!bene.first_name && !!bene.address_line_1 && !!bene.country && !!bene.tax_residence_country;
  if (isComplete) {
    redirect('/portal/awards');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Finalisez votre profil</h1>
        <p className="text-muted-foreground text-sm">
          Ces informations sont nécessaires pour les documents légaux liés à vos attributions.
        </p>
      </div>

      <ProfileSetupForm
        initialFirstName={bene.first_name ?? ''}
        initialLastName={bene.last_name ?? ''}
        initialAddressLine1={bene.address_line_1 ?? ''}
        initialAddressLine2={bene.address_line_2 ?? ''}
        initialPostalCode={bene.postal_code ?? ''}
        initialCity={bene.city ?? ''}
        initialCountry={bene.country ?? 'FR'}
        taxResidenceCountry={bene.tax_residence_country ?? 'FR'}
      />
    </div>
  );
}
