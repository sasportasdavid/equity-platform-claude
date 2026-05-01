import { redirect } from 'next/navigation';

/**
 * Module 8 — Landing page du portail.
 *
 * Redirect vers /portal/awards par défaut. Le layout parent fait déjà l'auth
 * + check beneficiary + redirect onboarding si profil incomplet.
 */
export default function PortalIndex() {
  redirect('/portal/awards');
}
