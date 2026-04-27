'use client';

import { useRouter } from 'next/navigation';
import { PlanWizard } from '@/components/plans/wizard/PlanWizard';
import { createPlan, loadDraftPlan, saveDraftPlan } from '@/server/actions/plans';

/**
 * Wrapper client de `PlanWizard` qui branche les Server Actions du
 * Module 3a (`createPlan` / `saveDraftPlan` / `loadDraftPlan`) et la
 * navigation post-création.
 *
 * `createPlan` est actuellement un STUB qui valide le payload Zod +
 * écrit en `audit_events` + retourne un planId temporaire — le RPC
 * PostgreSQL `create_plan_full` qui insère les 9 tables métier
 * atomiquement (cf. MODULE_03A_PLANS.md §3.1) sera livré dans une
 * migration dédiée. Le wizard est néanmoins fonctionnel end-to-end et
 * le auto-save serveur est branché.
 */
export function NewPlanWizard() {
  const router = useRouter();
  return (
    <PlanWizard
      onSubmit={async (data) => {
        const result = await createPlan(data);
        if (result.ok) {
          // Une fois le RPC livré : router.push(`/dashboard/plans/${result.planId}`)
          router.refresh();
        }
        return result;
      }}
      saveDraft={async (data) => saveDraftPlan(data)}
      loadServerDraft={async () => loadDraftPlan()}
    />
  );
}
