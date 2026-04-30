import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sandbox } from './sandbox';

export const metadata = { title: 'Dev — Document Engine' };

/**
 * Sandbox /dev/document-engine — Module 6 B2.
 *
 * Permet de tester la génération PDF des 3 templates avant l'intégration
 * Yousign B3. Charge les awards récents + templates seedés + derniers
 * documents générés.
 */
export default async function Page() {
  const user = await requirePermission('documents.send_for_signature');
  if (!user.activeOrgId) return null;
  const supabase = await createSupabaseServerClient();

  const [awardsRes, templatesRes, docsRes] = await Promise.all([
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
      .select('id, document_number, status, generated_at, storage_path, related_entity_id')
      .eq('org_id', user.activeOrgId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <Sandbox
      awards={(awardsRes.data ?? []) as never}
      templates={(templatesRes.data ?? []) as never}
      recentDocs={(docsRes.data ?? []) as never}
    />
  );
}
