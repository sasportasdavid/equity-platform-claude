'use client';

import { useRouter } from 'next/navigation';
import { PlanWizard } from '@/components/plans/wizard/PlanWizard';
import { createPlan, loadDraftPlan, saveDraftPlan } from '@/server/actions/plans';

/**
 * Wrapper client de `PlanWizard` qui branche les Server Actions du
 * Module 3a (`createPlan` / `saveDraftPlan` / `loadDraftPlan`) et la
 * navigation post-création.
 *
 * Sur succès : redirection vers `/dashboard/plans/[id]` (page détail
 * placeholder en B2 — vue complète arrive en B4).
 *
 * Sur échec : la PlanWizard affiche `result.error` dans le footer
 * (cf. WizardFooter, branche submitState.error).
 */
export function NewPlanWizard() {
  const router = useRouter();
  return (
    <PlanWizard
      onSubmit={async (data) => {
        const result = await createPlan(data);
        if (result.ok) {
          router.push(`/dashboard/plans/${result.planId}`);
        }
        // Re-shape vers le contrat attendu par PlanWizard (sans companyId /
        // complianceWarnings — on les garde côté server pour audit).
        return result.ok
          ? { ok: true as const, planId: result.planId }
          : { ok: false as const, error: result.error };
      }}
      saveDraft={async (data) => saveDraftPlan(data)}
      loadServerDraft={async () => loadDraftPlan()}
    />
  );
}
