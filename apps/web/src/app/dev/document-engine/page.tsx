import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sandbox } from './sandbox';

export const metadata = { title: 'Dev — Document Engine' };

/**
 * Sandbox /dev/document-engine — Module 6 B2 + B3.
 *
 * B2 : génération PDF (3 templates), preview iframe.
 * B3 : envoi pour signature Yousign + statuses des sig requests en cours.
 */
export default async function Page() {
  const user = await requirePermission('documents.send_for_signature');
  if (!user.activeOrgId) return null;
  const supabase = await createSupabaseServerClient();

  const [awardsRes, templatesRes, docsRes, sigReqsRes] = await Promise.all([
    supabase
      .from('awards')
      .select('id, award_number, status, plan_id, beneficiary_id')
      .eq('org_id', user.activeOrgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('document_templates')
      .select('id, code, name, applies_to_plan_types')
      .eq('org_id', user.activeOrgId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('code'),
    supabase
      .from('document_instances')
      .select(
        'id, document_number, status, generated_at, storage_path, related_entity_id, related_entity_type',
      )
      .eq('org_id', user.activeOrgId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('signature_requests')
      .select('id, status, yousign_procedure_id, document_id, sent_at, completed_at, expiry_date')
      .eq('org_id', user.activeOrgId)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(10),
  ]);

  return (
    <Sandbox
      awards={(awardsRes.data ?? []) as never}
      templates={(templatesRes.data ?? []) as never}
      recentDocs={(docsRes.data ?? []) as never}
      recentSigRequests={(sigReqsRes.data ?? []) as never}
      currentUserEmail={user.email ?? ''}
    />
  );
}
