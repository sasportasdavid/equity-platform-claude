import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveOnboardingState } from '@/server/actions/onboarding';
import { OnboardingStepper } from '../_components/stepper';
import { CompanyForm } from './company-form';

export const metadata: Metadata = {
  title: 'Onboarding · Votre organisation',
};

/**
 * Module 14 PR §B2 — Onboarding étape 2 : organisation (rejoindre OU créer).
 *
 * Si pas de profile filled, redirect → étape 1.
 * Si déjà ≥1 membership ACTIVE, redirect → /onboarding/welcome.
 */
export default async function OnboardingCompanyPage() {
  const state = await resolveOnboardingState();
  // Voir commentaire dans /onboarding/profile/page.tsx — invariants
  // complets requis pour shortcut /dashboard (sinon boucle).
  if (state.completed && state.profileFilled && state.hasOrg) redirect('/dashboard');
  if (!state.profileFilled) redirect('/onboarding/profile');
  if (state.hasOrg) redirect('/onboarding/welcome');

  return (
    <div className="w-full max-w-xl space-y-6">
      <OnboardingStepper currentStep={2} />
      <CompanyForm />
    </div>
  );
}
