import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/rbac';
import { getSignatureSettings, listSignatureWorkflows } from '@/server/actions/signature-settings';
import { SignatureSettingsClient } from './signatures-client';

export const metadata: Metadata = { title: 'Paramètres de signature · Capiwise' };

/**
 * /dashboard/settings/signatures — Settings A (defaults org) + Workflows C
 * (par plan_type/template_code).
 *
 * Cf demande user 2026-05-19 : "lance a + c. l'experience utilisateur doit
 * etre excellente".
 */
export default async function Page() {
  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) redirect('/select-org');

  const [settingsRes, workflowsRes] = await Promise.all([
    getSignatureSettings(),
    listSignatureWorkflows(),
  ]);

  if (!settingsRes.ok) {
    return (
      <div className="text-destructive p-8">
        Impossible de charger les paramètres : {settingsRes.error}
      </div>
    );
  }
  if (!workflowsRes.ok) {
    return (
      <div className="text-destructive p-8">
        Impossible de charger les workflows : {workflowsRes.error}
      </div>
    );
  }

  return (
    <SignatureSettingsClient
      initialSettings={settingsRes.settings}
      initialWorkflows={workflowsRes.workflows}
    />
  );
}
