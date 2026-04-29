import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sandbox } from './sandbox';

export const metadata = { title: 'Dev — Beneficiary Lifecycle' };

/**
 * Sandbox /dev/beneficiary-lifecycle — Module 4 B2.
 *
 * Permet de tester toutes les transitions du lifecycle bénéficiaire +
 * l'invitation magic link + l'archive (avec/sans awards actifs) avant
 * que la page liste /dashboard/beneficiaries soit livrée en B3.
 *
 * Server Component qui charge :
 *   - Les 20 derniers bénéficiaires de l'org actuelle (status, dates, awards)
 *   - Les 20 derniers audit_events où resource_type = 'BENEFICIARY'
 *
 * Le composant client `Sandbox` rend l'UI + appelle les Server Actions.
 *
 * Protection : layout /dev/* fait `notFound()` en prod (NODE_ENV).
 */
export default async function Page() {
  await requirePermission('beneficiaries.read');
  const supabase = await createSupabaseServerClient();

  const [benesRes, auditRes] = await Promise.all([
    supabase
      .from('beneficiaries')
      .select(
        `id, first_name, last_name, email, status, beneficiary_type,
         hire_date, termination_date, lifecycle_changed_at, lifecycle_change_reason,
         invited_at, invitation_count, first_login_at, deleted_at, created_at`,
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('audit_events')
      .select('id, event_type, resource_id, metadata, occurred_at, user_email')
      .eq('resource_type', 'BENEFICIARY')
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  // Pour chaque bénéficiaire, count les awards actifs (séparément pour
  // garder la query simple — V1 sandbox, pas optimisé)
  const benes = benesRes.data ?? [];
  const benesWithAwardCount = await Promise.all(
    benes.map(async (b) => {
      const { count } = await supabase
        .from('awards')
        .select('id', { count: 'exact', head: true })
        .eq('beneficiary_id', b.id)
        .not('status', 'in', '(CANCELLED,FORFEITED,EXPIRED,FULLY_EXERCISED)')
        .is('deleted_at', null);
      return { ...b, activeAwardsCount: count ?? 0 };
    }),
  );

  return <Sandbox beneficiaries={benesWithAwardCount} auditEvents={auditRes.data ?? []} />;
}
