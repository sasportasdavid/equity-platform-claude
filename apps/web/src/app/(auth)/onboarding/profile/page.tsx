import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveOnboardingState } from '@/server/actions/onboarding';
import { OnboardingStepper } from '../_components/stepper';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = {
  title: 'Onboarding · Votre profil',
};

/**
 * Module 14 PR §B2 — Onboarding étape 1 : profil utilisateur.
 *
 * Si le user a déjà rempli son profile (`profileFilled === true`), on
 * skip cette étape (redirect vers la suivante via /onboarding routeur).
 */
export default async function OnboardingProfilePage() {
  const state = await resolveOnboardingState();
  // **Bug "boucle /onboarding ↔ /onboarding/profile ↔ /select-org"
  // (fix 2026-05-19)** : ne redirige vers /dashboard QUE si les 3
  // invariants sont satisfaits. Sinon (ex: profil incomplet ou pas d'org
  // mais `onboarding_completed_at` set en DB — état orphelin), on laisse
  // l'user filler le form. Sans ça : /onboarding/profile → /dashboard →
  // proxy /select-org → 0 memb → /onboarding → re-redirige ici → boucle.
  if (state.completed && state.profileFilled && state.hasOrg) redirect('/dashboard');
  if (state.profileFilled) redirect('/onboarding');

  return (
    <div className="w-full max-w-xl space-y-6">
      <OnboardingStepper currentStep={1} />
      <ProfileForm initialFirstName="" initialLastName="" initialRoleTitle={state.roleTitle} />
    </div>
  );
}
