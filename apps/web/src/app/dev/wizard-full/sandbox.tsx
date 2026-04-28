'use client';

import { PlanWizard } from '@/components/plans/wizard/PlanWizard';

/**
 * Sandbox `/dev/wizard-full` — wizard complet en autonomie, sans Server
 * Action ni route prod. `onSubmit` simule un appel back avec un délai
 * 800 ms puis retourne un planId factice.
 *
 * `saveDraft` mock pour démontrer le statut « Sauvegarde… » du footer
 * (latence simulée 400 ms). Utile pour vérifier visuellement le pattern
 * debounce localStorage + Server Action.
 */
export function WizardFullSandbox() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 space-y-1">
        <p className="text-muted-foreground font-mono text-xs uppercase">/dev — sandbox</p>
        <h1 className="text-2xl font-semibold tracking-tight">Wizard complet</h1>
        <p className="text-muted-foreground text-sm">
          Container PlanWizard avec FormProvider unique + sidebar navigation + footer sticky +
          auto-save mock (localStorage + Server Action simulée). La route /dashboard/plans/new
          (commit 3) utilisera ce composant avec les vraies Server Actions du commit 4.
        </p>
      </header>
      <PlanWizard
        onSubmit={async (data) => {
          // Mock : log payload + délai 800ms + retour planId factice
          console.log('[wizard-full sandbox] onSubmit', data);
          await new Promise((r) => setTimeout(r, 800));
          const planId = `plan-mock-${Math.random().toString(36).slice(2, 10)}`;
          return { ok: true, planId };
        }}
        saveDraft={async (data) => {
          // Mock : 400ms de latence pour visualiser l'état "Sauvegarde…"
          await new Promise((r) => setTimeout(r, 400));
          console.log(
            '[wizard-full sandbox] saveDraft tick',
            Object.keys(data ?? {}).length,
            'top-level keys',
          );
          return { ok: true, savedAt: new Date().toISOString() };
        }}
      />
    </div>
  );
}
