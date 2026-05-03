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
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">ÉTAPE 2 · ONBOARDING</p>
        <h1 className="text-h1 text-ink-900">
          Finalisez <span className="serif-italic text-brass-500">votre profil</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-2xl text-sm leading-relaxed">
          Ces informations sont nécessaires pour les documents légaux liés à vos attributions
          (contrats, exercice, sortie). Elles ne seront utilisées qu&apos;à cette fin.
        </p>
      </header>

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
