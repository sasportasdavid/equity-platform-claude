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
  if (state.completed) redirect('/dashboard');
  if (state.profileFilled) redirect('/onboarding');

  return (
    <div className="w-full max-w-xl space-y-6">
      <OnboardingStepper currentStep={1} />
      <ProfileForm initialFirstName="" initialLastName="" initialRoleTitle={state.roleTitle} />
    </div>
  );
}
