import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { PortalHeader } from './components/PortalHeader';
import { PortalFooter } from './components/PortalFooter';
import { PortalNav } from './components/PortalNav';

/**
 * Module 8 — Layout racine du portail bénéficiaire (`/portal/*`).
 *
 * Référence : docs/MODULE_08_BENEFICIARY_PORTAL.md §1.3 + §3.1.
 *
 * Responsabilités :
 *   1. Auth check (redirect /login si pas user)
 *   2. Charge le beneficiary record du user (1 query admin client)
 *   3. Si pas de beneficiary record → redirect /dashboard (utilisateur non
 *      bénéficiaire)
 *   4. Si profil incomplet ET pathname pas dans
 *      ['/portal/welcome', '/portal/profile/setup']
 *      → redirect /portal/welcome (force onboarding)
 *   5. Sinon : render children avec PortalHeader + main + PortalFooter +
 *      PortalNav mobile (bottom-bar)
 *
 * Définition "complete profile" alignée sur RPC
 * `get_beneficiary_portal_dashboard` (Module 8 B1) :
 *   - first_name non null
 *   - last_name non null
 *   - tax_residence_country non null (toujours set, NOT NULL en DB)
 *   - address_line_1 non null
 *   - country non null
 *
 * NB : `tax_residence_country` est NOT NULL en DB depuis Module 4 → toujours
 * "set". Le check effectif porte donc sur first_name/last_name/address_line_1/
 * country.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  const { data: beneficiary } = await admin
    .from('beneficiaries')
    .select('id, first_name, last_name, tax_residence_country, address_line_1, country')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!beneficiary) {
    // L'utilisateur n'a pas de beneficiary record actif → pas un bénéficiaire.
    redirect('/dashboard');
  }

  const hasCompleteProfile =
    !!beneficiary.first_name &&
    !!beneficiary.last_name &&
    !!beneficiary.tax_residence_country &&
    !!beneficiary.address_line_1 &&
    !!beneficiary.country;

  // Récupère le pathname courant (Next 16 : middleware-injected via header).
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isOnboardingPath = pathname === '/portal/welcome' || pathname === '/portal/profile/setup';

  if (!hasCompleteProfile && !isOnboardingPath) {
    redirect('/portal/welcome');
  }

  // Compteur notifications IN_APP non lues (badge header).
  const { count: unreadCount } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('channel', 'IN_APP')
    .is('read_at', null);

  const fullName = `${beneficiary.first_name} ${beneficiary.last_name}`.trim();

  return (
    <div className="bg-paper-100 flex min-h-screen flex-col">
      <PortalHeader
        fullName={fullName}
        email={user.email}
        unreadNotificationCount={unreadCount ?? 0}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-6 sm:px-6 md:pb-10">
        {children}
      </main>
      <PortalFooter />
      <PortalNav variant="mobile" />
    </div>
  );
}
