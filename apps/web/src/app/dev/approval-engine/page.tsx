import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMyPendingApprovals, listWorkflows } from '@/server/actions/approvals';
import { Sandbox } from './sandbox';

export const metadata = { title: 'Dev — Approval Engine' };

/**
 * Sandbox /dev/approval-engine — Module 5 B2.
 *
 * Permet de tester le moteur d'approbation end-to-end avant la livraison
 * des pages /dashboard/settings/approvals (B3) et /dashboard/approvals (B4) :
 *   - Créer un workflow test (1 step ROLE='APPROVER' ou 3 steps mixed)
 *   - Attacher / détacher au plan E2E
 *   - Créer un award DRAFT puis transitionAward(*, 'PROPOSED')
 *   - Voir l'auto-transition vers PENDING_APPROVAL si workflow démarré
 *   - Approuver / rejeter / cancel les requests en cours
 *   - Voir les 20 derniers audit_events approval.*
 *
 * Server Component charge :
 *   - Workflows existants
 *   - Mes approbations PENDING (inbox simplifié)
 *   - Requests IN_PROGRESS récents
 *   - Awards récents pour pouvoir lancer un PROPOSED depuis l'UI
 *   - Audit events approval.* (limit 20)
 */
export default async function Page() {
  await requirePermission('approvals.read');
  const supabase = await createSupabaseServerClient();

  const [workflows, pendingApprovals, requestsRes, awardsRes, auditRes] = await Promise.all([
    listWorkflows({ includeInactive: true }),
    getMyPendingApprovals(),
    supabase
      .from('approval_requests')
      .select(
        'id, status, workflow_id, award_id, current_step_order, started_at, resolved_at, rejected_reason',
      )
      .order('started_at', { ascending: false })
      .limit(20),
    supabase
      .from('awards')
      .select('id, award_number, status, plan_id, beneficiary_id')
      .in('status', ['DRAFT', 'PROPOSED', 'PENDING_APPROVAL', 'APPROVED'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('audit_events')
      .select('id, event_type, resource_id, metadata, occurred_at, user_email')
      .like('event_type', 'approval.%')
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  return (
    <Sandbox
      workflows={workflows}
      pendingApprovals={pendingApprovals}
      requests={(requestsRes.data ?? []) as never}
      awards={(awardsRes.data ?? []) as never}
      auditEvents={(auditRes.data ?? []) as never}
    />
  );
}
