'use client';

import { useRouter } from 'next/navigation';
import type { PlanWizardData } from '@equity/shared';
import { PlanWizard } from '@/components/plans/wizard/PlanWizard';

/**
 * Wrapper client de `PlanWizard` qui branche les Server Actions et la
 * navigation post-création.
 *
 * Les Server Actions `createPlan` / `saveDraftPlan` / `loadDraftPlan`
 * seront connectées au commit 4. Pour l'instant, on utilise des mocks
 * légers qui valident le payload et redirigent vers /dashboard avec un
 * message — utile pour valider la route + la protection auth + le
 * routing global avant que le backend soit branché.
 *
 * Une fois le commit 4 livré, remplacer les mocks par les imports :
 *   import { createPlan, saveDraftPlan, loadDraftPlan } from '@/server/actions/plans';
 */
export function NewPlanWizard() {
  const router = useRouter();

  return (
    <PlanWizard
      onSubmit={async (data: PlanWizardData) => {
        // Mock temporaire — sera remplacé par `createPlan(data)` Server Action.
        console.log('[plans/new] onSubmit (mock)', data);
        await new Promise((r) => setTimeout(r, 600));
        const planId = `plan-pending-${Math.random().toString(36).slice(2, 10)}`;
        // Une fois le backend branché : router.push(`/dashboard/plans/${planId}`)
        router.refresh();
        return { ok: true, planId };
      }}
      saveDraft={async (data: PlanWizardData) => {
        // Mock temporaire — sera remplacé par `saveDraftPlan(data)`.
        await new Promise((r) => setTimeout(r, 200));
        console.log('[plans/new] saveDraft (mock) — keys:', Object.keys(data ?? {}).length);
        return { ok: true, savedAt: new Date().toISOString() };
      }}
    />
  );
}
