import Link from 'next/link';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Dev — Portail bénéficiaire' };

/**
 * Sandbox /dev/portal — Module 8 B2.
 *
 * Liste les bénéficiaires "portal-ready" (avec user_id non null) + bouton qui
 * ouvre /portal/welcome dans un nouvel onglet pour test visuel.
 *
 * V1 simple : pas d'impersonation côté DB (le test user doit être logué via
 * magic link). La sandbox sert juste de checklist pour B5 E2E.
 */
export default async function PortalSandboxPage() {
  const admin = getSupabaseAdminClient();

  // Bénéficiaires actifs avec un user_id (= portal-ready)
  const { data: portalReady } = await admin
    .from('beneficiaries')
    .select(
      'id, first_name, last_name, email, address_line_1, country, tax_residence_country, user_id, org_id',
    )
    .not('user_id', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  // Bénéficiaires sans user_id (à inviter pour devenir portal-ready)
  const { data: needsInvite } = await admin
    .from('beneficiaries')
    .select('id, first_name, last_name, email')
    .is('user_id', null)
    .is('deleted_at', null)
    .limit(10);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Sandbox — Portail bénéficiaire</h1>
        <p className="text-muted-foreground text-sm">
          Module 8 B2 — Onboarding 2 étapes + layout. Cette sandbox liste les bénéficiaires
          portal-ready et permet d&apos;ouvrir le portail dans un nouvel onglet pour un test visuel
          rapide.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Liens directs (à tester en utilisateur loggué)</h2>
        <ul className="space-y-1.5 text-sm [&>li]:list-inside [&>li]:list-disc">
          <li>
            <Link href="/portal" target="_blank" className="text-primary underline">
              /portal
            </Link>{' '}
            — landing (redirect vers /portal/awards si profil complet)
          </li>
          <li>
            <Link href="/portal/welcome" target="_blank" className="text-primary underline">
              /portal/welcome
            </Link>{' '}
            — onboarding étape 1
          </li>
          <li>
            <Link href="/portal/profile/setup" target="_blank" className="text-primary underline">
              /portal/profile/setup
            </Link>{' '}
            — onboarding étape 2 (form)
          </li>
          <li>
            <Link href="/portal/awards" target="_blank" className="text-primary underline">
              /portal/awards
            </Link>{' '}
            — liste des attributions (cards summary)
          </li>
          <li>
            <Link
              href="/portal/awards/0ebbbf8d-c805-4084-8392-aa501e119c53"
              target="_blank"
              className="text-primary underline"
            >
              /portal/awards/AWD-2026-0007
            </Link>{' '}
            — détail award (synthèse + vesting + documents)
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Bénéficiaires portal-ready ({portalReady?.length ?? 0})
        </h2>
        <p className="text-muted-foreground text-xs">
          Ces utilisateurs ont un user_id → ils peuvent se loguer et accéder au portail. Pour tester
          l&apos;onboarding, vide les champs address_line_1 / country puis ouvre /portal.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-muted-foreground text-left text-xs">
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Profil complet</th>
                <th className="px-3 py-2 font-medium">Pays</th>
                <th className="px-3 py-2 font-medium">Résidence fiscale</th>
              </tr>
            </thead>
            <tbody>
              {portalReady && portalReady.length > 0 ? (
                portalReady.map((b) => {
                  const complete =
                    !!b.first_name &&
                    !!b.address_line_1 &&
                    !!b.country &&
                    !!b.tax_residence_country;
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2">
                        {b.first_name} {b.last_name}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{b.email}</td>
                      <td className="px-3 py-2">
                        {complete ? (
                          <span className="text-emerald-600">✓ complet</span>
                        ) : (
                          <span className="text-amber-600">⚠ incomplet</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{b.country ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {b.tax_residence_country ?? '—'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-3 py-4 text-center">
                    Aucun bénéficiaire avec user_id.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Bénéficiaires sans user_id ({needsInvite?.length ?? 0})
        </h2>
        <p className="text-muted-foreground text-xs">
          Pour les rendre portal-ready, utiliser le bouton &quot;Inviter&quot; côté
          /dashboard/beneficiaries.
        </p>
        {needsInvite && needsInvite.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {needsInvite.map((b) => (
              <li key={b.id} className="text-muted-foreground">
                {b.first_name} {b.last_name} — {b.email}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Aucun.</p>
        )}
      </section>

      <section className="text-muted-foreground space-y-2 border-t pt-6 text-xs">
        <p>
          <strong>Note :</strong> la sandbox n&apos;impersonne pas un user — elle ouvre les routes
          /portal sous l&apos;identité du caller actuel. Pour tester un autre user, se déconnecter
          puis se reconnecter avec son email (magic link).
        </p>
      </section>
    </div>
  );
}
