import { redirect } from 'next/navigation';
import { resolveOnboardingState } from '@/server/actions/onboarding';

/**
 * Module 14 PR #43 §B2 — Routeur d'onboarding.
 *
 * Server Component qui lit l'état actuel du user via
 * `resolveOnboardingState` puis redirige vers la 1re étape non complétée :
 *
 *   - Si `completed`         → /dashboard
 *   - Si `!profileFilled`    → /onboarding/profile
 *   - Si `!hasOrg`           → /onboarding/company
 *   - Sinon (profil + org OK) → /onboarding/welcome
 *
 * Pas de UI à cette route (pure redirect). Si le user atterrit
 * directement sur /onboarding sans état JWT, requireUser() le
 * redirige vers /login d'abord (cf. resolveOnboardingState).
 */
export default async function OnboardingRouterPage() {
  const state = await resolveOnboardingState();
  // `completed` seul ne suffit pas : si la membership a été nettoyée en DB
  // alors que `onboarding_completed_at` est resté set, on tombait en boucle
  // /dashboard ↔ /select-org ↔ /onboarding (proxy refuse /dashboard sans
  // active_org_id). On exige donc l'invariant complet (profil + org) avant
  // de déclarer l'onboarding terminé — sinon on rejoue les étapes manquantes.
  if (state.completed && state.profileFilled && state.hasOrg) redirect('/dashboard');
  if (!state.profileFilled) redirect('/onboarding/profile');
  if (!state.hasOrg) redirect('/onboarding/company');
  redirect('/onboarding/welcome');
}
