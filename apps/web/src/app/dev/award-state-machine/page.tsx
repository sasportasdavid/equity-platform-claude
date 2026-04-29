import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sandbox } from './sandbox';

export const metadata = { title: 'Dev — Award State Machine' };

/**
 * Sandbox /dev/award-state-machine — Module 3b B2.
 *
 * Permet de tester toutes les transitions du state machine awards
 * visuellement, sans passer par /dashboard/awards (qui viendra en B3-B4).
 *
 * Server Component qui charge :
 *   - Les 20 derniers awards de l'org (status + plan + beneficiary)
 *   - Tous les plans non-archivés (pour le formulaire create DRAFT)
 *   - Les 20 derniers audit_events award.*
 *
 * Le composant client `Sandbox` rend l'UI + appelle les Server Actions.
 *
 * Protection : layout /dev/* fait `notFound()` en prod (NODE_ENV).
 */
export default async function Page() {
  await requirePermission('awards.read.all');
  const supabase = await createSupabaseServerClient();

  const [awardsRes, plansRes, auditRes] = await Promise.all([
    supabase
      .from('awards')
      .select(
        `id, award_number, status, units_granted, units_vested, grant_date, created_at,
         plan:plans!awards_plan_id_fkey ( id, name, plan_type, is_locked ),
         beneficiary:beneficiaries!awards_beneficiary_id_fkey ( id, first_name, last_name, email )`,
      )
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('plans')
      .select('id, name, plan_type, status, is_locked, pool_size, pool_allocated')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('audit_events')
      .select('id, event_type, resource_id, metadata, occurred_at, user_email')
      .like('event_type', 'award.%')
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  return (
    <Sandbox
      awards={awardsRes.data ?? []}
      plans={plansRes.data ?? []}
      audits={auditRes.data ?? []}
    />
  );
}
