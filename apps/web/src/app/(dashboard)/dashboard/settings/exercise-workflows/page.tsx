import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { requirePermission } from '@/lib/auth/rbac';
import { listExerciseWorkflowsReadOnly } from '@/server/queries/exercises-admin';
import { formatEuro } from '@/components/exercises/format-helpers';

export const metadata: Metadata = {
  title: "Workflows d'exercice · Capiwise",
};

export default async function ExerciseWorkflowsPage() {
  await requirePermission('exercise_workflows.read');

  const workflows = await listExerciseWorkflowsReadOnly();

  return (
    <div className="space-y-8" data-testid="admin-exercise-workflows">
      <header>
        <p className="text-overline text-brass-500">CONFIGURATION · WORKFLOW EXERCISE</p>
        <h1 className="text-h2 text-ink-900 mt-1 font-medium">Workflows d&apos;exercice</h1>
        <p className="text-ink-500 mt-2 max-w-2xl text-sm">
          Configuration cumulative des paliers d&apos;approbation pour les demandes d&apos;exercice.
          Chaque palier ajoute son approbateur selon le montant.
        </p>
      </header>

      {/* Banner READ-ONLY */}
      <div
        className="rounded-md border border-amber-300 bg-amber-50 p-4"
        data-testid="readonly-banner"
      >
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 text-amber-700" strokeWidth={2} />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Configuration en lecture seule (V1)</p>
            <p className="mt-1 leading-relaxed">
              L&apos;édition des paliers est disponible en V2 (page admin dédiée). Pour modifier la
              configuration en V1, contactez l&apos;équipe Capiwise (modification SQL directe).
            </p>
          </div>
        </div>
      </div>

      {workflows.length === 0 ? (
        <div className="border-paper-300 bg-paper-50 rounded-lg border p-12 text-center">
          <p className="text-overline text-ink-500">AUCUN · WORKFLOW</p>
          <p className="text-ink-900 mt-2 text-base">Aucun workflow EXERCISE_REQUEST configuré.</p>
          <p className="text-ink-500 mt-2 text-sm">
            Le seed Module 9 B1 crée automatiquement un workflow par défaut pour chaque
            organisation. Si rien ne s&apos;affiche, contactez l&apos;équipe.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {workflows.map((wf) => (
            <article
              key={wf.id}
              className="border-paper-300 bg-paper-50 rounded-lg border p-6"
              data-testid={`workflow-card-${wf.id}`}
            >
              <header className="border-paper-300 mb-4 flex items-baseline justify-between gap-3 border-b pb-4">
                <div>
                  <p className="text-overline text-brass-500">WORKFLOW</p>
                  <h2 className="text-h4 text-ink-900 mt-1 font-medium">{wf.name}</h2>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {wf.is_default && (
                    <span className="bg-brass-100 text-brass-700 border-brass-500/40 inline-flex rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      Par défaut
                    </span>
                  )}
                  <span className="text-ink-500 text-xs">
                    {wf.is_active ? 'Actif' : 'Désactivé'}
                  </span>
                </div>
              </header>

              {wf.steps.length === 0 ? (
                <p className="text-ink-500 text-sm italic">Aucun palier configuré.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-overline text-ink-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-normal">Palier</th>
                      <th className="px-3 py-2 text-left font-normal">Étape</th>
                      <th className="px-3 py-2 text-left font-normal">Approbateur</th>
                      <th className="px-3 py-2 text-right font-normal">Seuil min</th>
                      <th className="px-3 py-2 text-right font-normal">Seuil max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-paper-300 divide-y">
                    {wf.steps.map((s) => (
                      <tr key={s.step_order}>
                        <td className="text-ink-900 px-3 py-2 font-mono">{s.step_order}</td>
                        <td className="text-ink-900 px-3 py-2">{s.step_name}</td>
                        <td className="text-ink-500 px-3 py-2 text-xs">
                          <span className="font-mono">{s.approver_role ?? '—'}</span>
                          <span className="ml-2">· {s.approver_type}</span>
                        </td>
                        <td className="text-ink-900 px-3 py-2 text-right font-mono tabular-nums">
                          {s.amount_threshold_min !== null
                            ? formatEuro(s.amount_threshold_min)
                            : '—'}
                        </td>
                        <td className="text-ink-900 px-3 py-2 text-right font-mono tabular-nums">
                          {s.amount_threshold_max !== null
                            ? formatEuro(s.amount_threshold_max)
                            : 'illimité'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
