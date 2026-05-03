import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ProfileEditForm } from './ProfileEditForm';

/**
 * Module 8 B5 — Page édition profil bénéficiaire (§4.5).
 *
 * Server Component qui pré-remplit le form avec les valeurs actuelles.
 *
 * Champs read-only V1 (admin-only ou identité contractuelle) :
 *   - email
 *   - first_name + last_name
 *   - tax_residence_country (bloqué par trigger Module 4)
 *
 * Champs modifiables :
 *   - phone (chiffré, via RPC dédié)
 *   - address_line_1, address_line_2, postal_code, city, country
 *
 * Le layout `/portal/*` (Module 8 B2) gère déjà l'auth + le check
 * beneficiary.
 */
export default async function PortalProfilePage() {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  const { data: bene } = await admin
    .from('beneficiaries')
    .select(
      'id, first_name, last_name, email, address_line_1, address_line_2, postal_code, city, country, tax_residence_country, hire_date, beneficiary_type, contract_type',
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!bene) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8" data-testid="portal-profile-page">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">VOTRE PROFIL</p>
        <h1 className="text-h1 text-ink-900">
          Vos <span className="serif-italic text-brass-500">coordonnées</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-2xl text-sm leading-relaxed">
          Mettez à jour vos coordonnées personnelles. Pour modifier votre identité (nom, prénom,
          résidence fiscale), contactez votre service RH.
        </p>
      </header>

      <ProfileEditForm
        firstName={bene.first_name ?? ''}
        lastName={bene.last_name ?? ''}
        email={bene.email}
        taxResidenceCountry={bene.tax_residence_country ?? 'FR'}
        beneficiaryType={bene.beneficiary_type ?? null}
        contractType={bene.contract_type ?? null}
        hireDate={bene.hire_date ?? null}
        initialAddressLine1={bene.address_line_1 ?? ''}
        initialAddressLine2={bene.address_line_2 ?? ''}
        initialPostalCode={bene.postal_code ?? ''}
        initialCity={bene.city ?? ''}
        initialCountry={bene.country ?? 'FR'}
      />
    </div>
  );
}
